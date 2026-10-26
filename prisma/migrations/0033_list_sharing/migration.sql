-- Additive: sharing lists (an owner, shared with the household by default, people with view or edit, a public link), a link on list items, and Gift ideas lists (docs/domains/lists.md, Sharing).
-- AlterEnum
ALTER TYPE "ListKind" ADD VALUE 'GIFT';

-- AlterTable
ALTER TABLE "List" ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "sharedWithHousehold" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ListItem" ADD COLUMN     "url" TEXT;

-- CreateTable
CREATE TABLE "ListShare" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListShare_userId_idx" ON "ListShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ListShare_listId_userId_key" ON "ListShare"("listId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "List_publicToken_key" ON "List"("publicToken");

-- CreateIndex
CREATE INDEX "List_ownerUserId_idx" ON "List"("ownerUserId");

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListShare" ADD CONSTRAINT "ListShare_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListShare" ADD CONSTRAINT "ListShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: every existing ordinary list is owned by its household's longest-standing owner (it stays shared with the
-- household, so nobody loses access). The shopping and to-do lists have no owner: they are the household's.
UPDATE "List" l
SET "ownerUserId" = (
  SELECT u."id" FROM "User" u
  WHERE u."householdId" = l."householdId" AND u."role" = 'OWNER'
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE l."kind" = 'STANDARD' AND l."ownerUserId" IS NULL;
