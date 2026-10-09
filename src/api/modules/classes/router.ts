import { UserRole } from "@prisma/client";
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import z from "zod";
import { writeAuditLog } from "../../lib/audit";
import { ApiError } from "../../lib/errors";
import { currentAuth, requireInstitutionId, requireRoles } from "../../middleware/authenticate";
import { pageMeta, pageWindow, paginationSchema, parseId, parseQuery } from "../../lib/validation";

const listSchema = z.object({
  ...paginationSchema.shape,
  institutionId: z.string().uuid().optional(),
});

const createClassSchema = z
  .object({
    institutionId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .transform((code) => code.toUpperCase())
      .optional(),
    teacherIds: z.array(z.string().uuid()).max(100).default([]),
    subjectIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .superRefine((input, context) => {
    if (new Set(input.teacherIds).size !== input.teacherIds.length) {
      context.addIssue({ code: "custom", path: ["teacherIds"], message: "Duplicate teacher IDs" });
    }
    if (new Set(input.subjectIds).size !== input.subjectIds.length) {
      context.addIssue({ code: "custom", path: ["subjectIds"], message: "Duplicate subject IDs" });
    }
  });

const classSelect = {
  id: true,
  institutionId: true,
  name: true,
  code: true,
  createdAt: true,
  updatedAt: true,
  teachers: { select: { teacherId: true } },
  subjects: { select: { subjectId: true } },
  _count: { select: { enrollments: true, sessions: true } },
} satisfies Prisma.ClassSelect;

export function createClassRouter(database: PrismaClient) {
  const router = Router();

  router.get("/", async (request, response) => {
    const auth = currentAuth(response);
    const query = parseQuery(listSchema, request);
    const where: Prisma.ClassWhereInput =
      auth.role === UserRole.SUPER_ADMIN
        ? query.institutionId
          ? { institutionId: query.institutionId }
          : {}
        : {
            institutionId: requireInstitutionId(auth),
            ...(auth.role === UserRole.TEACHER
              ? { teachers: { some: { teacherId: auth.userId } } }
              : { enrollments: { some: { studentId: auth.userId } } }),
          };

    const [classes, total] = await Promise.all([
      database.class.findMany({
        where,
        ...pageWindow(query),
        orderBy: { name: "asc" },
        select: classSelect,
      }),
      database.class.count({ where }),
    ]);
    response.json({
      data: classes,
      pagination: pageMeta(query.page, query.pageSize, total),
    });
  });

  router.get("/:id", async (request, response) => {
    const auth = currentAuth(response);
    const id = parseId(request.params.id);
    const accessFilter: Prisma.ClassWhereInput =
      auth.role === UserRole.SUPER_ADMIN
        ? {}
        : {
            institutionId: requireInstitutionId(auth),
            ...(auth.role === UserRole.TEACHER
              ? { teachers: { some: { teacherId: auth.userId } } }
              : { enrollments: { some: { studentId: auth.userId } } }),
          };
    const classRecord = await database.class.findFirst({
      where: { id, ...accessFilter },
      select: classSelect,
    });
    if (!classRecord) throw new ApiError(404, "CLASS_NOT_FOUND", "The class was not found");
    response.json({ data: classRecord });
  });

  router.get(
    "/:id/enrollments",
    requireRoles(UserRole.SUPER_ADMIN, UserRole.TEACHER),
    async (request, response) => {
      const id = parseId(request.params["id"]);
      const auth = currentAuth(response);
      const classScope: Prisma.ClassWhereInput =
        auth.role === UserRole.SUPER_ADMIN
          ? { id }
          : {
              id,
              institutionId: requireInstitutionId(auth),
              teachers: { some: { teacherId: auth.userId } },
            };
      const classRecord = await database.class.findFirst({
        where: classScope,
        select: { id: true },
      });
      if (!classRecord) throw new ApiError(404, "CLASS_NOT_FOUND", "The class was not found");

      const pagination = parseQuery(paginationSchema, request);
      const where = { classId: id };
      const [enrollments, total] = await Promise.all([
        database.classEnrollment.findMany({
          where,
          ...pageWindow(pagination),
          orderBy: { enrolledAt: "desc" },
          select: {
            id: true,
            enrolledAt: true,
            student: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                status: true,
              },
            },
          },
        }),
        database.classEnrollment.count({ where }),
      ]);
      response.json({
        data: enrollments,
        pagination: pageMeta(pagination.page, pagination.pageSize, total),
      });
    },
  );

  router.post("/:id/enrollments", requireRoles(UserRole.SUPER_ADMIN), async (request, response) => {
    const id = parseId(request.params["id"]);
    const input = z
      .object({ studentIds: z.array(z.string().uuid()).min(1).max(500) })
      .superRefine((value, context) => {
        if (new Set(value.studentIds).size !== value.studentIds.length) {
          context.addIssue({
            code: "custom",
            path: ["studentIds"],
            message: "Student IDs must be unique",
          });
        }
      })
      .parse(request.body);
    const classRecord = await database.class.findUnique({
      where: { id },
      select: { id: true, institutionId: true },
    });
    if (!classRecord) throw new ApiError(404, "CLASS_NOT_FOUND", "The class was not found");
    const actor = currentAuth(response);

    const created = await database.$transaction(async (transaction) => {
      const students = await transaction.user.findMany({
        where: {
          id: { in: input.studentIds },
          institutionId: classRecord.institutionId,
          role: UserRole.STUDENT,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (students.length !== input.studentIds.length) {
        throw new ApiError(
          400,
          "INVALID_STUDENTS",
          "Every student must be active and belong to the class institution",
        );
      }
      await transaction.classEnrollment.createMany({
        data: input.studentIds.map((studentId) => ({ classId: id, studentId })),
      });
      await writeAuditLog(transaction, {
        institutionId: classRecord.institutionId,
        actorId: actor.userId,
        action: "class.students_enrolled",
        entityType: "Class",
        entityId: id,
        metadata: { count: input.studentIds.length },
      });
      return transaction.classEnrollment.findMany({
        where: { classId: id, studentId: { in: input.studentIds } },
        select: { id: true, classId: true, studentId: true, enrolledAt: true },
      });
    });
    response.status(201).json({ data: created });
  });

  router.post("/", requireRoles(UserRole.SUPER_ADMIN), async (request, response) => {
    const input = createClassSchema.parse(request.body);
    const actor = currentAuth(response);
    const classRecord = await database.$transaction(async (transaction) => {
      const institution = await transaction.institution.findUnique({
        where: { id: input.institutionId },
        select: { id: true },
      });
      if (!institution) {
        throw new ApiError(404, "INSTITUTION_NOT_FOUND", "The institution was not found");
      }

      const [teachers, subjects] = await Promise.all([
        transaction.user.findMany({
          where: {
            id: { in: input.teacherIds },
            institutionId: institution.id,
            role: UserRole.TEACHER,
            status: "ACTIVE",
          },
          select: { id: true },
        }),
        transaction.subject.findMany({
          where: { id: { in: input.subjectIds }, institutionId: institution.id },
          select: { id: true },
        }),
      ]);
      if (teachers.length !== input.teacherIds.length) {
        throw new ApiError(
          400,
          "INVALID_TEACHERS",
          "Every assigned teacher must belong to the institution",
        );
      }
      if (subjects.length !== input.subjectIds.length) {
        throw new ApiError(
          400,
          "INVALID_SUBJECTS",
          "Every assigned subject must belong to the institution",
        );
      }

      const created = await transaction.class.create({
        data: {
          institutionId: institution.id,
          name: input.name,
          code: input.code ?? null,
          teachers: { create: input.teacherIds.map((teacherId) => ({ teacherId })) },
          subjects: { create: input.subjectIds.map((subjectId) => ({ subjectId })) },
        },
        select: classSelect,
      });
      await writeAuditLog(transaction, {
        institutionId: institution.id,
        actorId: actor.userId,
        action: "class.created",
        entityType: "Class",
        entityId: created.id,
        metadata: {
          teacherCount: input.teacherIds.length,
          subjectCount: input.subjectIds.length,
        },
      });
      return created;
    });
    response.status(201).json({ data: classRecord });
  });

  return router;
}
