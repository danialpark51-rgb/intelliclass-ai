import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        requestId: request.id,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request data is invalid",
        details: error.issues.map((issue) => ({
          path: issue.path.map(String),
          message: issue.message,
        })),
        requestId: request.id,
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      response.status(409).json({
        error: {
          code: "RESOURCE_CONFLICT",
          message: "A record with those unique values already exists",
          requestId: request.id,
        },
      });
      return;
    }
    if (error.code === "P2025") {
      response.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "The requested record was not found",
          requestId: request.id,
        },
      });
      return;
    }
  }

  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON",
        requestId: request.id,
      },
    });
    return;
  }

  if (error instanceof Error && error.message === "request entity too large") {
    response.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds the 100 KB limit",
        requestId: request.id,
      },
    });
    return;
  }

  request.log.error(
    { errorType: error instanceof Error ? error.name : "unknown" },
    "Unhandled API error",
  );
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected server error occurred",
      requestId: request.id,
    },
  });
};
