-- Additive: to-dos made for maintenance services that are due.
ALTER TABLE "ListItem" ADD COLUMN "maintenanceItemId" TEXT,
ADD COLUMN "serviceDueOn" DATE,
ADD COLUMN "previousServicedOn" DATE;
CREATE UNIQUE INDEX "ListItem_maintenanceItemId_serviceDueOn_key" ON "ListItem"("maintenanceItemId", "serviceDueOn");
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_maintenanceItemId_fkey" FOREIGN KEY ("maintenanceItemId") REFERENCES "MaintenanceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
