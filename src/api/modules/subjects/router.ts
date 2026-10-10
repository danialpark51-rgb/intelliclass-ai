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

const updateSubjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    code: z.string().trim().min(1).max(40).transform((code) => code.toUpperCase()).optional(),
  })
  .refine((input) => Object.keys(input).length > 0);

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
        : auth.role === UserRole.INSTITUTION_ADMIN
          ? { institutionId: requireInstitutionId(auth) }
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

  router.post("/", requireRoles(UserRole.SUPER_ADMIN, UserRole.INSTITUTION_ADMIN), async (request, response) => {
    const input = createSubjectSchema.parse(request.body);
    const actor = currentAuth(response);
    const institutionId =
      actor.role === UserRole.SUPER_ADMIN ? input.institutionId : requireInstitutionId(actor);
    if (institutionId !== input.institutionId) {
      throw new ApiError(403, "FORBIDDEN", "You can only manage subjects in your institution");
    }
    const institution = await database.institution.findUnique({
      where: { id: institutionId },
      select: { id: true },
    });
    if (!institution) {
      throw new ApiError(404, "INSTITUTION_NOT_FOUND", "The institution was not found");
    }
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

  router.patch(
    "/:id",
    requireRoles(UserRole.SUPER_ADMIN, UserRole.INSTITUTION_ADMIN),
    async (request, response) => {
      const id = z.string().uuid().parse(request.params["id"]);
      const input = updateSubjectSchema.parse(request.body);
      const actor = currentAuth(response);
      const existing = await database.subject.findFirst({
        where: {
          id,
          ...(actor.role === UserRole.INSTITUTION_ADMIN
            ? { institutionId: requireInstitutionId(actor) }
            : {}),
        },
        select: { id: true, institutionId: true },
      });
      if (!existing) throw new ApiError(404, "SUBJECT_NOT_FOUND", "The subject was not found");
      const subject = await database.$transaction(async (transaction) => {
        const updated = await transaction.subject.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.code !== undefined ? { code: input.code } : {}),
          },
          select: { id: true, institutionId: true, name: true, code: true, createdAt: true },
        });
        await writeAuditLog(transaction, {
          institutionId: existing.institutionId,
          actorId: actor.userId,
          action: "subject.updated",
          entityType: "Subject",
          entityId: id,
          metadata: { changedFields: Object.keys(input) },
        });
        return updated;
      });
      response.json({ data: subject });
    },
  );

  router.delete(
    "/:id",
    requireRoles(UserRole.SUPER_ADMIN, UserRole.INSTITUTION_ADMIN),
    async (request, response) => {
      const id = z.string().uuid().parse(request.params["id"]);
      const actor = currentAuth(response);
      const existing = await database.subject.findFirst({
        where: {
          id,
          ...(actor.role === UserRole.INSTITUTION_ADMIN
            ? { institutionId: requireInstitutionId(actor) }
            : {}),
        },
        select: { id: true, institutionId: true, _count: { select: { sessions: true } } },
      });
      if (!existing) throw new ApiError(404, "SUBJECT_NOT_FOUND", "The subject was not found");
      if (existing._count.sessions > 0) {
        throw new ApiError(409, "SUBJECT_HAS_SESSIONS", "A subject with recorded sessions cannot be deleted");
      }
      await database.$transaction(async (transaction) => {
        await transaction.subject.delete({ where: { id } });
        await writeAuditLog(transaction, {
          institutionId: existing.institutionId,
          actorId: actor.userId,
          action: "subject.deleted",
          entityType: "Subject",
          entityId: id,
        });
      });
      response.status(204).end();
    },
  );

  return router;
}
