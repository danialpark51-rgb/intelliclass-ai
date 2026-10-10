import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import z from "zod";
import { writeAuditLog } from "../../lib/audit";
import { ApiError } from "../../lib/errors";
import { pageMeta, pageWindow, paginationSchema, parseId, parseQuery } from "../../lib/validation";
import {
  currentAuth,
  requireInstitutionId,
  requireRoles,
} from "../../middleware/authenticate";

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
  role: z
    .enum([UserRole.INSTITUTION_ADMIN, UserRole.TEACHER, UserRole.STUDENT])
    .optional(),
});

const listSchema = z.object({
  ...paginationSchema.shape,
  institutionId: z.string().uuid().optional(),
  role: z
    .enum([UserRole.INSTITUTION_ADMIN, UserRole.TEACHER, UserRole.STUDENT])
    .optional(),
});
const updateUserSchema = z
  .object({
    email: z.string().email().max(320).transform((email) => email.trim().toLowerCase()).optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
  })
  .refine((input) => Object.keys(input).length > 0);

export function createUserRouter(database: PrismaClient, forcedRole?: "STUDENT" | "TEACHER") {
  const router = Router();
  router.use(requireRoles(UserRole.SUPER_ADMIN, UserRole.INSTITUTION_ADMIN));

  router.get("/", async (request, response) => {
    const query = parseQuery(listSchema, request);
    const actor = currentAuth(response);
    const institutionId =
      actor.role === UserRole.SUPER_ADMIN
        ? query.institutionId
        : requireInstitutionId(actor);
    if (
      actor.role === UserRole.INSTITUTION_ADMIN &&
      query.institutionId &&
      query.institutionId !== institutionId
    ) {
      throw new ApiError(403, "FORBIDDEN", "You cannot view users from another institution");
    }
    const role = forcedRole ?? query.role;
    const where: Prisma.UserWhereInput = {
      ...(institutionId ? { institutionId } : {}),
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

  router.get("/:id", async (request, response) => {
    const actor = currentAuth(response);
    const id = parseId(request.params["id"]);
    const user = await database.user.findFirst({
      where: {
        id,
        ...(actor.role === UserRole.INSTITUTION_ADMIN
          ? { institutionId: requireInstitutionId(actor) }
          : {}),
        ...(forcedRole ? { role: forcedRole } : {}),
      },
      select: publicSelect,
    });
    if (!user) throw new ApiError(404, "USER_NOT_FOUND", "The account was not found");
    response.json({ data: user });
  });

  router.post("/", async (request, response) => {
    const input = createUserSchema.parse(request.body);
    const actor = currentAuth(response);
    if (
      actor.role === UserRole.INSTITUTION_ADMIN &&
      input.institutionId !== requireInstitutionId(actor)
    ) {
      throw new ApiError(403, "FORBIDDEN", "You can only manage accounts in your institution");
    }
    const requestedRole = forcedRole ?? input.role;
    if (!requestedRole || (forcedRole && input.role && forcedRole !== input.role)) {
      throw new ApiError(
        400,
        "INVALID_ROLE",
        "A valid institution administrator, teacher, or student role is required",
      );
    }
    if (actor.role === UserRole.INSTITUTION_ADMIN && requestedRole === UserRole.INSTITUTION_ADMIN) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only a Super Admin can create institution administrator accounts",
      );
    }

    const institution = await database.institution.findUnique({
      where: { id: input.institutionId },
      select: { id: true },
    });
    if (!institution) {
      throw new ApiError(404, "INSTITUTION_NOT_FOUND", "The institution was not found");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
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
            : requestedRole === UserRole.TEACHER
              ? { teacherProfile: { create: {} } }
              : {}),
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

  router.patch("/:id", async (request, response) => {
    const actor = currentAuth(response);
    const id = parseId(request.params["id"]);
    const input = updateUserSchema.parse(request.body);
    const where: Prisma.UserWhereInput = {
      id,
      ...(actor.role === UserRole.INSTITUTION_ADMIN
        ? { institutionId: requireInstitutionId(actor) }
        : {}),
      ...(forcedRole ? { role: forcedRole } : {}),
    };
    const existing = await database.user.findFirst({ where, select: { id: true, institutionId: true } });
    if (!existing) throw new ApiError(404, "USER_NOT_FOUND", "The account was not found");
    const user = await database.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id },
        data: {
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        },
        select: publicSelect,
      });
      await writeAuditLog(transaction, {
        institutionId: existing.institutionId,
        actorId: actor.userId,
        action: "user.updated",
        entityType: "User",
        entityId: id,
        metadata: { changedFields: Object.keys(input) },
      });
      return updated;
    });
    response.json({ data: user });
  });

  router.delete("/:id", async (request, response) => {
    const actor = currentAuth(response);
    const id = parseId(request.params["id"]);
    if (id === actor.userId) {
      throw new ApiError(400, "CANNOT_DEACTIVATE_SELF", "You cannot deactivate your own account");
    }
    const where: Prisma.UserWhereInput = {
      id,
      ...(actor.role === UserRole.INSTITUTION_ADMIN
        ? { institutionId: requireInstitutionId(actor) }
        : {}),
      ...(forcedRole ? { role: forcedRole } : {}),
    };
    const existing = await database.user.findFirst({ where, select: { id: true, institutionId: true } });
    if (!existing) throw new ApiError(404, "USER_NOT_FOUND", "The account was not found");
    await database.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id }, data: { status: "SUSPENDED" } });
      await transaction.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeAuditLog(transaction, {
        institutionId: existing.institutionId,
        actorId: actor.userId,
        action: "user.deactivated",
        entityType: "User",
        entityId: id,
      });
    });
    response.status(204).end();
  });

  return router;
}
