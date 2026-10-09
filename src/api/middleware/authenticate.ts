import { jwtVerify, SignJWT } from "jose";
import type { RequestHandler, Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import type { UserRole } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { ApiConfig } from "../config/env";
import { ApiError } from "../lib/errors";

const TOKEN_ISSUER = "intelliclass-api";
const TOKEN_AUDIENCE = "intelliclass-client";
const REFRESH_COOKIE = "ic_session";
const SESSION_DAYS = 30;
const ACCESS_TOKEN_SECONDS = 10 * 60;

export type AuthIdentity = {
  userId: string;
  institutionId: string | null;
  role: UserRole;
  sessionId: string;
};

function signingKey(config: ApiConfig) {
  return new TextEncoder().encode(config.sessionSecret);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newRefreshToken() {
  return randomBytes(48).toString("base64url");
}

export async function createAccessToken(
  identity: Omit<AuthIdentity, "sessionId"> & { sessionId: string },
  config: ApiConfig,
) {
  return new SignJWT({
    role: identity.role,
    institutionId: identity.institutionId,
    sid: identity.sessionId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setSubject(identity.userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
    .sign(signingKey(config));
}

export async function createRefreshSession(
  database: PrismaClient,
  userId: string,
  config: ApiConfig,
) {
  const refreshToken = newRefreshToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await database.authSession.create({
    data: { userId, tokenHash: hashToken(refreshToken), expiresAt },
  });
  return { refreshToken, session };
}

export function setRefreshCookie(response: Response, token: string, config: ApiConfig) {
  response.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/api/v1/auth",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(response: Response, config: ApiConfig) {
  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/api/v1/auth",
  });
}

export function getRefreshCookie(header: string | undefined) {
  if (!header) return null;
  const item = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${REFRESH_COOKIE}=`));
  return item ? item.slice(REFRESH_COOKIE.length + 1) : null;
}

export function authenticate(database: PrismaClient, config: ApiConfig): RequestHandler {
  return async (request, response, next) => {
    try {
      const authorization = request.header("authorization");
      const match = authorization?.match(/^Bearer\s+(.+)$/i);
      if (!match) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required");

      const { payload } = await jwtVerify(match[1]!, signingKey(config), {
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
      });
      const userId = payload.sub;
      const sessionId = payload["sid"];
      if (typeof userId !== "string" || typeof sessionId !== "string") {
        throw new ApiError(401, "UNAUTHENTICATED", "The access token is invalid");
      }

      const session = await database.authSession.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: "ACTIVE" },
        },
        select: {
          id: true,
          user: { select: { id: true, institutionId: true, role: true } },
        },
      });
      if (!session) {
        throw new ApiError(401, "UNAUTHENTICATED", "The session is no longer active");
      }

      response.locals["auth"] = {
        userId: session.user.id,
        institutionId: session.user.institutionId,
        role: session.user.role,
        sessionId: session.id,
      } satisfies AuthIdentity;
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
        return;
      }
      next(new ApiError(401, "UNAUTHENTICATED", "The access token is invalid or expired"));
    }
  };
}

export function currentAuth(response: Response): AuthIdentity {
  const auth = response.locals["auth"] as AuthIdentity | undefined;
  if (!auth) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required");
  return auth;
}

export function requireInstitutionId(identity: AuthIdentity): string {
  if (!identity.institutionId) {
    throw new ApiError(
      403,
      "INSTITUTION_REQUIRED",
      "This account is not assigned to an institution",
    );
  }
  return identity.institutionId;
}

export function requireRoles(...allowedRoles: UserRole[]): RequestHandler {
  return (_request, response, next) => {
    try {
      const auth = currentAuth(response);
      if (!allowedRoles.includes(auth.role)) {
        throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export const refreshCookieName = REFRESH_COOKIE;
