-- Additive: household-wide meal planner settings.
CREATE TYPE "WeekStartDay" AS ENUM ('SUNDAY', 'MONDAY');
CREATE TABLE "MealPlanSettings" (
    "householdId" TEXT NOT NULL,
    "weekStartsOn" "WeekStartDay" NOT NULL DEFAULT 'SUNDAY',
    "showBreakfast" BOOLEAN NOT NULL DEFAULT false,
    "showLunch" BOOLEAN NOT NULL DEFAULT true,
    "showDinner" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MealPlanSettings_pkey" PRIMARY KEY ("householdId")
);
ALTER TABLE "MealPlanSettings" ADD CONSTRAINT "MealPlanSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
