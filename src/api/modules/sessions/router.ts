import { AttendanceStatus, SessionStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import z from "zod";
import { writeAuditLog } from "../../lib/audit";
import { ApiError } from "../../lib/errors";
import { currentAuth, requireInstitutionId, requireRoles } from "../../middleware/authenticate";
import {
  assertTimeZone,
  pageMeta,
  pageWindow,
  paginationSchema,
  parseId,
  parseQuery,
} from "../../lib/validation";

const listSchema = z.object({
  ...paginationSchema.shape,
  institutionId: z.string().uuid().optional(),
  status: z.nativeEnum(SessionStatus).optional(),
});

const createSessionSchema = z.object({
  institutionId: z.string().uuid().optional(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  startsAt: z.string().datetime({ offset: true }),
  timeZone: z.string().trim().min(1).max(64),
});

const attendanceSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: z.nativeEnum(AttendanceStatus),
        note: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(200)
    .refine(
      (records) => new Set(records.map((record) => record.studentId)).size === records.length,
      "Each student may appear only once",
    ),
});

const sessionSelect = {
  id: true,
  institutionId: true,
  classId: true,
  teacherId: true,
  subjectId: true,
  title: true,
  status: true,
  startsAt: true,
  endsAt: true,
  timeZone: true,
  createdAt: true,
  updatedAt: true,
  class: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  subject: { select: { id: true, name: true, code: true } },
} satisfies Prisma.ClassSessionSelect;

async function findAccessibleSession(
  database: PrismaClient,
  id: string,
  auth: ReturnType<typeof currentAuth>,
) {
  const scope: Prisma.ClassSessionWhereInput =
    auth.role === UserRole.SUPER_ADMIN
      ? {}
      : auth.role === UserRole.TEACHER
        ? { institutionId: requireInstitutionId(auth), teacherId: auth.userId }
        : {
            institutionId: requireInstitutionId(auth),
            class: { enrollments: { some: { studentId: auth.userId } } },
          };
  return database.classSession.findFirst({
    where: { id, ...scope },
    select: sessionSelect,
  });
}

export function createSessionRouter(database: PrismaClient) {
  const router = Router();

  router.get("/", async (request, response) => {
    const auth = currentAuth(response);
    const query = parseQuery(listSchema, request);
    const where: Prisma.ClassSessionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(auth.role === UserRole.SUPER_ADMIN
        ? query.institutionId
          ? { institutionId: query.institutionId }
          : {}
        : auth.role === UserRole.TEACHER
          ? { institutionId: requireInstitutionId(auth), teacherId: auth.userId }
          : {
              institutionId: requireInstitutionId(auth),
              class: { enrollments: { some: { studentId: auth.userId } } },
            }),
    };
    const [sessions, total] = await Promise.all([
      database.classSession.findMany({
        where,
        ...pageWindow(query),
        orderBy: { startsAt: "desc" },
        select: sessionSelect,
      }),
      database.classSession.count({ where }),
    ]);
    response.json({
      data: sessions,
      pagination: pageMeta(query.page, query.pageSize, total),
    });
  });

  router.post(
    "/",
    requireRoles(UserRole.SUPER_ADMIN, UserRole.TEACHER),
    async (request, response) => {
      const input = createSessionSchema.parse(request.body);
      const auth = currentAuth(response);
      const institutionId =
        auth.role === UserRole.SUPER_ADMIN ? input.institutionId : auth.institutionId;
      if (!institutionId) {
        throw new ApiError(400, "INSTITUTION_REQUIRED", "An institution is required");
      }

      const teacherId = auth.role === UserRole.TEACHER ? auth.userId : input.teacherId;
      if (!teacherId) {
        throw new ApiError(400, "TEACHER_REQUIRED", "A teacher must be assigned to the session");
      }

      const session = await database.$transaction(async (transaction) => {
        const classAccess: Prisma.ClassWhereInput = {
          id: input.classId,
          institutionId,
          ...(auth.role === UserRole.TEACHER
            ? { teachers: { some: { teacherId: auth.userId } } }
            : {}),
        };
        const [classRecord, subjectAssignment, teacher] = await Promise.all([
          transaction.class.findFirst({
            where: classAccess,
            select: { id: true, institutionId: true },
          }),
          transaction.classSubject.findFirst({
            where: { classId: input.classId, subjectId: input.subjectId },
            select: { classId: true },
          }),
          transaction.user.findFirst({
            where: {
              id: teacherId,
              institutionId,
              role: UserRole.TEACHER,
              status: "ACTIVE",
              teachingClasses: { some: { classId: input.classId } },
            },
            select: { id: true },
          }),
        ]);
        if (!classRecord || !subjectAssignment || !teacher) {
          throw new ApiError(
            400,
            "INVALID_SESSION_ASSIGNMENT",
            "The class, teacher, and subject must be active assignments in the same institution",
          );
        }

        const created = await transaction.classSession.create({
          data: {
            institutionId,
            classId: input.classId,
            teacherId,
            subjectId: input.subjectId,
            title: input.title,
            startsAt: new Date(input.startsAt),
            timeZone: assertTimeZone(input.timeZone),
          },
          select: sessionSelect,
        });
        await writeAuditLog(transaction, {
          institutionId,
          actorId: auth.userId,
          action: "session.created",
          entityType: "ClassSession",
          entityId: created.id,
        });
        return created;
      });
      response.status(201).json({ data: session });
    },
  );

  router.get("/:id", async (request, response) => {
    const id = parseId(request.params["id"]);
    const session = await findAccessibleSession(database, id, currentAuth(response));
    if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "The session was not found");
    response.json({ data: session });
  });

  router.post(
    "/:id/start",
    requireRoles(UserRole.SUPER_ADMIN, UserRole.TEACHER),
    async (request, response) => {
      const id = parseId(request.params["id"]);
      const auth = currentAuth(response);
      const session = await findAccessibleSession(database, id, auth);
      if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "The session was not found");
      if (session.status !== SessionStatus.SCHEDULED) {
        throw new ApiError(409, "INVALID_SESSION_STATE", "Only a scheduled session can be started");
      }

      const started = await database.$transaction(async (transaction) => {
        const active = await transaction.classSession.findFirst({
          where: {
            status: SessionStatus.ACTIVE,
            OR: [{ classId: session.classId }, { teacherId: session.teacherId }],
          },
          select: { id: true },
        });
        if (active) {
          throw new ApiError(
            409,
            "SESSION_CONFLICT",
            "This class or teacher already has an active session",
          );
        }
        const result = await transaction.classSession.updateMany({
          where: { id, status: SessionStatus.SCHEDULED },
          data: { status: SessionStatus.ACTIVE },
        });
        if (result.count !== 1) {
          throw new ApiError(409, "INVALID_SESSION_STATE", "The session is no longer scheduled");
        }
        await writeAuditLog(transaction, {
          institutionId: session.institutionId,
          actorId: auth.userId,
          action: "session.started",
          entityType: "ClassSession",
          entityId: session.id,
        });
        return transaction.classSession.findUniqueOrThrow({
          where: { id },
          select: sessionSelect,
        });
      });
      response.json({ data: started });
    },
  );

  router.post(
    "/:id/end",
    requireRoles(UserRole.SUPER_ADMIN, UserRole.TEACHER),
    async (request, response) => {
      const id = parseId(request.params["id"]);
      const auth = currentAuth(response);
      const session = await findAccessibleSession(database, id, auth);
      if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "The session was not found");
      if (session.status !== SessionStatus.ACTIVE) {
        throw new ApiError(409, "INVALID_SESSION_STATE", "Only an active session can be ended");
      }

      const endedAt = new Date();
      const ended = await database.$transaction(async (transaction) => {
        const result = await transaction.classSession.updateMany({
          where: { id, status: SessionStatus.ACTIVE },
          data: { status: SessionStatus.ENDED, endsAt: endedAt },
        });
        if (result.count !== 1) {
          throw new ApiError(409, "INVALID_SESSION_STATE", "The session is no longer active");
        }
        await writeAuditLog(transaction, {
          institutionId: session.institutionId,
          actorId: auth.userId,
          action: "session.ended",
          entityType: "ClassSession",
          entityId: session.id,
        });
        return transaction.classSession.findUniqueOrThrow({
          where: { id },
          select: sessionSelect,
        });
      });
      response.json({ data: ended });
    },
  );

  router.get("/:id/attendance", async (request, response) => {
    const id = parseId(request.params["id"]);
    const auth = currentAuth(response);
    const session = await findAccessibleSession(database, id, auth);
    if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "The session was not found");
    const records = await database.attendanceRecord.findMany({
      where: {
        sessionId: id,
        ...(auth.role === UserRole.STUDENT ? { studentId: auth.userId } : {}),
      },
      orderBy: { markedAt: "asc" },
      select: {
        id: true,
        sessionId: true,
        studentId: true,
        status: true,
        note: true,
        markedAt: true,
        updatedAt: true,
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    response.json({ data: records });
  });

  router.put(
    "/:id/attendance",
    requireRoles(UserRole.SUPER_ADMIN, UserRole.TEACHER),
    async (request, response) => {
      const input = attendanceSchema.parse(request.body);
      const id = parseId(request.params["id"]);
      const auth = currentAuth(response);
      const session = await findAccessibleSession(database, id, auth);
      if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "The session was not found");
      if (
        session.status === SessionStatus.SCHEDULED ||
        session.status === SessionStatus.CANCELLED
      ) {
        throw new ApiError(
          409,
          "INVALID_SESSION_STATE",
          "Attendance can only be recorded for an active or ended session",
        );
      }

      const records = await database.$transaction(async (transaction) => {
        const enrolledStudents = await transaction.classEnrollment.findMany({
          where: {
            classId: session.classId,
            studentId: { in: input.records.map((record) => record.studentId) },
            student: {
              institutionId: session.institutionId,
              role: UserRole.STUDENT,
              status: "ACTIVE",
            },
          },
          select: { studentId: true },
        });
        if (enrolledStudents.length !== input.records.length) {
          throw new ApiError(
            400,
            "INVALID_ATTENDANCE_STUDENT",
            "Every attendance record must belong to an active student enrolled in this class",
          );
        }

        for (const record of input.records) {
          await transaction.attendanceRecord.upsert({
            where: { sessionId_studentId: { sessionId: id, studentId: record.studentId } },
            create: {
              sessionId: id,
              studentId: record.studentId,
              markedBy: auth.userId,
              status: record.status,
              note: record.note ?? null,
            },
            update: {
              markedBy: auth.userId,
              status: record.status,
              note: record.note ?? null,
              markedAt: new Date(),
            },
          });
        }
        await writeAuditLog(transaction, {
          institutionId: session.institutionId,
          actorId: auth.userId,
          action: "attendance.updated",
          entityType: "ClassSession",
          entityId: session.id,
          metadata: { recordCount: input.records.length },
        });
        return transaction.attendanceRecord.findMany({
          where: {
            sessionId: id,
            studentId: { in: input.records.map((record) => record.studentId) },
          },
          orderBy: { markedAt: "asc" },
          select: {
            id: true,
            sessionId: true,
            studentId: true,
            status: true,
            note: true,
            markedAt: true,
            updatedAt: true,
          },
        });
      });
      response.json({ data: records });
    },
  );

  return router;
}
