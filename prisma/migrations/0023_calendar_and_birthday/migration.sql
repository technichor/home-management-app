-- Additive: calendar items and settings, and a dedicated contact birthday.
CREATE TYPE "CalendarKind" AS ENUM ('EVENT', 'TASK');
ALTER TABLE "Contact" ADD COLUMN     "birthdayDay" INTEGER,
ADD COLUMN     "birthdayMonth" INTEGER,
ADD COLUMN     "birthdayYear" INTEGER;
CREATE TABLE "CalendarItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "CalendarKind" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "assigneeContactId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CalendarSettings" (
    "householdId" TEXT NOT NULL,
    "showMeals" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarSettings_pkey" PRIMARY KEY ("householdId")
);
CREATE INDEX "CalendarItem_householdId_date_idx" ON "CalendarItem"("householdId", "date");
CREATE INDEX "CalendarItem_assigneeContactId_idx" ON "CalendarItem"("assigneeContactId");
ALTER TABLE "CalendarItem" ADD CONSTRAINT "CalendarItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarItem" ADD CONSTRAINT "CalendarItem_assigneeContactId_fkey" FOREIGN KEY ("assigneeContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarSettings" ADD CONSTRAINT "CalendarSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
