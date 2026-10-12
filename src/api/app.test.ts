// @vitest-environment node
import { AccountStatus, SessionStatus, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import supertest from "supertest";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "./app";
import { loadConfig, type ApiConfig } from "./config/env";
import { createAccessToken, hashToken } from "./middleware/authenticate";

const config: ApiConfig = {
  nodeEnv: "test",
  databaseUrl: "postgresql://test.invalid/test",
  sessionSecret: "this-is-a-test-only-signing-secret-at-least-32",
  port: 3001,
  host: "127.0.0.1",
  appUrl: "http://localhost:5000",
  frontendOrigins: [],
  smtp: null,
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

  it("uses configured production Replit domains without hardcoded app URLs", () => {
    const productionConfig = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://test.invalid/test",
      SESSION_SECRET: "this-is-a-test-only-signing-secret-at-least-32",
      REPLIT_DEV_DOMAIN: "dev.example.replit.dev",
      REPLIT_DOMAINS: "intelliclass-preview.replit.app,campus.example",
    });

    expect(productionConfig.host).toBe("127.0.0.1");
    expect(productionConfig.frontendOrigins).toEqual([
      "https://intelliclass-preview.replit.app",
      "https://campus.example",
    ]);
    expect(productionConfig.appUrl).toBe("https://intelliclass-preview.replit.app");
    expect(productionConfig.cookieSecure).toBe(true);

    const productionAllowlist = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://test.invalid/test",
      SESSION_SECRET: "this-is-a-test-only-signing-secret-at-least-32",
      FRONTEND_ORIGIN: "https://campus.example",
      REPLIT_DOMAINS: "intelliclass-preview.replit.app",
    });
    expect(productionAllowlist.frontendOrigins).toEqual([
      "https://intelliclass-preview.replit.app",
      "https://campus.example",
    ]);
    expect(
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://test.invalid/test",
        SESSION_SECRET: "this-is-a-test-only-signing-secret-at-least-32",
      }).frontendOrigins,
    ).toEqual([]);

    const developmentConfig = loadConfig({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://test.invalid/test",
      SESSION_SECRET: "this-is-a-test-only-signing-secret-at-least-32",
      REPLIT_DEV_DOMAIN: "intelliclass-dev.example.replit.dev",
      SMTP_HOST: "smtp.example",
      SMTP_PORT: "587",
      EMAIL_USER: "mailer@example.com",
      EMAIL_PASS: "test-only-password",
    });
    expect(developmentConfig.appUrl).toBe("https://intelliclass-dev.example.replit.dev");
    expect(developmentConfig.frontendOrigins).toContain(developmentConfig.appUrl);
    expect(developmentConfig.smtp).toMatchObject({
      host: "smtp.example",
      port: 587,
      user: "mailer@example.com",
    });
    expect(() =>
      loadConfig({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://test.invalid/test",
        SESSION_SECRET: "this-is-a-test-only-signing-secret-at-least-32",
        SMTP_HOST: "smtp.example",
      }),
    ).toThrow("SMTP_HOST, SMTP_PORT, EMAIL_USER, and EMAIL_PASS must be configured together");
  });

  it("allows configured production origins and rejects sibling deployments", async () => {
    const productionConfig = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://test.invalid/test",
      SESSION_SECRET: "this-is-a-test-only-signing-secret-at-least-32",
      REPLIT_DOMAINS: "intelliclass-preview.replit.app",
    });
    const productionApp = createApiApp(database.database, productionConfig);

    const allowed = await supertest(productionApp)
      .options("/api/v1/auth/login")
      .set("Origin", "https://intelliclass-preview.replit.app")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://intelliclass-preview.replit.app",
    );

    const denied = await supertest(productionApp)
      .options("/api/v1/auth/login")
      .set("Origin", "https://another-project.replit.app")
      .set("Access-Control-Request-Method", "POST")
      .expect(403);
    expect(denied.body.error.message).toBe(
      "Please open IntelliClass using an approved app address.",
    );
  });

  it("allows only a trusted same-origin proxy in every environment", async () => {
    const productionApp = createApiApp(database.database, {
      ...config,
      nodeEnv: "production",
      frontendOrigins: [],
      cookieSecure: true,
    });
    const replitOrigin = "https://intelliclass-preview--another-user.replit.app";

    const allowed = await supertest(productionApp)
      .options("/api/v1/auth/login")
      .set("Origin", replitOrigin)
      .set("x-forwarded-host", "intelliclass-preview--another-user.replit.app")
      .set("x-forwarded-proto", "https")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(replitOrigin);

    await supertest(productionApp)
      .options("/api/v1/auth/login")
      .set("Origin", "https://attacker.example")
      .set("x-forwarded-host", "intelliclass-preview--another-user.replit.app")
      .set("x-forwarded-proto", "https")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(403);

    const developmentApp = createApiApp(database.database, {
      ...config,
      nodeEnv: "development",
      frontendOrigins: [],
    });
    const previewOrigin = "https://another-project.replit.app";
    const devProxyResponse = await supertest(developmentApp)
      .options("/api/v1/auth/login")
      .set("Origin", previewOrigin)
      .set("x-forwarded-host", "another-project.replit.app")
      .set("x-forwarded-proto", "https")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(204);
    expect(devProxyResponse.headers["access-control-allow-origin"]).toBe(previewOrigin);

    const loginResponse = await supertest(developmentApp)
      .post("/api/v1/auth/login")
      .set("Origin", previewOrigin)
      .set("x-forwarded-host", "another-project.replit.app")
      .set("x-forwarded-proto", "https")
      .send({ email: "guest@example.edu", password: "incorrect-password" })
      .expect(401);
    expect(loginResponse.body.error.code).toBe("INVALID_CREDENTIALS");

    await supertest(developmentApp)
      .options("/api/v1/auth/login")
      .set("Origin", "https://attacker.example")
      .set("x-forwarded-host", "another-project.replit.app")
      .set("x-forwarded-proto", "https")
      .set("Access-Control-Request-Method", "POST")
      .expect(403);
  });

  it("allows the exact Replit development origin on login and forgot-password routes only", async () => {
    const devDomain = "a776e25d-5b98-44b8-a2a7-04dcd45fa2fb-00-2ll9713xdwy0s.pike.replit.dev";
    const devConfig = loadConfig({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://test.invalid/test",
      SESSION_SECRET: "this-is-a-test-only-signing-secret-at-least-32",
      REPLIT_DEV_DOMAIN: devDomain,
    });
    const devApp = createApiApp(database.database, devConfig);
    const origin = `https://${devDomain}`;
    expect(devConfig.frontendOrigins).toContain("http://localhost");

    for (const path of ["/api/v1/auth/login", "/api/v1/auth/forgot-password"]) {
      const response = await supertest(devApp)
        .options(path)
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "content-type")
        .expect(204);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
    }

    await supertest(devApp)
      .options("/api/v1/auth/login")
      .set("Origin", "https://other.pike.replit.dev")
      .set("Access-Control-Request-Method", "POST")
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

  it("restores a login session through refresh and revokes it on logout", async () => {
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
    const sessionId = randomUUID();
    database.delegates["user"].findUnique.mockResolvedValue(user);
    database.delegates["authSession"].create.mockResolvedValue({ id: sessionId });
    database.delegates["authSession"].findFirst.mockResolvedValue({
      id: sessionId,
      user: {
        id: user.id,
        institutionId: user.institutionId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
    database.delegates["authSession"].updateMany.mockResolvedValue({ count: 1 });

    const login = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password })
      .expect(200);
    const initialCookie = login.headers["set-cookie"]?.[0]?.split(";")[0];
    expect(initialCookie).toContain("ic_session=");

    const refreshed = await supertest(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", initialCookie!)
      .expect(200);
    const rotatedCookie = refreshed.headers["set-cookie"]?.[0]?.split(";")[0];
    expect(rotatedCookie).toContain("ic_session=");
    expect(rotatedCookie).not.toBe(initialCookie);
    expect(refreshed.body.data.user.id).toBe(user.id);

    const logout = await supertest(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", rotatedCookie!)
      .expect(204);
    expect(logout.headers["set-cookie"]?.[0]).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(database.delegates["authSession"].updateMany).toHaveBeenCalledTimes(2);
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
    database.delegates["user"].count.mockResolvedValueOnce(12).mockResolvedValueOnce(4);
    database.delegates["class"].count.mockResolvedValue(5);
    database.delegates["classSession"].count.mockResolvedValue(3);
    database.delegates["attendanceRecord"].count.mockResolvedValueOnce(5).mockResolvedValueOnce(3);

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
        data: expect.not.objectContaining({
          teacherProfile: expect.anything(),
          studentProfile: expect.anything(),
        }),
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
    const resetApp = createApiApp(database.database, {
      ...config,
      frontendOrigins: ["https://campus.example"],
    });
    const response = await supertest(resetApp)
      .post("/api/v1/auth/forgot-password")
      .set("Origin", "https://campus.example")
      .send({ email: "person@example.edu" })
      .expect(503);
    expect(response.headers["access-control-allow-origin"]).toBe("https://campus.example");
    expect(response.body.error.code).toBe("EMAIL_DELIVERY_NOT_CONFIGURED");
    expect(database.delegates["passwordResetToken"].create).not.toHaveBeenCalled();
  });

  it("sends a generic reset response and persists only a hashed, expiring token", async () => {
    const userId = randomUUID();
    const resetTokenId = randomUUID();
    const sender = vi.fn(async (_recipient: string, _resetUrl: string) => undefined);
    const resetApp = createApiApp(
      database.database,
      {
        ...config,
        appUrl: "https://intelliclass-preview.replit.app",
        frontendOrigins: ["https://campus.example"],
        smtp: {
          host: "smtp.example",
          port: 587,
          user: "mailer@example.com",
          password: "test-only-password",
          from: "mailer@example.com",
        },
      },
      { sendPasswordResetEmail: sender },
    );
    database.delegates["user"].findUnique.mockResolvedValue({
      id: userId,
      status: AccountStatus.ACTIVE,
    });
    database.delegates["passwordResetToken"].updateMany.mockResolvedValue({ count: 1 });
    database.delegates["passwordResetToken"].create.mockResolvedValue({ id: resetTokenId });

    const response = await supertest(resetApp)
      .post("/api/v1/auth/forgot-password")
      .set("Origin", "https://campus.example")
      .send({ email: "person@example.edu" })
      .expect(202);

    expect(response.body.data.message).toMatch(/If an account with that email exists/);
    expect(sender).toHaveBeenCalledOnce();
    const resetUrl = new URL(sender.mock.calls[0]![1]);
    expect(resetUrl.origin).toBe("https://intelliclass-preview.replit.app");
    expect(resetUrl.pathname).toBe("/reset-password");
    const rawToken = resetUrl.searchParams.get("token");
    expect(rawToken).toBeTruthy();
    const tokenCreateCall =
      database.delegates["passwordResetToken"].create.mock.calls[0]![0];
    expect(tokenCreateCall.data.userId).toBe(userId);
    expect(tokenCreateCall.data.tokenHash).toBe(hashToken(rawToken!));
    expect(tokenCreateCall.data.tokenHash).not.toBe(rawToken);
    expect(tokenCreateCall.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(tokenCreateCall.data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60_000);

    database.delegates["passwordResetToken"].findFirst.mockResolvedValue({
      id: resetTokenId,
      userId,
      user: { institutionId: randomUUID() },
    });
    database.delegates["passwordResetToken"].update.mockResolvedValue({});
    database.delegates["user"].update.mockResolvedValue({});
    database.delegates["authSession"].updateMany.mockResolvedValue({ count: 1 });
    database.delegates["auditLog"].create.mockResolvedValue({ id: randomUUID() });
    await supertest(resetApp)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, password: "a-different-secure-password" })
      .expect(204);
    const passwordUpdate = database.delegates["user"].update.mock.calls[0]![0];
    expect(
      await bcrypt.compare("a-different-secure-password", passwordUpdate.data.passwordHash),
    ).toBe(true);
    expect(database.delegates["passwordResetToken"].update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: resetTokenId }, data: { usedAt: expect.any(Date) } }),
    );
    expect(database.delegates["authSession"].updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId, revokedAt: null } }),
    );
  });

  it("does not disclose whether a reset email belongs to an account", async () => {
    const sender = vi.fn(async (_recipient: string, _resetUrl: string) => undefined);
    const resetApp = createApiApp(
      database.database,
      {
        ...config,
        smtp: {
          host: "smtp.example",
          port: 587,
          user: "mailer",
          password: "test-only-password",
          from: "mailer",
        },
      },
      { sendPasswordResetEmail: sender },
    );
    database.delegates["user"].findUnique.mockResolvedValue(null);

    const response = await supertest(resetApp)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "missing@example.edu" })
      .expect(202);

    expect(response.body.data.message).toMatch(/If an account with that email exists/);
    expect(sender).not.toHaveBeenCalled();
    expect(database.delegates["passwordResetToken"].create).not.toHaveBeenCalled();
  });

  it("invalidates a reset token when SMTP delivery fails without exposing the transport error", async () => {
    const userId = randomUUID();
    const resetTokenId = randomUUID();
    const sender = vi.fn(async (_recipient: string, _resetUrl: string) => {
      throw new Error("SMTP credentials and recipient must not reach the client");
    });
    const resetApp = createApiApp(
      database.database,
      {
        ...config,
        smtp: {
          host: "smtp.example",
          port: 587,
          user: "mailer",
          password: "test-only-password",
          from: "mailer",
        },
      },
      { sendPasswordResetEmail: sender },
    );
    database.delegates["user"].findUnique.mockResolvedValue({
      id: userId,
      status: AccountStatus.ACTIVE,
    });
    database.delegates["passwordResetToken"].create.mockResolvedValue({ id: resetTokenId });
    database.delegates["passwordResetToken"].updateMany.mockResolvedValue({ count: 1 });

    const response = await supertest(resetApp)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "person@example.edu" })
      .expect(202);

    expect(response.body.error).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain("SMTP credentials");
    expect(database.delegates["passwordResetToken"].updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: resetTokenId, usedAt: null },
        data: { usedAt: expect.any(Date) },
      }),
    );
  });

  it("invalidates active sessions and reset links when an institution admin resets a scoped account", async () => {
    const identity = await authorize(database.delegates, UserRole.INSTITUTION_ADMIN);
    const targetId = randomUUID();
    database.delegates["user"].findFirst.mockResolvedValue({
      id: targetId,
      institutionId: identity.institutionId,
      role: UserRole.STUDENT,
    });
    database.delegates["authSession"].updateMany.mockResolvedValue({ count: 1 });
    database.delegates["passwordResetToken"].updateMany.mockResolvedValue({ count: 1 });
    database.delegates["auditLog"].create.mockResolvedValue({ id: randomUUID() });

    await supertest(app)
      .post(`/api/v1/users/${targetId}/reset-password`)
      .set("Authorization", `Bearer ${identity.token}`)
      .send({ password: "a-new-secure-password" })
      .expect(204);

    const updateCall = database.delegates["user"].update.mock.calls[0]![0];
    expect(updateCall.where).toEqual({ id: targetId });
    expect(await bcrypt.compare("a-new-secure-password", updateCall.data.passwordHash)).toBe(true);
    expect(database.delegates["authSession"].updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: targetId, revokedAt: null } }),
    );
    expect(database.delegates["passwordResetToken"].updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: targetId, usedAt: null } }),
    );
    expect(database.delegates["auditLog"].create).toHaveBeenCalledOnce();
  });
});
