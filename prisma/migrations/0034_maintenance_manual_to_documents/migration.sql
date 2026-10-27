-- Documents stage 5b (docs/domains/documents.md): each Maintenance item's manual link becomes a Document of type
-- "manual" pointing at the item, with the link labelled "Manual"; then the column goes. Apply only after the code that
-- no longer reads MaintenanceItem.manualUrl is deployed. The category is the Manual type's (Manuals, warranties &
-- valuables), as for any typed document, so editing it later doesn't move it.
BEGIN;

INSERT INTO "Document" ("id", "householdId", "title", "category", "typeKey", "maintenanceItemId", "createdAt", "updatedAt")
SELECT 'manual_' || "id", "householdId", "name" || ' manual', 'POSSESSIONS'::"DocumentCategory", 'manual', "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "MaintenanceItem"
WHERE "manualUrl" IS NOT NULL;

INSERT INTO "DocumentLink" ("id", "documentId", "url", "label", "position")
SELECT 'manual_link_' || "id", 'manual_' || "id", "manualUrl", 'Manual', 0
FROM "MaintenanceItem"
WHERE "manualUrl" IS NOT NULL;

ALTER TABLE "MaintenanceItem" DROP COLUMN "manualUrl";

COMMIT;
