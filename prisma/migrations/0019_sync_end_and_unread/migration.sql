-- Additive: ending a sync, and per-member read markers for unread counts.
ALTER TYPE "SyncStatus" ADD VALUE 'ENDED';
ALTER TABLE "Sync" ADD COLUMN "endedAt" TIMESTAMP(3);
-- Existing members start fully read.
ALTER TABLE "ConversationMember" ADD COLUMN "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
