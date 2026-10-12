import { AccountStatus, Prisma, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { ApiConfig } from "../../config/env";
import { ApiError } from "../../lib/errors";
import { writeAuditLog } from "../../lib/audit";
import { createPasswordResetEmailSender, type PasswordResetEmailSender } from "./email";
import {
  authenticate,
  clearRefreshCookie,
  createAccessToken,
  createRefreshSession,
  currentAuth,
  getRefreshCookie,
  hashToken,
  requireInstitutionId,
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

const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const registrationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2)
    .max(201)
    .refine((name) => {
      const [firstName, ...lastName] = name.split(/\s+/);
      return Boolean(firstName && firstName.length <= 100 && lastName.join(" ").length <= 100);
    }, "Enter a name no longer than 100 characters per part"),
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((email) => email.toLowerCase()),
  password: z
    .string()
    .min(12)
    .max(128)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
      message: "Password must be at most 72 bytes",
    }),
  role: z.enum([
    UserRole.STUDENT,
    UserRole.TEACHER,
    UserRole.INSTITUTION_ADMIN,
    UserRole.SUPER_ADMIN,
  ]),
  inviteToken: inviteTokenSchema,
});

const registrationInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((email) => email.toLowerCase()),
  role: z.enum([
    UserRole.STUDENT,
    UserRole.TEACHER,
    UserRole.INSTITUTION_ADMIN,
    UserRole.SUPER_ADMIN,
  ]),
  institutionId: z.string().uuid().optional(),
});

const invitationVerificationSchema = z.object({ inviteToken: inviteTokenSchema });

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

export function createAuthRouter(
  database: PrismaClient,
  config: ApiConfig,
  sendPasswordResetEmail: PasswordResetEmailSender | null = config.smtp
    ? createPasswordResetEmailSender(config.smtp)
    : null,
) {
  const router = Router();
  const requireAuth = authenticate(database, config);
  const registrationLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const invitationVerificationLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.post(
    "/registration-invitations/verify",
    invitationVerificationLimiter,
    async (request, response) => {
      const { inviteToken } = invitationVerificationSchema.parse(request.body);
      const invitation = await database.registrationInvitation.findFirst({
        where: {
          tokenHash: hashToken(inviteToken),
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { email: true, role: true, expiresAt: true },
      });
      if (!invitation) {
        throw new ApiError(
          404,
          "INVALID_INVITATION",
          "This registration invitation is invalid, expired, or has already been used.",
        );
      }
      response.json({
        data: {
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        },
      });
    },
  );

  router.get(
    "/registration-invitations/:token",
    invitationVerificationLimiter,
    async (request, response) => {
    const token = inviteTokenSchema.parse(request.params["token"]);
    const invitation = await database.registrationInvitation.findFirst({
      where: {
        tokenHash: hashToken(token),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { email: true, role: true, expiresAt: true },
    });
    if (!invitation) {
      throw new ApiError(
        404,
        "INVALID_INVITATION",
        "This registration invitation is invalid, expired, or has already been used.",
      );
    }
    response.json({
      data: {
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
    });
    },
  );

  router.post("/registration-invitations", requireAuth, async (request, response) => {
    const input = registrationInvitationSchema.parse(request.body);
    const actor = currentAuth(response);
    if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.INSTITUTION_ADMIN) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only administrators can issue registration invitations.",
      );
    }
    if (
      actor.role === UserRole.INSTITUTION_ADMIN &&
      input.role !== UserRole.STUDENT &&
      input.role !== UserRole.TEACHER
    ) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Institution administrators can invite students and teachers only.",
      );
    }

    const institutionId =
      actor.role === UserRole.SUPER_ADMIN
        ? input.institutionId
        : requireInstitutionId(actor);
    if (!institutionId) {
      throw new ApiError(
        400,
        "INSTITUTION_REQUIRED",
        "Select an institution before creating this invitation.",
      );
    }
    if (
      actor.role === UserRole.INSTITUTION_ADMIN &&
      input.institutionId &&
      input.institutionId !== institutionId
    ) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Institution administrators can only invite users to their own institution.",
      );
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await database.$transaction(async (transaction) => {
      const institution = await transaction.institution.findUnique({
        where: { id: institutionId },
        select: { id: true },
      });
      if (!institution) {
        throw new ApiError(404, "INSTITUTION_NOT_FOUND", "The selected institution was not found.");
      }

      const existingUser = await transaction.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existingUser) {
        throw new ApiError(
          409,
          "EMAIL_ALREADY_REGISTERED",
          "An account with this email already exists.",
        );
      }

      await transaction.registrationInvitation.updateMany({
        where: {
          institutionId,
          email: input.email,
          role: input.role,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      const createdInvitation = await transaction.registrationInvitation.create({
        data: {
          institutionId,
          createdById: actor.userId,
          email: input.email,
          role: input.role,
          tokenHash,
          expiresAt,
        },
      });
      await writeAuditLog(transaction, {
        institutionId,
        actorId: actor.userId,
        action: "auth.invitation.create",
        entityType: "RegistrationInvitation",
        entityId: createdInvitation.id,
        metadata: { role: input.role },
      });
      return createdInvitation;
    });

    response.status(201).json({
      data: {
        email: invitation.email,
        role: invitation.role,
        token,
        expiresAt: invitation.expiresAt,
      },
    });
  });

  router.post("/register", registrationLimiter, async (request, response) => {
    const input = registrationSchema.parse(request.body);
    const tokenHash = hashToken(input.inviteToken);
    const now = new Date();
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const created = await database.$transaction(async (transaction) => {
        const invitation = await transaction.registrationInvitation.findUnique({
          where: { tokenHash },
        });
        if (
          !invitation ||
          invitation.acceptedAt ||
          invitation.revokedAt ||
          invitation.expiresAt <= now ||
          invitation.email !== input.email ||
          invitation.role !== input.role
        ) {
          throw new ApiError(
            400,
            "INVALID_INVITATION",
            "This registration invitation is invalid, expired, or does not match the email and role.",
          );
        }

        const claimed = await transaction.registrationInvitation.updateMany({
          where: {
            id: invitation.id,
            email: input.email,
            role: input.role,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { acceptedAt: now },
        });
        if (claimed.count !== 1) {
          throw new ApiError(
            400,
            "INVALID_INVITATION",
            "This registration invitation is invalid, expired, or has already been used.",
          );
        }

        const [firstName, ...lastName] = input.fullName.split(/\s+/);
        const user = await transaction.user.create({
          data: {
            institutionId:
              invitation.role === UserRole.SUPER_ADMIN ? null : invitation.institutionId,
            email: input.email,
            firstName: firstName!,
            lastName: lastName.join(" "),
            passwordHash,
            role: invitation.role,
            status: AccountStatus.ACTIVE,
            ...(invitation.role === UserRole.STUDENT
              ? { studentProfile: { create: {} } }
              : invitation.role === UserRole.TEACHER
                ? { teacherProfile: { create: {} } }
                : {}),
          },
          select: {
            id: true,
            institutionId: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        });
        const { refreshToken, session } = await createRefreshSession(
          transaction,
          user.id,
          config,
        );
        await writeAuditLog(transaction, {
          institutionId: invitation.institutionId,
          actorId: user.id,
          action: "auth.register",
          entityType: "User",
          entityId: user.id,
          metadata: { role: user.role, invitationId: invitation.id },
        });
        return { user, refreshToken, session };
      });

      const accessToken = await createAccessToken(
        {
          userId: created.user.id,
          institutionId: created.user.institutionId,
          role: created.user.role,
          sessionId: created.session.id,
        },
        config,
      );
      setRefreshCookie(response, created.refreshToken, config);
      response.status(201).json({
        data: {
          accessToken,
          expiresIn: 600,
          user: publicUser(created.user),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists.");
      }
      throw error;
    }
  });

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
    const input = forgotPasswordSchema.parse(request.body);
    if (!sendPasswordResetEmail) {
      throw new ApiError(
        503,
        "EMAIL_DELIVERY_NOT_CONFIGURED",
        "Password reset is not configured yet. Contact your institution administrator.",
      );
    }
    const appUrl = config.appUrl;
    if (!appUrl) {
      throw new ApiError(
        503,
        "APP_URL_NOT_CONFIGURED",
        "Password reset is not configured yet. Contact your institution administrator.",
      );
    }

    const user = await database.user.findUnique({
      where: { email: input.email },
      select: { id: true, status: true },
    });
    if (user?.status === AccountStatus.ACTIVE) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashToken(token);
      const now = new Date();

      await database.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      const resetToken = await database.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(now.getTime() + 30 * 60_000),
        },
        select: { id: true },
      });
      const resetUrl = new URL("/reset-password", appUrl);
      resetUrl.searchParams.set("token", token);

      try {
        await sendPasswordResetEmail(input.email, resetUrl.toString());
      } catch (error) {
        await database.passwordResetToken.updateMany({
          where: { id: resetToken.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        request.log.warn(
          { errorName: error instanceof Error ? error.name : "UnknownError" },
          "Password reset email delivery failed",
        );
      }
    }

    // Keep both the response and status the same for known and unknown accounts.
    response.status(202).json({
      data: {
        message: "If an account with that email exists, password-reset instructions will be sent.",
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
        throw new ApiError(
          400,
          "INVALID_RESET_TOKEN",
          "This password reset link is invalid or expired. Request a new link.",
        );
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
