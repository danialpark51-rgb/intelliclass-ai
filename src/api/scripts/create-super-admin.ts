import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import z from "zod";
import { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../lib/audit";

const inputSchema = z.object({
  SUPER_ADMIN_EMAIL: z
    .string()
    .email()
    .max(320)
    .transform((email) => email.trim().toLowerCase()),
  SUPER_ADMIN_PASSWORD: z
    .string()
    .min(12)
    .max(128)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72),
});

const parsed = inputSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (12–72 UTF-8 bytes) in Replit Secrets before bootstrapping.",
  );
  process.exit(1);
}

const database = new PrismaClient();
try {
  const email = parsed.data.SUPER_ADMIN_EMAIL;
  const passwordHash = await bcrypt.hash(parsed.data.SUPER_ADMIN_PASSWORD, 12);
  const existing = await database.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new Error("That email already has an account; bootstrap will not change or promote it.");
  }

  await database.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        email,
        firstName: "Super",
        lastName: "Admin",
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        institutionId: null,
      },
      select: { id: true },
    });
    await writeAuditLog(transaction, {
      actorId: user.id,
      action: "user.super_admin.bootstrapped",
      entityType: "User",
      entityId: user.id,
    });
  });
  console.info("Super Admin account created. Remove the bootstrap secrets when you are done.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Super Admin bootstrap failed");
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
