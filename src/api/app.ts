import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import type { PrismaClient } from "@prisma/client";
import type { ApiConfig } from "./config/env";
import { errorHandler, ApiError } from "./lib/errors";
import { authenticate } from "./middleware/authenticate";
import { openApiDocument } from "./openapi";
import { createAuthRouter } from "./modules/auth/router";
import type { PasswordResetEmailSender } from "./modules/auth/email";
import { createInstitutionRouter } from "./modules/institutions/router";
import { createUserRouter } from "./modules/users/router";
import { createClassRouter } from "./modules/classes/router";
import { createSubjectRouter } from "./modules/subjects/router";
import { createSessionRouter } from "./modules/sessions/router";
import { createDashboardRouter } from "./modules/dashboard/router";

function isTrustedSameOriginProxyRequest(request: import("express").Request, origin: string) {
  const remoteAddress = request.socket.remoteAddress;
  if (
    remoteAddress !== "127.0.0.1" &&
    remoteAddress !== "::1" &&
    remoteAddress !== "::ffff:127.0.0.1"
  ) {
    return false;
  }

  const forwardedHost = request.get("x-forwarded-host");
  const forwardedProtocol = request.get("x-forwarded-proto");
  if (
    !forwardedHost ||
    forwardedHost.includes(",") ||
    !forwardedProtocol ||
    forwardedProtocol.includes(",")
  ) {
    return false;
  }

  try {
    const requestOrigin = new URL(origin);
    const forwardedOrigin = `${forwardedProtocol}://${forwardedHost}`;
    const trustedOrigin = new URL(forwardedOrigin);
    return (
      ["http:", "https:"].includes(trustedOrigin.protocol) &&
      ["http", "https"].includes(forwardedProtocol) &&
      requestOrigin.origin === origin &&
      trustedOrigin.origin === forwardedOrigin &&
      !requestOrigin.username &&
      !requestOrigin.password &&
      requestOrigin.origin === trustedOrigin.origin
    );
  } catch {
    return false;
  }
}

function isConfiguredOriginAllowed(origin: string, configuredOrigins: string[]) {
  if (configuredOrigins.includes(origin)) return true;
  if (!configuredOrigins.includes("https://*.replit.app")) return false;

  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.origin === origin &&
      parsedOrigin.protocol === "https:" &&
      parsedOrigin.hostname.endsWith(".replit.app") &&
      parsedOrigin.hostname !== "replit.app" &&
      !parsedOrigin.username &&
      !parsedOrigin.password
    );
  } catch {
    return false;
  }
}

type ApiAppDependencies = {
  sendPasswordResetEmail?: PasswordResetEmailSender;
};

export function createApiApp(
  database: PrismaClient,
  config: ApiConfig,
  dependencies: ApiAppDependencies = {},
) {
  const app = express();
  const logger = pino({
    level: config.nodeEnv === "test" ? "silent" : "info",
    redact: ["req.headers.authorization", "req.headers.cookie"],
  });
  app.disable("x-powered-by");
  app.set("trust proxy", config.nodeEnv === "production" ? 1 : false);
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(request) {
          const path = new URL(request.url ?? "/", "http://localhost").pathname.replace(
            /(\/registration-invitations\/)[A-Za-z0-9_-]{43}$/,
            "$1[redacted]",
          );
          return {
            method: request.method,
            path,
          };
        },
        res(response) {
          return { statusCode: response.statusCode };
        },
      },
      customProps(request) {
        return { requestId: request.id };
      },
    }),
  );

  const corsOptions = {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
  };
  app.use((request, response, next) => {
    const origin = request.header("origin");
    if (!origin) {
      next();
      return;
    }

    const allowed =
      isConfiguredOriginAllowed(origin, config.frontendOrigins) ||
      isTrustedSameOriginProxyRequest(request, origin);
    if (!allowed) {
      next(
        new ApiError(
          403,
          "CORS_ORIGIN_DENIED",
          "Please open IntelliClass using an approved app address.",
        ),
      );
      return;
    }

    cors({ ...corsOptions, origin })(request, response, next);
  });
  app.use(helmet());
  app.use(express.json({ limit: "100kb", strict: true }));

  const generalLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.use("/api", generalLimiter);

  const databaseHealthCheck = async (_request: unknown, response: import("express").Response) => {
    try {
      await database.$queryRaw`SELECT 1`;
      response.json({ status: "ok" });
    } catch {
      response.status(503).json({ status: "unavailable" });
    }
  };
  app.get("/health", databaseHealthCheck);
  app.get("/healthz", databaseHealthCheck);

  const api = express.Router();
  api.get("/openapi.json", (_request, response) => response.json(openApiDocument));
  api.use(
    "/docs",
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
        },
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument),
  );

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
    },
  });
  const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many password reset requests. Try again later.",
      },
    },
  });
  const resetTokenLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many password reset attempts. Request a new link later.",
      },
    },
  });
  api.use("/auth/login", loginLimiter);
  api.use("/auth/forgot-password", passwordResetLimiter);
  api.use("/auth/reset-password", resetTokenLimiter);
  api.use("/auth", createAuthRouter(database, config, dependencies.sendPasswordResetEmail));

  const requireAuth = authenticate(database, config);
  api.use("/dashboard", requireAuth, createDashboardRouter(database));
  api.use("/institutions", requireAuth, createInstitutionRouter(database));
  api.use("/users", requireAuth, createUserRouter(database));
  api.use("/students", requireAuth, createUserRouter(database, "STUDENT"));
  api.use("/teachers", requireAuth, createUserRouter(database, "TEACHER"));
  api.use("/classes", requireAuth, createClassRouter(database));
  api.use("/subjects", requireAuth, createSubjectRouter(database));
  api.use("/sessions", requireAuth, createSessionRouter(database));

  api.use((_request, _response, next) =>
    next(new ApiError(404, "NOT_FOUND", "The requested API endpoint does not exist")),
  );
  app.use("/api/v1", api);
  app.use(errorHandler);
  return app;
}
