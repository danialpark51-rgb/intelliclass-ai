import { UserRole } from "@prisma/client";
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import z from "zod";
import { writeAuditLog } from "../../lib/audit";
import { ApiError } from "../../lib/errors";
import { pageMeta, pageWindow, paginationSchema, parseQuery } from "../../lib/validation";
import { currentAuth, requireInstitutionId, requireRoles } from "../../middleware/authenticate";

const listSchema = z.object({
  ...paginationSchema.shape,
  institutionId: z.string().uuid().optional(),
});

const createSubjectSchema = z.object({
  institutionId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((code) => code.toUpperCase()),
});

export function createSubjectRouter(database: PrismaClient) {
  const router = Router();

  router.get("/", async (request, response) => {
    const auth = currentAuth(response);
    const query = parseQuery(listSchema, request);
    const where: Prisma.SubjectWhereInput =
      auth.role === UserRole.SUPER_ADMIN
        ? query.institutionId
          ? { institutionId: query.institutionId }
          : {}
        : {
            institutionId: requireInstitutionId(auth),
            classes: {
              some: {
                class:
                  auth.role === UserRole.TEACHER
                    ? { teachers: { some: { teacherId: auth.userId } } }
                    : { enrollments: { some: { studentId: auth.userId } } },
              },
            },
          };

    const [subjects, total] = await Promise.all([
      database.subject.findMany({
        where,
        ...pageWindow(query),
        orderBy: { name: "asc" },
        select: { id: true, institutionId: true, name: true, code: true, createdAt: true },
      }),
      database.subject.count({ where }),
    ]);
    response.json({
      data: subjects,
      pagination: pageMeta(query.page, query.pageSize, total),
    });
  });

  router.post("/", requireRoles(UserRole.SUPER_ADMIN), async (request, response) => {
    const input = createSubjectSchema.parse(request.body);
    const institutionId = input.institutionId;
    const institution = await database.institution.findUnique({
      where: { id: institutionId },
      select: { id: true },
    });
    if (!institution) {
      throw new ApiError(404, "INSTITUTION_NOT_FOUND", "The institution was not found");
    }
    const actor = currentAuth(response);
    const subject = await database.$transaction(async (transaction) => {
      const created = await transaction.subject.create({
        data: {
          institutionId,
          name: input.name,
          code: input.code,
        },
        select: { id: true, institutionId: true, name: true, code: true, createdAt: true },
      });
      await writeAuditLog(transaction, {
        institutionId,
        actorId: actor.userId,
        action: "subject.created",
        entityType: "Subject",
        entityId: created.id,
      });
      return created;
    });
    response.status(201).json({ data: subject });
  });

  return router;
}
