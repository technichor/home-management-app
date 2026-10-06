-- Additive: the Maintenance inventory.
CREATE TYPE "MaintenanceCategory" AS ENUM ('HVAC', 'APPLIANCE', 'PLUMBING', 'ELECTRICAL', 'EXTERIOR', 'YARD', 'VEHICLE', 'OTHER');
CREATE TABLE "MaintenanceItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MaintenanceCategory" NOT NULL DEFAULT 'OTHER',
    "location" TEXT,
    "brand" TEXT,
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "installedYear" INTEGER,
    "warrantyUntil" DATE,
    "serviceEveryMonths" INTEGER,
    "lastServicedOn" DATE,
    "manualUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaintenanceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaintenanceItem_householdId_idx" ON "MaintenanceItem"("householdId");
ALTER TABLE "MaintenanceItem" ADD CONSTRAINT "MaintenanceItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
