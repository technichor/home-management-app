-- Contract: apply only AFTER the code that no longer reads these columns is deployed.
-- 1. Move every calendar task to its household's to-do list (creating the list where there is none), keeping title,
--    notes, assignee, date (as the due date) and completion. Open tasks go to the bottom of the open items, oldest first.
INSERT INTO "List" ("id", "householdId", "name", "tags", "sortMode", "kind", "createdAt", "updatedAt")
SELECT 'todo-' || t."householdId", t."householdId", 'To-do list', '{}', 'MANUAL', 'TODO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "householdId" FROM "CalendarItem" WHERE "kind" = 'TASK') t
WHERE NOT EXISTS (SELECT 1 FROM "List" l WHERE l."householdId" = t."householdId" AND l."kind" = 'TODO');

INSERT INTO "ListItem" ("id", "listId", "text", "notes", "assignedToContactId", "checked", "checkedAt", "position", "dueDate",
                        "rating", "comparisonCount", "createdAt", "updatedAt")
SELECT 'task-' || c."id", l."id", c."title", c."notes", c."assigneeContactId", c."completedAt" IS NOT NULL, c."completedAt",
       COALESCE((SELECT MAX(i."position") FROM "ListItem" i WHERE i."listId" = l."id"), -1)
         + ROW_NUMBER() OVER (PARTITION BY l."id" ORDER BY c."date", c."createdAt"),
       c."date", 1500, 0, c."createdAt", CURRENT_TIMESTAMP
FROM "CalendarItem" c
JOIN LATERAL (SELECT "id" FROM "List" WHERE "householdId" = c."householdId" AND "kind" = 'TODO' ORDER BY "createdAt" ASC LIMIT 1) l ON TRUE
WHERE c."kind" = 'TASK';

DELETE FROM "CalendarItem" WHERE "kind" = 'TASK';

-- 2. Drop what only tasks used.
ALTER TABLE "CalendarItem" DROP COLUMN "kind",
DROP COLUMN "completedAt",
DROP COLUMN "repeatAnchor";
DROP TYPE "CalendarKind";
