-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "ownerHouseholdId" TEXT;

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "ownerHouseholdId" TEXT;

-- CreateIndex
CREATE INDEX "Contact_ownerHouseholdId_idx" ON "Contact"("ownerHouseholdId");

-- CreateIndex
CREATE INDEX "Household_ownerHouseholdId_idx" ON "Household"("ownerHouseholdId");

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_ownerHouseholdId_fkey" FOREIGN KEY ("ownerHouseholdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerHouseholdId_fkey" FOREIGN KEY ("ownerHouseholdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: until now every contact and passive household was shared by all accounts. Give them
-- to the oldest account household (one with a shared password), except contacts that belong to
-- another account household, which stay in that household's own directory.
UPDATE "Contact"
SET "ownerHouseholdId" = (SELECT "id" FROM "Household" WHERE "passwordHash" IS NOT NULL ORDER BY "createdAt" LIMIT 1);

UPDATE "Contact" c
SET "ownerHouseholdId" = c."householdId"
FROM "Household" h
WHERE h."id" = c."householdId" AND h."passwordHash" IS NOT NULL;

UPDATE "Household"
SET "ownerHouseholdId" = (SELECT "id" FROM "Household" WHERE "passwordHash" IS NOT NULL ORDER BY "createdAt" LIMIT 1)
WHERE "passwordHash" IS NULL;
