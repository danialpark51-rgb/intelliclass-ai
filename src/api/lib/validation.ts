import type { Request } from "express";
import z from "zod";
import { ApiError } from "./errors";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function parseId(value: string | string[] | undefined): string {
  const parsed = z
    .string()
    .uuid()
    .safeParse(Array.isArray(value) ? value[0] : value);
  if (!parsed.success) {
    throw new ApiError(400, "INVALID_ID", "A valid record ID is required");
  }
  return parsed.data;
}

export function parseQuery<T extends z.ZodType>(schema: T, request: Request): z.infer<T> {
  return schema.parse(request.query);
}

export function assertTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    throw new ApiError(400, "INVALID_TIME_ZONE", "A valid IANA time zone is required");
  }
}

export function pageWindow({ page, pageSize }: Pagination) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
