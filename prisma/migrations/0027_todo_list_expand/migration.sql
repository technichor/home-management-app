-- Expand (additive; safe to apply while the previous code is running): the to-do list kind and due dates.
-- CalendarItem.kind gets a default so code that no longer knows about it can still insert events until 0028 drops it.
ALTER TYPE "ListKind" ADD VALUE 'TODO';
ALTER TABLE "ListItem" ADD COLUMN "dueDate" DATE;
ALTER TABLE "CalendarItem" ALTER COLUMN "kind" SET DEFAULT 'EVENT';
