-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ConversationScope" AS ENUM ('HOUSEHOLD', 'SYNCED');

-- CreateTable
CREATE TABLE "Sync" (
    "id" TEXT NOT NULL,
    "initiatingHouseholdId" TEXT NOT NULL,
    "counterpartHouseholdId" TEXT,
    "relatedContactId" TEXT NOT NULL,
    "counterpartEmail" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "scope" "ConversationScope" NOT NULL,
    "householdId" TEXT,
    "syncId" TEXT,
    "relatedContactId" TEXT,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderContactId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachmentIds" TEXT[],
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sync_initiatingHouseholdId_idx" ON "Sync"("initiatingHouseholdId");

-- CreateIndex
CREATE INDEX "Sync_counterpartHouseholdId_idx" ON "Sync"("counterpartHouseholdId");

-- CreateIndex
CREATE INDEX "Sync_relatedContactId_idx" ON "Sync"("relatedContactId");

-- CreateIndex
CREATE INDEX "Conversation_householdId_idx" ON "Conversation"("householdId");

-- CreateIndex
CREATE INDEX "Conversation_syncId_idx" ON "Conversation"("syncId");

-- CreateIndex
CREATE INDEX "Conversation_relatedContactId_idx" ON "Conversation"("relatedContactId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Sync" ADD CONSTRAINT "Sync_initiatingHouseholdId_fkey" FOREIGN KEY ("initiatingHouseholdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sync" ADD CONSTRAINT "Sync_counterpartHouseholdId_fkey" FOREIGN KEY ("counterpartHouseholdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sync" ADD CONSTRAINT "Sync_relatedContactId_fkey" FOREIGN KEY ("relatedContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_syncId_fkey" FOREIGN KEY ("syncId") REFERENCES "Sync"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_relatedContactId_fkey" FOREIGN KEY ("relatedContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderContactId_fkey" FOREIGN KEY ("senderContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

