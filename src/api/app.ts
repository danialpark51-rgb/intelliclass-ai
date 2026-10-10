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
import { createInstitutionRouter } from "./modules/institutions/router";
import { createUserRouter } from "./modules/users/router";
import { createClassRouter } from "./modules/classes/router";
import { createSubjectRouter } from "./modules/subjects/router";
import { createSessionRouter } from "./modules/sessions/router";
import { createDashboardRouter } from "./modules/dashboard/router";

export function createApiApp(database: PrismaClient, config: ApiConfig) {
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
          return {
            method: request.method,
            path: new URL(request.url ?? "/", "http://localhost").pathname,
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

  app.use(
    cors({
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (config.frontendOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        if (
          config.nodeEnv !== "production" &&
          /^https:\/\/[a-z0-9-]+\.replit\.dev$/i.test(origin)
        ) {
          callback(null, true);
          return;
        }
        callback(new ApiError(403, "CORS_ORIGIN_DENIED", "This origin is not allowed"));
      },
    }),
  );
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
  api.use("/auth/login", loginLimiter);
  api.use("/auth", createAuthRouter(database, config));

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
