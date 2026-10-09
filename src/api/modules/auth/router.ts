import { AccountStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { ApiConfig } from "../../config/env";
import { ApiError } from "../../lib/errors";
import { writeAuditLog } from "../../lib/audit";
import {
  authenticate,
  clearRefreshCookie,
  createAccessToken,
  createRefreshSession,
  currentAuth,
  getRefreshCookie,
  hashToken,
  sessionExpiry,
  setRefreshCookie,
} from "../../middleware/authenticate";
import z from "zod";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
});

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((email) => email.toLowerCase()),
});

const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: z
    .string()
    .min(12)
    .max(128)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
      message: "Password must be at most 72 bytes",
    }),
});

const unknownPasswordHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);

function publicUser(user: {
  id: string;
  institutionId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}) {
  return {
    id: user.id,
    institutionId: user.institutionId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}

export function createAuthRouter(database: PrismaClient, config: ApiConfig) {
  const router = Router();
  const requireAuth = authenticate(database, config);

  router.post("/login", async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = await database.user.findUnique({ where: { email: input.email } });
    const matches = await bcrypt.compare(input.password, user?.passwordHash ?? unknownPasswordHash);
    if (!user || !matches || user.status !== AccountStatus.ACTIVE) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    const { refreshToken, session } = await createRefreshSession(database, user.id, config);
    await writeAuditLog(database, {
      institutionId: user.institutionId,
      actorId: user.id,
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
    });
    const accessToken = await createAccessToken(
      {
        userId: user.id,
        institutionId: user.institutionId,
        role: user.role,
        sessionId: session.id,
      },
      config,
    );
    setRefreshCookie(response, refreshToken, config);
    response.json({
      data: {
        accessToken,
        expiresIn: 600,
        user: publicUser(user),
      },
    });
  });

  router.post("/refresh", async (request, response) => {
    const refreshToken = getRefreshCookie(request.headers.cookie);
    if (!refreshToken) {
      throw new ApiError(401, "UNAUTHENTICATED", "A refresh session is required");
    }
    const now = new Date();
    const session = await database.authSession.findFirst({
      where: {
        tokenHash: hashToken(refreshToken),
        revokedAt: null,
        expiresAt: { gt: now },
        user: { status: AccountStatus.ACTIVE },
      },
      include: { user: true },
    });
    if (!session) {
      clearRefreshCookie(response, config);
      throw new ApiError(401, "UNAUTHENTICATED", "The refresh session is invalid or expired");
    }

    const rotatedToken = randomBytes(48).toString("base64url");
    const rotated = await database.authSession.updateMany({
      where: {
        id: session.id,
        tokenHash: hashToken(refreshToken),
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        tokenHash: hashToken(rotatedToken),
        expiresAt: sessionExpiry(),
      },
    });
    if (rotated.count !== 1) {
      clearRefreshCookie(response, config);
      throw new ApiError(401, "UNAUTHENTICATED", "The refresh session has already been used");
    }

    const accessToken = await createAccessToken(
      {
        userId: session.user.id,
        institutionId: session.user.institutionId,
        role: session.user.role,
        sessionId: session.id,
      },
      config,
    );
    setRefreshCookie(response, rotatedToken, config);
    response.json({
      data: {
        accessToken,
        expiresIn: 600,
        user: publicUser(session.user),
      },
    });
  });

  router.post("/logout", async (request, response) => {
    const refreshToken = getRefreshCookie(request.headers.cookie);
    if (refreshToken) {
      await database.authSession.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshCookie(response, config);
    response.status(204).end();
  });

  router.get("/me", requireAuth, async (_request, response) => {
    const auth = currentAuth(response);
    const user = await database.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        institutionId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new ApiError(401, "UNAUTHENTICATED", "The account is no longer active");
    }
    response.json({ data: user });
  });

  router.post("/forgot-password", async (request, response) => {
    forgotPasswordSchema.parse(request.body);
    // A reset request must not be reported as successful until a real delivery
    // provider exists; no reset token is created or logged in this state.
    response.status(503).json({
      error: {
        code: "EMAIL_DELIVERY_NOT_CONFIGURED",
        message: "Password reset is unavailable until an email provider is configured",
        requestId: request.id,
      },
    });
  });

  router.post("/reset-password", async (request, response) => {
    const input = resetPasswordSchema.parse(request.body);
    const tokenHash = hashToken(input.token);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const now = new Date();
    await database.$transaction(async (transaction) => {
      const resetToken = await transaction.passwordResetToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        include: { user: { select: { institutionId: true } } },
      });
      if (!resetToken) {
        throw new ApiError(400, "INVALID_RESET_TOKEN", "The reset token is invalid or expired");
      }
      await transaction.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      });
      await transaction.user.update({
        where: { id: resetToken.userId, status: AccountStatus.ACTIVE },
        data: { passwordHash },
      });
      await transaction.authSession.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await writeAuditLog(transaction, {
        institutionId: resetToken.user.institutionId,
        actorId: resetToken.userId,
        action: "auth.password_reset",
        entityType: "User",
        entityId: resetToken.userId,
      });
    });
    response.status(204).end();
  });

  return router;
}
