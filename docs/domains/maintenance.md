# Domain: Maintenance

Status: **MVP placeholder, merged to `main` 2026-10-05.** Migration 0025 is additive. There is no full requirements doc yet; this is a first inventory to build on.

## What this domain is

An inventory of the things a household has to take care of: the furnaces, the refrigerator, the air filters. Each item records what it is (so it can be described to a repair person), how old it is, and how often it needs service. Access is like every other domain: any signed-in household account reads and writes everything of its own household; the household comes from the session and an id sent from the browser is checked against it. Deleting is a hard delete (no undo, no history).

## Schema (migration 0025)

`MaintenanceItem`: `householdId`, `name` (required), `category` (`MaintenanceCategory` HVAC \| APPLIANCE \| PLUMBING \| ELECTRICAL \| EXTERIOR \| YARD \| VEHICLE \| OTHER), `location`, `brand`, `modelNumber`, `serialNumber`, `installedYear` (a year, since a year is what is usually known), `warrantyUntil`, `serviceEveryMonths`, `lastServicedOn`, `notes`. (A manual link used to be a field, `manualUrl`; migration 0034 moved each one into a Document.)

## Rules

- **Age** is the calendar-year difference between the browser's "today" and `installedYear` (`lib/maintenance.ts`).
- **Next service** is derived: `lastServicedOn` + `serviceEveryMonths`, on the same day of the month (clamped to a shorter month's end). It is never stored. A scheduled item with no recorded service says so and is not called overdue; one past its date reads "Service was due ...", in the danger colour.
- **"Serviced today"** on the detail page records the browser's date as `lastServicedOn` (and checks off the item's to-do, if one is open).
- **Due services become to-dos** 7 days ahead; checking one off records the service. See `docs/domains/todo.md`. "Today" is the browser's date (`lib/today.ts`), as in Meals and the Calendar.
- **Manuals, warranties and receipts are Documents** (`docs/domains/documents.md`): the item's page has a Documents section listing those pointing at it, with Add document (pre-filled with the item; type Manual for anything but a vehicle). A vehicle's section also suggests its title, registration, insurance card and loan or lease. Links only; there is no file storage yet.
- Notes are plain text.

## Screens

`/maintenance` (search by name, brand, model or location; filter by category; sort by name or oldest), `/maintenance/new`, `/maintenance/[id]` (everything known, "Serviced today", Edit, Delete), `/maintenance/[id]/edit`. Maintenance is the seventh module, so on a phone it is under More.

## Key files

`lib/maintenance.ts` (schema, service status, age); `app/(app)/maintenance/{page,actions,MaintenanceClient,MaintenanceForm}`, `[id]/{page,MaintenanceDetailClient}`, `[id]/edit/page`, `new/page`. Tests: `tests/lib/maintenance.test.ts`, `tests/actions/maintenance.test.ts`, `tests/pages/maintenancePages.test.tsx`, `tests/components/maintenanceUi.test.tsx`, `e2e/maintenance.e2e.ts`.

## Ideas for next (not built, not decided)

- (Done 2026-10-07: services that come due become to-dos, and checking one off records the service. See "Maintenance to-dos" in `docs/domains/todo.md`.)
- Attach manuals and receipts (needs file storage, e.g. Vercel Blob).
- Link an item to the Contact who services it, and a service history (what was done, when, by whom, cost) instead of just the last date.
- Replacement planning ("furnaces over 20 years old"), a warranty-expiring view, and a simple report to print or share with a repair person.
- Per-item photos of the nameplate, and a CSV import/export like Contacts and Lists have.
