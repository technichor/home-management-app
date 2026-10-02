-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSuperuser" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminAuditEntry" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "targetUserId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditEntry_createdAt_idx" ON "AdminAuditEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminAuditEntry" ADD CONSTRAINT "AdminAuditEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditEntry" ADD CONSTRAINT "AdminAuditEntry_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The first superuser.
UPDATE "User" SET "isSuperuser" = true WHERE "email" = 'corey.b.becker@gmail.com';
