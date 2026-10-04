-- Messaging becomes channels (step 2 of 2): drop the columns nothing reads any more. Apply this only
-- AFTER the code that no longer knows about them is deployed.

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_relatedContactId_fkey";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_syncId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderContactId_fkey";

-- DropIndex
DROP INDEX "Conversation_relatedContactId_idx";

-- DropIndex
DROP INDEX "Conversation_syncId_idx";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "relatedContactId",
DROP COLUMN "scope",
DROP COLUMN "syncId";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "senderContactId";

-- DropEnum
DROP TYPE "ConversationScope";
