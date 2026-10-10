// @vitest-environment node
import { AccountStatus, SessionStatus, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import supertest from "supertest";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "./app";
import { loadConfig, type ApiConfig } from "./config/env";
import { createAccessToken } from "./middleware/authenticate";

const config: ApiConfig = {
  nodeEnv: "test",
  databaseUrl: "postgresql://test.invalid/test",
  sessionSecret: "this-is-a-test-only-signing-secret-at-least-32",
  port: 3001,
  host: "127.0.0.1",
  frontendOrigins: [],
  cookieSecure: false,
  cookieSameSite: "lax",
};

const delegateNames = [
  "institution",
  "user",
  "studentProfile",
  "teacherProfile",
  "class",
  "subject",
  "classEnrollment",
  "classTeacher",
  "classSubject",
  "classSession",
  "attendanceRecord",
  "authSession",
  "passwordResetToken",
  "auditLog",
] as const;

const delegateMethods = [
  "findFirst",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
] as const;

type MockMethod = ReturnType<typeof vi.fn>;
type MockDelegate = Record<(typeof delegateMethods)[number], MockMethod>;
type MockDatabase = {
  [Name in (typeof delegateNames)[number]]: MockDelegate;
} & {
  $queryRaw: MockMethod;
  $transaction: MockMethod;
};

function makeDatabase() {
  const delegates = Object.fromEntries(
    delegateNames.map((name) => [
      name,
      Object.fromEntries(delegateMethods.map((method) => [method, vi.fn()])),
    ]),
  ) as Pick<MockDatabase, (typeof delegateNames)[number]>;
  const database = {
    ...delegates,
    $queryRaw: vi.fn(async () => [{ "?column?": 1 }]),
  } as MockDatabase;
  database.$transaction = vi.fn(async (callback: (transaction: unknown) => unknown) =>
    typeof callback === "function" ? callback(database) : Promise.all(callback),
  );
  return { database: database as unknown as PrismaClient, delegates: database };
}

async function authorize(
  database: MockDatabase,
  role: UserRole,
  institutionId: string | null = randomUUID(),
) {
  const userId = randomUUID();
  const sessionId = randomUUID();
  database["authSession"].findFirst.mockResolvedValue({
    id: sessionId,
    user: { id: userId, institutionId, role },
  });
  const token = await createAccessToken({ userId, institutionId, role, sessionId }, config);
  return { userId, sessionId, token, institutionId };
}

describe("IntelliClass API", () => {
  let database: ReturnType<typeof makeDatabase>;
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    database = makeDatabase();
    app = createApiApp(database.database, config);
  });

  it("uses a loopback API host and secure cookies for production without a guessed frontend origin", () => {
    const productionConfig = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://test.invalid/test",
      SESSION_SECRET: "this-is-a-test-only-signing-secret-at-least-32",
    });

    expect(productionConfig.host).toBe("127.0.0.1");
    expect(productionConfig.frontendOrigins).toEqual([]);
    expect(productionConfig.cookieSecure).toBe(true);
  });

  it("allows only the trusted same-origin production proxy and rejects other origins", async () => {
    const productionApp = createApiApp(database.database, {
      ...config,
      nodeEnv: "production",
      frontendOrigins: [],
      cookieSecure: true,
    });

    const allowed = await supertest(productionApp)
      .options("/api/v1/auth/login")
      .set("Origin", "https://campus.example")
      .set("x-forwarded-host", "campus.example")
      .set("x-forwarded-proto", "https")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://campus.example");

    await supertest(productionApp)
      .options("/api/v1/auth/login")
      .set("Origin", "https://attacker.example")
      .set("x-forwarded-host", "campus.example")
      .set("x-forwarded-proto", "https")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(403);
  });

  it("reports API and PostgreSQL health without leaking connection details", async () => {
    const response = await supertest(app).get("/healthz").expect(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(database.delegates["$queryRaw"]).toHaveBeenCalledOnce();
  });

  it("issues an access token and an HttpOnly refresh cookie for a valid login", async () => {
    const password = "Valid-Test-Password-2026";
    const user = {
      id: randomUUID(),
      institutionId: randomUUID(),
      email: "teacher@example.edu",
      firstName: "Taylor",
      lastName: "Teacher",
      passwordHash: await bcrypt.hash(password, 4),
      role: UserRole.TEACHER,
      status: AccountStatus.ACTIVE,
    };
    database.delegates["user"].findUnique.mockResolvedValue(user);
    database.delegates["authSession"].create.mockResolvedValue({ id: randomUUID() });

    const response = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ email: " TEACHER@example.edu ", password })
      .expect(200);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user).toEqual({
      id: user.id,
      institutionId: user.institutionId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: UserRole.TEACHER,
    });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(database.delegates["authSession"].create).toHaveBeenCalledOnce();
  });

  it("rejects invalid credentials without creating a session", async () => {
    database.delegates["user"].findUnique.mockResolvedValue(null);
    await supertest(app)
      .post("/api/v1/auth/login")
      .send({ email: "unknown@example.edu", password: "NotThePassword" })
      .expect(401);
    expect(database.delegates["authSession"].create).not.toHaveBeenCalled();
  });

  it("blocks a student from creating an institution class", async () => {
    const identity = await authorize(database.delegates, UserRole.STUDENT);
    await supertest(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${identity.token}`)
      .send({ institutionId: identity.institutionId, name: "Unauthorized" })
      .expect(403);
    expect(database.delegates["class"].create).not.toHaveBeenCalled();
  });

  it("returns institution-scoped, database-backed dashboard metrics", async () => {
    const identity = await authorize(database.delegates, UserRole.INSTITUTION_ADMIN);
    database.delegates["institution"].findUnique.mockResolvedValue({ timeZone: "Asia/Kolkata" });
    database.delegates["user"].count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4);
    database.delegates["class"].count.mockResolvedValue(5);
    database.delegates["classSession"].count.mockResolvedValue(3);
    database.delegates["attendanceRecord"].count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);

    const response = await supertest(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${identity.token}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      scope: "institution",
      timeZone: "Asia/Kolkata",
      metrics: {
        students: 12,
        teachers: 4,
        classes: 5,
        sessionsToday: 3,
        attendancePresent: 3,
        attendanceTotal: 5,
        attendancePercent: 60,
      },
    });
    expect(database.delegates["class"].count).toHaveBeenCalledWith({
      where: { institutionId: identity.institutionId },
    });
    expect(database.delegates["classSession"].count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          institutionId: identity.institutionId,
          startsAt: { gte: expect.any(Date), lt: expect.any(Date) },
        }),
      }),
    );
  });

  it("prevents an institution administrator from selecting another institution's dashboard", async () => {
    const identity = await authorize(database.delegates, UserRole.INSTITUTION_ADMIN);
    await supertest(app)
      .get(`/api/v1/dashboard/summary?institutionId=${randomUUID()}`)
      .set("Authorization", `Bearer ${identity.token}`)
      .expect(403);
    expect(database.delegates["class"].count).not.toHaveBeenCalled();
  });

  it("scopes an institution administrator's student directory to their tenant", async () => {
    const identity = await authorize(database.delegates, UserRole.INSTITUTION_ADMIN);
    database.delegates["user"].findMany.mockResolvedValue([]);
    database.delegates["user"].count.mockResolvedValue(0);

    await supertest(app)
      .get("/api/v1/students")
      .set("Authorization", `Bearer ${identity.token}`)
      .expect(200);

    expect(database.delegates["user"].findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: identity.institutionId, role: UserRole.STUDENT },
      }),
    );
  });

  it("rejects an institution administrator's cross-tenant user query", async () => {
    const identity = await authorize(database.delegates, UserRole.INSTITUTION_ADMIN);
    await supertest(app)
      .get(`/api/v1/students?institutionId=${randomUUID()}`)
      .set("Authorization", `Bearer ${identity.token}`)
      .expect(403);
    expect(database.delegates["user"].findMany).not.toHaveBeenCalled();
  });

  it("allows only a Super Admin to provision institution administrators", async () => {
    const otherAdmin = await authorize(database.delegates, UserRole.INSTITUTION_ADMIN);
    await supertest(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${otherAdmin.token}`)
      .send({
        institutionId: otherAdmin.institutionId,
        role: UserRole.INSTITUTION_ADMIN,
        email: "admin@example.edu",
        firstName: "Institution",
        lastName: "Admin",
        password: "Secure-Test-Password-2026",
      })
      .expect(403);
    expect(database.delegates["user"].create).not.toHaveBeenCalled();

    const superAdmin = await authorize(database.delegates, UserRole.SUPER_ADMIN, null);
    const institutionId = randomUUID();
    const userId = randomUUID();
    database.delegates["institution"].findUnique.mockResolvedValue({ id: institutionId });
    database.delegates["user"].create.mockResolvedValue({
      id: userId,
      institutionId,
      email: "admin@example.edu",
      firstName: "Institution",
      lastName: "Admin",
      role: UserRole.INSTITUTION_ADMIN,
      status: AccountStatus.ACTIVE,
    });
    database.delegates["auditLog"].create.mockResolvedValue({ id: randomUUID() });

    const response = await supertest(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${superAdmin.token}`)
      .send({
        institutionId,
        role: UserRole.INSTITUTION_ADMIN,
        email: "admin@example.edu",
        firstName: "Institution",
        lastName: "Admin",
        password: "Secure-Test-Password-2026",
      })
      .expect(201);

    expect(response.body.data.role).toBe(UserRole.INSTITUTION_ADMIN);
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(database.delegates["user"].create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ teacherProfile: expect.anything(), studentProfile: expect.anything() }),
      }),
    );
  });

  it("scopes teacher class lookup to the teacher's own institution and assignment", async () => {
    const identity = await authorize(database.delegates, UserRole.TEACHER);
    const classId = randomUUID();
    database.delegates["class"].findFirst.mockResolvedValue(null);

    await supertest(app)
      .get(`/api/v1/classes/${classId}`)
      .set("Authorization", `Bearer ${identity.token}`)
      .expect(404);

    expect(database.delegates["class"].findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: classId,
          institutionId: identity.institutionId,
          teachers: { some: { teacherId: identity.userId } },
        },
      }),
    );
  });

  it("returns a student's own attendance record only", async () => {
    const identity = await authorize(database.delegates, UserRole.STUDENT);
    const sessionId = randomUUID();
    database.delegates["classSession"].findFirst.mockResolvedValue({
      id: sessionId,
      institutionId: identity.institutionId,
      classId: randomUUID(),
      teacherId: randomUUID(),
      subjectId: randomUUID(),
      title: "Session",
      status: SessionStatus.ENDED,
      startsAt: new Date(),
      endsAt: new Date(),
      timeZone: "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
      class: { id: randomUUID(), name: "Class", code: null },
      teacher: { id: randomUUID(), firstName: "Teacher", lastName: "One" },
      subject: { id: randomUUID(), name: "Science", code: "SCI" },
    });
    database.delegates["attendanceRecord"].findMany.mockResolvedValue([]);

    await supertest(app)
      .get(`/api/v1/sessions/${sessionId}/attendance`)
      .set("Authorization", `Bearer ${identity.token}`)
      .expect(200);

    expect(database.delegates["attendanceRecord"].findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionId, studentId: identity.userId } }),
    );
  });

  it("starts a scheduled session and records the state change", async () => {
    const identity = await authorize(database.delegates, UserRole.TEACHER);
    const sessionId = randomUUID();
    const classId = randomUUID();
    const scheduled = {
      id: sessionId,
      institutionId: identity.institutionId,
      classId,
      teacherId: identity.userId,
      subjectId: randomUUID(),
      title: "Science",
      status: SessionStatus.SCHEDULED,
      startsAt: new Date(),
      endsAt: null,
      timeZone: "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
      class: { id: classId, name: "Class", code: null },
      teacher: { id: identity.userId, firstName: "Taylor", lastName: "Teacher" },
      subject: { id: randomUUID(), name: "Science", code: "SCI" },
    };
    database.delegates["classSession"].findFirst
      .mockResolvedValueOnce(scheduled)
      .mockResolvedValueOnce(null);
    database.delegates["classSession"].updateMany.mockResolvedValue({ count: 1 });
    database.delegates["classSession"].findUniqueOrThrow.mockResolvedValue({
      ...scheduled,
      status: SessionStatus.ACTIVE,
    });
    database.delegates["auditLog"].create.mockResolvedValue({ id: randomUUID() });

    const response = await supertest(app)
      .post(`/api/v1/sessions/${sessionId}/start`)
      .set("Authorization", `Bearer ${identity.token}`)
      .expect(200);

    expect(response.body.data.status).toBe(SessionStatus.ACTIVE);
    expect(database.delegates["classSession"].updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sessionId, status: SessionStatus.SCHEDULED },
        data: { status: SessionStatus.ACTIVE },
      }),
    );
    expect(database.delegates["auditLog"].create).toHaveBeenCalledOnce();
  });

  it("does not claim password reset works without an email provider", async () => {
    const response = await supertest(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "person@example.edu" })
      .expect(503);
    expect(response.body.error.code).toBe("EMAIL_DELIVERY_NOT_CONFIGURED");
    expect(database.delegates["passwordResetToken"].create).not.toHaveBeenCalled();
  });
});
