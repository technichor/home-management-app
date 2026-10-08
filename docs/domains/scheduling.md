# Domain: Scheduling & Reminders

Status: **Built and deployed to production (merged to `main` 2026-10-05).** Migration 0023 is additive and applied to the production database. **Recurrence** (migration 0024, additive) is merged to `main` (2026-10-05) and applied to production.

## What this domain is

A household calendar of **events** (`CalendarItem`: a date, optionally a start and end time; an event with no time is a reminder). Tasks were moved to their own module on 2026-10-06 (see `docs/domains/todo.md`); the calendar no longer has tasks, completion, or an overdue strip. Items can be assigned to one Contact (a household member) or to the whole household. The calendar also shows, read-only, dates derived from Contacts (birthdays and the two important dates) and, optionally, planned meals.

Access is the same as every other domain: any signed-in household account reads and writes everything of its own household; the household comes from the session, and any id sent from the browser (item, assignee) is checked to belong to it. Deleting an item is a hard delete; there is no activity log.

## Schema (migration 0023)

| Model / field | Notes |
|---|---|
| `CalendarItem` | `householdId`, `title` (max 200), `notes` (max 5000, plain text), `date` (`@db.Date`), `startTime`/`endTime` (`HH:MM` strings, end needs a start), `assigneeContactId` (nullable, `onDelete: SetNull`), repeat fields. `@@index([householdId, date])`. (`kind`, `completedAt` and `repeatAnchor` were dropped in migration 0028.) |
| `CalendarSettings` | One row per household, created on first read: `showMeals` (default false). |
| `Contact.birthdayMonth/Day/Year` | See `docs/domains/contacts.md`. |

The first day of the week is **not** stored here: it is `MealPlanSettings.weekStartsOn`, shared with the meal planner (changing it in either place changes both). Folding it into a household-level setting is a possible later cleanup.

## Rules

- **Dates are plain `YYYY-MM-DD` strings** (`lib/dates.ts`). "Today" is the browser's local date, supplied as `?today=` by `components/LocalToday.tsx`; pages wait for it rather than guess from the server clock.
- **The shared agenda** (`lib/agenda.ts` `getAgenda`) returns, for a date range, events, derived contact dates and (if asked) planned meals, in one order (`lib/agendaOrder.ts`). The calendar page and the home brief use it.
- **Derived contact dates** repeat every year, show "turns N" when a birth year is known, link to the contact, and can't be edited on the calendar. A Feb 29 birthday shows on Feb 28 in non-leap years.
- **Meals layer**: `showMeals` adds planned meals to the day and week views (not month). It is a household setting, toggled from the calendar header.
- **Assignee filter** (`?who=`): shows one person's items plus whole-household items. Derived contact dates and meals are unaffected by it.
- **Polling**: the calendar looks again every 30 seconds while the tab is visible, and on window focus (`router.refresh()`).
- Server actions return `{ok:false,error}` through `lib/actionResult.ts` because production hides thrown messages.

## Recurrence (migration 0024)

`CalendarItem.repeatUnit` (DAY \| WEEK \| MONTH \| YEAR, null = doesn't repeat), `repeatEvery` (1-99), `repeatUntil`. Logic is `lib/recurrence.ts` (pure, no database). Nothing is stored per occurrence: `getAgenda` expands a repeating event for the viewed range (`expandEvent`), each occurrence an entry with a unique `id` (`<item>@<date>`) and `itemId` (the stored row; actions use it). Editing or deleting changes the whole series; the edit form shows the series' start date. Occurrence n is computed from the start date, clamping to a month's last day (a year is twelve months, so Feb 29 falls on Feb 28 in other years). **Not built**: skipping or changing one occurrence, weekday patterns ("Mon and Wed").

## Screens

`/calendar?view=day|week|month&date=&who=&today=` with a quick-add line (a title, date, optional start time) and a full form (title, date, times, repeat, assignee, notes). Week is a seven-column grid on wide screens and a list of days on narrower ones; month is a grid (compact on phones) with "+N more" past three chips. The home page's weekly brief and Day by day read the same agenda.

## Key files

`lib/dates.ts`, `lib/contactDates.ts`, `lib/agendaOrder.ts`, `lib/agenda.ts`, `lib/recurrence.ts`, `lib/calendarItem.ts` (schema, settings), `lib/householdMembers.ts` (assignee options), `lib/calendarView.ts` (hrefs, titles, grouping), `lib/weekBrief.ts`; `app/(app)/calendar/{page,actions,CalendarClient,CalendarViews,QuickAdd,ItemDialogs}`; `lib/mealPlan.ts` (`entriesInRange`, `updatePlanSettings`).

## Decisions worth knowing

- Calendar is under **More** on a phone (the tab bar holds five: `TAB_BAR_COUNT`).
- The weekly brief on `/home` counts events and contact dates as well as meals.
- The old 30-day "Coming up" list on `/home` and `lib/home.ts` were removed in favour of the panel.
- Contacts' old `importantDate1/2` fields are untouched (not migrated); they appear on the calendar titled by their label.

## Out of scope (not built)

Integrations or ICS import/export; per-occurrence exceptions; multi-day events; notifications or email reminders; lead times; an "only me" view; sharing across households; per-contact toggles for derived dates; an activity log; migrating `importantDate`; meals on the month view.

## Deploying this

Migration 0023 is additive. Apply it to production (`npx prisma db execute --file prisma/migrations/0023_calendar_and_birthday/migration.sql --schema prisma/schema.prisma` with `.env.local` exported, which points at production), confirm `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` says "empty migration", merge to `main`, then probe the site. Old code keeps working against the new columns (all nullable or defaulted). Meal Planning's 0020-0022 are applied separately (see that doc).

## Still needs a manual check in a real browser

1. **A real phone**: the day/week/month views, quick add with the on-screen keyboard, and reaching Calendar under More.
2. **Evening "today"**: in your own time zone, confirm the highlighted day on the calendar and on Home uses your local date.
3. **Two devices**: add or check an item on one; the other catches up within about 30 seconds.
4. **Dark mode** on all three views, the strip and the home panel.
6. **Birthdays**: add a birthday with and without a year, round-trip a CSV (birthday column present, absent, and blank), and check a Feb 29 birthday.
7. **Real data**: a few weeks of items, assigned to different people, to see whether the filter and the home panel feel right.
