-- Additive: repeating calendar items (all columns nullable or defaulted).
CREATE TYPE "RepeatUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');
ALTER TABLE "CalendarItem" ADD COLUMN     "repeatUnit" "RepeatUnit",
ADD COLUMN     "repeatEvery" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "repeatUntil" DATE,
ADD COLUMN     "repeatAnchor" DATE;
