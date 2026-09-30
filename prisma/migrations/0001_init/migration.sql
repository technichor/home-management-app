-- CreateEnum
CREATE TYPE "ContactCategory" AS ENUM ('FAMILY_FRIEND', 'SERVICE_PROVIDER', 'MEDICAL_SCHOOL', 'HOUSEHOLD_ADMIN');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('CONTACT', 'HOUSEHOLD');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'RESTORED');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('CSV_IMPORT', 'MANUAL');

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mailingAddress" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "urlSlug" TEXT,
    "passwordHash" TEXT,
    "headOfHousehold" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "householdId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nickname" TEXT,
    "category" "ContactCategory" NOT NULL,
    "address" TEXT,
    "phoneMobile" TEXT,
    "phoneHome" TEXT,
    "phoneWork" TEXT,
    "emailPrimary" TEXT,
    "emailSecondary" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "relationshipNotes" TEXT,
    "linkedFamilyMember" TEXT,
    "importantDate1" TEXT,
    "importantDate1Label" TEXT,
    "importantDate2" TEXT,
    "importantDate2Label" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLogEntry" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "changedFields" JSONB,
    "source" "ActivitySource" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportVersion" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,
    "contactsSnapshot" JSONB NOT NULL,
    "householdsSnapshot" JSONB NOT NULL,

    CONSTRAINT "ImportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Household_urlSlug_key" ON "Household"("urlSlug");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportVersion" ADD CONSTRAINT "ImportVersion_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
