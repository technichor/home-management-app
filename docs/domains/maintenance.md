# Domain: Maintenance

Status: **MVP placeholder, merged to `main` 2026-10-05.** Migration 0025 is additive. There is no full requirements doc yet; this is a first inventory to build on.

## What this domain is

An inventory of the things a household has to take care of: the furnaces, the refrigerator, the air filters. Each item records what it is (so it can be described to a repair person), how old it is, and how often it needs service. Access is like every other domain: any signed-in household account reads and writes everything of its own household; the household comes from the session and an id sent from the browser is checked against it. Deleting is a hard delete (no undo, no history).

## Schema (migration 0025)

`MaintenanceItem`: `householdId`, `name` (required), `category` (`MaintenanceCategory` HVAC \| APPLIANCE \| PLUMBING \| ELECTRICAL \| EXTERIOR \| YARD \| VEHICLE \| OTHER), `location`, `brand`, `modelNumber`, `serialNumber`, `installedYear` (a year, since a year is what is usually known), `warrantyUntil`, `serviceEveryMonths`, `lastServicedOn`, `manualUrl`, `notes`.

## Rules

- **Age** is the calendar-year difference between the browser's "today" and `installedYear` (`lib/maintenance.ts`).
- **Next service** is derived: `lastServicedOn` + `serviceEveryMonths`, on the same day of the month (clamped to a shorter month's end). It is never stored. A scheduled item with no recorded service says so and is not called overdue; one past its date reads "Service was due ...", in the danger colour.
- **"Serviced today"** on the detail page records the browser's date as `lastServicedOn`. "Today" is the browser's date, supplied as `?today=` by `components/LocalToday.tsx`, as in Meals and the Calendar.
- **`manualUrl` is a link only** (http or https, checked when saved so it can never be a `javascript:` link; opened in a new tab with `rel="noopener noreferrer"`). There is no file storage yet, so manuals can't be attached.
- Notes are plain text.

## Screens

`/maintenance` (search by name, brand, model or location; filter by category; sort by name or oldest), `/maintenance/new`, `/maintenance/[id]` (everything known, "Serviced today", Edit, Delete), `/maintenance/[id]/edit`. Maintenance is the seventh module, so on a phone it is under More.

## Key files

`lib/maintenance.ts` (schema, service status, age); `app/(app)/maintenance/{page,actions,MaintenanceClient,MaintenanceForm}`, `[id]/{page,MaintenanceDetailClient}`, `[id]/edit/page`, `new/page`. Tests: `tests/lib/maintenance.test.ts`, `tests/actions/maintenance.test.ts`, `tests/pages/maintenancePages.test.tsx`, `tests/components/maintenanceUi.test.tsx`, `e2e/maintenance.e2e.ts`.

## Ideas for next (not built, not decided)

- Show service due dates on the Calendar and the home page (the repeating items in `docs/domains/scheduling.md` are the natural tool once they are merged), with the item as the thing a reminder points at.
- Attach manuals and receipts (needs file storage, e.g. Vercel Blob).
- Link an item to the Contact who services it, and a service history (what was done, when, by whom, cost) instead of just the last date.
- Replacement planning ("furnaces over 20 years old"), a warranty-expiring view, and a simple report to print or share with a repair person.
- Per-item photos of the nameplate, and a CSV import/export like Contacts and Lists have.
