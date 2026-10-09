import { UserRole } from "@prisma/client";
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import z from "zod";
import { currentAuth, requireRoles } from "../../middleware/authenticate";
import {
  assertTimeZone,
  pageMeta,
  pageWindow,
  paginationSchema,
  parseQuery,
} from "../../lib/validation";
import { writeAuditLog } from "../../lib/audit";

const createInstitutionSchema = z.object({
  name: z.string().trim().min(2).max(160),
  timeZone: z.string().trim().min(1).max(64).default("UTC"),
});

const listSchema = paginationSchema;

export function createInstitutionRouter(database: PrismaClient) {
  const router = Router();
  router.use(requireRoles(UserRole.SUPER_ADMIN));

  router.get("/", async (request, response) => {
    const pagination = parseQuery(listSchema, request);
    const where = {};
    const [institutions, total] = await Promise.all([
      database.institution.findMany({
        where,
        ...pageWindow(pagination),
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, timeZone: true, createdAt: true, updatedAt: true },
      }),
      database.institution.count({ where }),
    ]);
    response.json({
      data: institutions,
      pagination: pageMeta(pagination.page, pagination.pageSize, total),
    });
  });

  router.post("/", async (request, response) => {
    const input = createInstitutionSchema.parse(request.body);
    const institution = await database.$transaction(async (transaction) => {
      const created = await transaction.institution.create({
        data: { name: input.name, timeZone: assertTimeZone(input.timeZone) },
      });
      await writeAuditLog(transaction, {
        actorId: currentAuth(response).userId,
        institutionId: created.id,
        action: "institution.created",
        entityType: "Institution",
        entityId: created.id,
      });
      return created;
    });
    response.status(201).json({ data: institution });
  });

  return router;
}
