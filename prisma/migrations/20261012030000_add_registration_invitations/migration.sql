CREATE TABLE "RegistrationInvitation" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "createdById" UUID,
    "email" VARCHAR(320) NOT NULL,
    "role" "UserRole" NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationInvitation_tokenHash_key"
    ON "RegistrationInvitation"("tokenHash");
CREATE INDEX "RegistrationInvitation_institutionId_email_role_expiresAt_idx"
    ON "RegistrationInvitation"("institutionId", "email", "role", "expiresAt");
CREATE INDEX "RegistrationInvitation_expiresAt_acceptedAt_revokedAt_idx"
    ON "RegistrationInvitation"("expiresAt", "acceptedAt", "revokedAt");

ALTER TABLE "RegistrationInvitation"
    ADD CONSTRAINT "RegistrationInvitation_institutionId_fkey"
    FOREIGN KEY ("institutionId") REFERENCES "Institution"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistrationInvitation"
    ADD CONSTRAINT "RegistrationInvitation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
