import { UserRole } from "@prisma/client";
import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import z from "zod";
import { ApiError } from "../../lib/errors";
import { currentAuth, requireInstitutionId } from "../../middleware/authenticate";

const querySchema = z.object({ institutionId: z.string().uuid().optional() });

function startOfDay(timestamp: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]),
  );
  const localDate = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
  );
  const localAtUtcMidnight = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return localDate - (localAtUtcMidnight - timestamp);
}

function localDayRange(timeZone: string, now = Date.now()) {
  const start = startOfDay(now, timeZone);
  const nextLocalDate = startOfDay(start + 36 * 60 * 60 * 1000, timeZone);
  return { start: new Date(start), end: new Date(nextLocalDate) };
}

export function createDashboardRouter(database: PrismaClient) {
  const router = Router();

  router.get("/summary", async (request, response) => {
    const auth = currentAuth(response);
    const query = querySchema.parse(request.query);
    if (
      auth.role === UserRole.INSTITUTION_ADMIN &&
      query.institutionId &&
      query.institutionId !== requireInstitutionId(auth)
    ) {
      throw new ApiError(403, "FORBIDDEN", "You cannot view another institution's dashboard");
    }
    const institutionId =
      auth.role === UserRole.SUPER_ADMIN
        ? query.institutionId
        : requireInstitutionId(auth);
    const institution = institutionId
      ? await database.institution.findUnique({
          where: { id: institutionId },
          select: { timeZone: true },
        })
      : null;
    const timeZone = institution?.timeZone ?? "UTC";
    const { start: dayStart, end: dayEnd } = localDayRange(timeZone);
    const institutionFilter: Prisma.UserWhereInput =
      institutionId ? { institutionId } : {};

    const classWhere: Prisma.ClassWhereInput =
      auth.role === UserRole.TEACHER
        ? {
            institutionId: requireInstitutionId(auth),
            teachers: { some: { teacherId: auth.userId } },
          }
        : auth.role === UserRole.STUDENT
          ? {
              institutionId: requireInstitutionId(auth),
              enrollments: { some: { studentId: auth.userId } },
            }
          : institutionId
            ? { institutionId }
            : {};
    const sessionWhere: Prisma.ClassSessionWhereInput =
      auth.role === UserRole.TEACHER
        ? { institutionId: requireInstitutionId(auth), teacherId: auth.userId }
        : auth.role === UserRole.STUDENT
          ? {
              institutionId: requireInstitutionId(auth),
              class: { enrollments: { some: { studentId: auth.userId } } },
            }
          : institutionId
            ? { institutionId }
            : {};

    const [students, teachers, classes, sessionsToday, attendanceTotal, attendancePresent] =
      await Promise.all([
        auth.role === UserRole.TEACHER
          ? database.classEnrollment.count({
              where: {
                student: { status: "ACTIVE" },
                class: {
                  institutionId: requireInstitutionId(auth),
                  teachers: { some: { teacherId: auth.userId } },
                },
              },
            })
          : database.user.count({
              where: {
                ...institutionFilter,
                role: UserRole.STUDENT,
                status: "ACTIVE",
                ...(auth.role === UserRole.STUDENT ? { id: auth.userId } : {}),
              },
            }),
        auth.role === UserRole.TEACHER
          ? 1
          : database.user.count({
              where: {
                ...institutionFilter,
                role: UserRole.TEACHER,
                status: "ACTIVE",
              },
            }),
        database.class.count({ where: classWhere }),
        database.classSession.count({
          where: {
            ...sessionWhere,
            startsAt: { gte: dayStart, lt: dayEnd },
          },
        }),
        database.attendanceRecord.count({
          where: {
            markedAt: { gte: dayStart, lt: dayEnd },
            ...(auth.role === UserRole.STUDENT ? { studentId: auth.userId } : {}),
            session: sessionWhere,
          },
        }),
        database.attendanceRecord.count({
          where: {
            status: "PRESENT",
            markedAt: { gte: dayStart, lt: dayEnd },
            ...(auth.role === UserRole.STUDENT ? { studentId: auth.userId } : {}),
            session: sessionWhere,
          },
        }),
      ]);

    response.json({
      data: {
        scope: institutionId ? "institution" : "all-institutions",
        timeZone,
        metrics: {
          students,
          teachers,
          classes,
          sessionsToday,
          attendancePresent,
          attendanceTotal,
          attendancePercent:
            attendanceTotal === 0 ? null : Math.round((attendancePresent / attendanceTotal) * 1000) / 10,
        },
      },
    });
  });

  return router;
}
