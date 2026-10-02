-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "accountContactId" TEXT;

-- AlterTable
ALTER TABLE "Sync" ADD COLUMN     "inviteTokenHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Sync_inviteTokenHash_key" ON "Sync"("inviteTokenHash");

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_accountContactId_fkey" FOREIGN KEY ("accountContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

