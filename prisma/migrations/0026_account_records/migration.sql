-- Additive: the Accounts directory (no secrets, no balances).
CREATE TYPE "AccountKind" AS ENUM ('BANK', 'CREDIT_CARD', 'LOAN', 'INVESTMENT', 'RETIREMENT', 'HEALTH_SAVINGS', 'INSURANCE', 'UTILITY', 'SUBSCRIPTION', 'OTHER');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'REVIEW', 'CLOSED');
CREATE TABLE "AccountRecord" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'OTHER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "institution" TEXT,
    "lastFour" TEXT,
    "ownerContactId" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountRecord_householdId_idx" ON "AccountRecord"("householdId");
CREATE INDEX "AccountRecord_ownerContactId_idx" ON "AccountRecord"("ownerContactId");
ALTER TABLE "AccountRecord" ADD CONSTRAINT "AccountRecord_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountRecord" ADD CONSTRAINT "AccountRecord_ownerContactId_fkey" FOREIGN KEY ("ownerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
