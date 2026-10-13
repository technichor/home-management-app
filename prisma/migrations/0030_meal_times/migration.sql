-- Additive: the usual time of each meal, for placing planned meals on the calendar's hours.
ALTER TABLE "MealPlanSettings" ADD COLUMN "breakfastTime" TEXT,
ADD COLUMN "lunchTime" TEXT,
ADD COLUMN "dinnerTime" TEXT;
