-- Additive: the Documents module (docs/domains/documents.md): documents as links, their links, and dismissed suggestions.
-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('IDENTITY', 'HOME', 'VEHICLES', 'INSURANCE', 'TAXES', 'MONEY', 'LEGAL', 'MEDICAL', 'EDUCATION', 'WORK', 'POSSESSIONS', 'OTHER');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "typeKey" TEXT,
    "ownerContactId" TEXT,
    "maintenanceItemId" TEXT,
    "accountRecordId" TEXT,
    "originalLocation" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentDismissal" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "typeKey" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_householdId_idx" ON "Document"("householdId");

-- CreateIndex
CREATE INDEX "Document_ownerContactId_idx" ON "Document"("ownerContactId");

-- CreateIndex
CREATE INDEX "Document_maintenanceItemId_idx" ON "Document"("maintenanceItemId");

-- CreateIndex
CREATE INDEX "Document_accountRecordId_idx" ON "Document"("accountRecordId");

-- CreateIndex
CREATE INDEX "DocumentLink_documentId_idx" ON "DocumentLink"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentDismissal_householdId_typeKey_subjectKey_key" ON "DocumentDismissal"("householdId", "typeKey", "subjectKey");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerContactId_fkey" FOREIGN KEY ("ownerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_maintenanceItemId_fkey" FOREIGN KEY ("maintenanceItemId") REFERENCES "MaintenanceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_accountRecordId_fkey" FOREIGN KEY ("accountRecordId") REFERENCES "AccountRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDismissal" ADD CONSTRAINT "DocumentDismissal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

