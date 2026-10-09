import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import z from "zod";
import { writeAuditLog } from "../../lib/audit";
import { ApiError } from "../../lib/errors";
import { pageMeta, pageWindow, paginationSchema, parseQuery } from "../../lib/validation";
import { currentAuth, requireRoles } from "../../middleware/authenticate";

const publicSelect = {
  id: true,
  institutionId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const createUserSchema = z.object({
  institutionId: z.string().uuid(),
  email: z
    .string()
    .email()
    .max(320)
    .transform((email) => email.trim().toLowerCase()),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  password: z
    .string()
    .min(12)
    .max(128)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
      message: "Password must be at most 72 bytes",
    }),
  role: z.enum([UserRole.TEACHER, UserRole.STUDENT]).optional(),
});

const listSchema = z.object({
  ...paginationSchema.shape,
  institutionId: z.string().uuid().optional(),
  role: z.enum([UserRole.TEACHER, UserRole.STUDENT]).optional(),
});

export function createUserRouter(database: PrismaClient, forcedRole?: "STUDENT" | "TEACHER") {
  const router = Router();
  router.use(requireRoles(UserRole.SUPER_ADMIN));

  router.get("/", async (request, response) => {
    const query = parseQuery(listSchema, request);
    const role = forcedRole ?? query.role;
    const where: Prisma.UserWhereInput = {
      ...(query.institutionId ? { institutionId: query.institutionId } : {}),
      ...(role ? { role } : {}),
    };
    const [users, total] = await Promise.all([
      database.user.findMany({
        where,
        select: publicSelect,
        ...pageWindow(query),
        orderBy: { createdAt: "desc" },
      }),
      database.user.count({ where }),
    ]);
    response.json({
      data: users,
      pagination: pageMeta(query.page, query.pageSize, total),
    });
  });

  router.post("/", async (request, response) => {
    const input = createUserSchema.parse(request.body);
    const requestedRole = forcedRole ?? input.role;
    if (!requestedRole || (forcedRole && input.role && forcedRole !== input.role)) {
      throw new ApiError(400, "INVALID_ROLE", "A valid teacher or student role is required");
    }

    const institution = await database.institution.findUnique({
      where: { id: input.institutionId },
      select: { id: true },
    });
    if (!institution) {
      throw new ApiError(404, "INSTITUTION_NOT_FOUND", "The institution was not found");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const actor = currentAuth(response);
    const user = await database.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          institutionId: institution.id,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
          role: requestedRole,
          ...(requestedRole === UserRole.STUDENT
            ? { studentProfile: { create: {} } }
            : { teacherProfile: { create: {} } }),
        },
        select: publicSelect,
      });
      await writeAuditLog(transaction, {
        institutionId: institution.id,
        actorId: actor.userId,
        action: `user.${requestedRole.toLowerCase()}.created`,
        entityType: "User",
        entityId: created.id,
        metadata: { role: requestedRole },
      });
      return created;
    });
    response.status(201).json({ data: user });
  });

  return router;
}
