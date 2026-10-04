-- Messaging becomes channels with explicit members (step 1 of 2: only ADD things, so the code that
-- is running now keeps working; 0018 drops the old columns once the new code is live).

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('CHANNEL', 'GENERAL');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('MANAGER', 'MEMBER');

-- AlterTable: Conversation
ALTER TABLE "Conversation" ADD COLUMN "createdById" TEXT,
ADD COLUMN "kind" "ConversationKind" NOT NULL DEFAULT 'CHANNEL';
-- The new code no longer sets the old scope column, so give it a default until 0018 drops it.
ALTER TABLE "Conversation" ALTER COLUMN "scope" SET DEFAULT 'HOUSEHOLD';

-- AlterTable: Message (the sender is now the user; the old contact column stays for now but is optional)
ALTER TABLE "Message" ADD COLUMN "senderUserId" TEXT;
ALTER TABLE "Message" ALTER COLUMN "senderContactId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL DEFAULT 'MEMBER',
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationMember_userId_idx" ON "ConversationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "Conversation_kind_householdId_idx" ON "Conversation"("kind", "householdId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- Backfill ----

-- Every active household that has members gets its automatic General channel, with all of them in it.
INSERT INTO "Conversation" ("id", "kind", "householdId", "name", "scope", "createdAt", "updatedAt")
SELECT 'general_' || h."id", 'GENERAL', h."id", 'General', 'HOUSEHOLD', now(), now()
FROM "Household" h
WHERE h."deletedAt" IS NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u."householdId" = h."id");

INSERT INTO "ConversationMember" ("id", "conversationId", "userId", "role")
SELECT 'cm_' || md5(c."id" || u."id"), c."id", u."id", 'MEMBER'
FROM "Conversation" c JOIN "User" u ON u."householdId" = c."householdId"
WHERE c."kind" = 'GENERAL';

-- Existing household conversations (group chats, and the contact notes being retired) become channels
-- of all the household's members; its owners manage them. Notes are archived rather than deleted.
INSERT INTO "ConversationMember" ("id", "conversationId", "userId", "role")
SELECT 'cm_' || md5(c."id" || u."id"), c."id", u."id",
       CASE WHEN u."role" = 'OWNER' THEN 'MANAGER'::"ConversationRole" ELSE 'MEMBER'::"ConversationRole" END
FROM "Conversation" c JOIN "User" u ON u."householdId" = c."householdId"
WHERE c."kind" = 'CHANNEL' AND c."scope" = 'HOUSEHOLD'
ON CONFLICT DO NOTHING;

UPDATE "Conversation" SET "archivedAt" = COALESCE("archivedAt", now()) WHERE "relatedContactId" IS NOT NULL;

-- Existing synced conversations become channels of everyone in both households.
INSERT INTO "ConversationMember" ("id", "conversationId", "userId", "role")
SELECT 'cm_' || md5(c."id" || u."id"), c."id", u."id",
       CASE WHEN u."role" = 'OWNER' AND u."householdId" = s."initiatingHouseholdId" THEN 'MANAGER'::"ConversationRole" ELSE 'MEMBER'::"ConversationRole" END
FROM "Conversation" c
JOIN "Sync" s ON s."id" = c."syncId"
JOIN "User" u ON u."householdId" IN (s."initiatingHouseholdId", s."counterpartHouseholdId")
WHERE c."scope" = 'SYNCED'
ON CONFLICT DO NOTHING;

-- Messages were sent by a household's linked contact; point them at that contact's user.
UPDATE "Message" m SET "senderUserId" = u."id"
FROM "User" u
WHERE u."contactId" = m."senderContactId" AND m."senderUserId" IS NULL;
