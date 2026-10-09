import type { Prisma, PrismaClient } from "@prisma/client";

type AuditEvent = {
  institutionId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAuditLog(
  database: PrismaClient | Prisma.TransactionClient,
  event: AuditEvent,
) {
  await database.auditLog.create({
    data: {
      institutionId: event.institutionId ?? null,
      actorId: event.actorId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
    },
  });
}
