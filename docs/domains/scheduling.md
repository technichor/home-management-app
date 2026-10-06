# Domain: Scheduling & Reminders

Status: **Built and deployed to production (merged to `main` 2026-10-05).** Migration 0023 is additive and applied to the production database. **Recurrence** (migration 0024, additive) is merged to `main` (2026-10-05) and applied to production.

## What this domain is

A household calendar. Two kinds of item, both `CalendarItem`: an **event** (a date, optionally a start and end time; an event with no time is a reminder) and a **task** (a date, completed or not). Items can be assigned to one Contact (a household member) or to the whole household. The calendar also shows, read-only, dates derived from Contacts (birthdays and the two important dates) and, optionally, planned meals.

Access is the same as every other domain: any signed-in household account reads and writes everything of its own household; the household comes from the session, and any id sent from the browser (item, assignee) is checked to belong to it. Deleting an item is a hard delete; there is no activity log.

## Schema (migration 0023)

| Model / field | Notes |
|---|---|
| `CalendarItem` | `householdId`, `kind` (`CalendarKind` EVENT \| TASK), `title` (max 200), `notes` (max 5000, plain text), `date` (`@db.Date`), `startTime`/`endTime` (`HH:MM` strings, events only, end needs a start), `assigneeContactId` (nullable, `onDelete: SetNull`), `completedAt` (tasks only). `@@index([householdId, date])`. |
| `CalendarSettings` | One row per household, created on first read: `showMeals` (default false). |
| `Contact.birthdayMonth/Day/Year` | See `docs/domains/contacts.md`. |

The first day of the week is **not** stored here: it is `MealPlanSettings.weekStartsOn`, shared with the meal planner (changing it in either place changes both). Folding it into a household-level setting is a possible later cleanup.

## Rules

- **Dates are plain `YYYY-MM-DD` strings** (`lib/dates.ts`). "Today" is the browser's local date, supplied as `?today=` by `components/LocalToday.tsx`; pages wait for it rather than guess from the server clock.
- **The shared agenda** (`lib/agenda.ts` `getAgenda`) returns, for a date range, calendar items, derived contact dates and (if asked) planned meals, in one order (`lib/agendaOrder.ts`), plus the overdue tasks. The calendar page, the home brief and the home "Today & coming up" panel all use it.
- **Overdue** = an open task dated before today. Overdue tasks sit in a strip above the views (check off, or "move to today"), not in the grid, and never in the meal layer.
- **Derived contact dates** repeat every year, show "turns N" when a birth year is known, link to the contact, and can't be edited on the calendar. A Feb 29 birthday shows on Feb 28 in non-leap years.
- **Meals layer**: `showMeals` adds planned meals to the day and week views (not month). It is a household setting, toggled from the calendar header.
- **Assignee filter** (`?who=`): shows one person's items plus whole-household items. Derived contact dates and meals are unaffected by it.
- **Polling**: the calendar looks again every 30 seconds while the tab is visible, and on window focus (`router.refresh()`).
- **Optimistic UI**: checking a task and "move to today" show at once and revert with a retry if saving fails. Server actions return `{ok:false,error}` through `lib/actionResult.ts` because production hides thrown messages.

## Recurrence (migration 0024)

`CalendarItem.repeatUnit` (DAY \| WEEK \| MONTH \| YEAR, null = doesn't repeat), `repeatEvery` (1-99), `repeatUntil`, `repeatAnchor`. Logic is `lib/recurrence.ts` (pure, no database). Nothing is stored per occurrence.

- **Events** are one row; `getAgenda` expands them for the viewed range (`lib/agenda.ts`, `expandEvent`), each occurrence an entry with a unique `id` (`<item>@<date>`) and `itemId` (the stored row; actions use it). Editing or deleting changes the whole series; the edit form shows the series' start date, not the occurrence opened.
- **Tasks** stay one row at their next due date. Checking one off moves `date` to the next occurrence after max(its date, today), so missed ones are skipped, not piled up; when the series has run out it is completed for good. `repeatAnchor` is the day the series started on, so a monthly task on the 31st is the 28th in February and the 31st again after. Editing a task's date resets the anchor.
- **Month/year**: occurrence n is computed from the anchor, clamping to the month's last day. A year is twelve months (Feb 29 -> Feb 28 in other years).
- **Not built**: skipping or changing a single occurrence, weekday patterns ("Mon and Wed"), "N days after completion" schedules, a completion history.

## Screens

`/calendar?view=day|week|month&date=&who=&today=` with a quick-add line (a title, optional date) and a full form (kind, title, date, times, assignee, notes). Week is a seven-column grid on wide screens and a list of days on narrower ones; month is a grid (compact on phones) with "+N more" past three chips. The home page's **Today & coming up** panel (overdue first, then today in full, then the next 7 days' events and contact dates) and the weekly brief read the same agenda.

## Key files

`lib/dates.ts`, `lib/contactDates.ts`, `lib/agendaOrder.ts`, `lib/agenda.ts`, `lib/calendarItem.ts` (schema, settings, assignee options), `lib/calendarView.ts` (hrefs, titles, grouping), `lib/homePanel.ts`, `lib/weekBrief.ts`; `app/(app)/calendar/{page,actions,CalendarClient,CalendarViews,QuickAdd,OverdueStrip,ItemDialogs}`; `lib/mealPlan.ts` (`entriesInRange`, `updatePlanSettings`).

## Decisions worth knowing

- Calendar is the sixth module, so on a phone it is under **More** (the tab bar holds five: `TAB_BAR_COUNT`).
- The weekly brief on `/home` now counts calendar items and contact dates as well as meals; finished tasks don't weigh on a day.
- The old 30-day "Coming up" list on `/home` and `lib/home.ts` were removed in favour of the panel.
- Contacts' old `importantDate1/2` fields are untouched (not migrated); they appear on the calendar titled by their label.

## Out of scope (not built)

Integrations or ICS import/export; per-occurrence exceptions; multi-day events; notifications or email reminders; lead times; an "only me" view; sharing across households; per-contact toggles for derived dates; an activity log; migrating `importantDate`; meals on the month view.

## Deploying this

Migration 0023 is additive. Apply it to production (`npx prisma db execute --file prisma/migrations/0023_calendar_and_birthday/migration.sql --schema prisma/schema.prisma` with `.env.local` exported, which points at production), confirm `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` says "empty migration", merge to `main`, then probe the site. Old code keeps working against the new columns (all nullable or defaulted). Meal Planning's 0020-0022 are applied separately (see that doc).

## Still needs a manual check in a real browser

1. **A real phone**: the day/week/month views, quick add with the on-screen keyboard, the overdue strip's check and "move to today", and reaching Calendar under More.
2. **Evening "today"**: in your own time zone, confirm the highlighted day, the overdue strip and "Today" on the home panel use your local date.
3. **Two devices**: add or check an item on one; the other catches up within about 30 seconds.
4. **Dark mode** on all three views, the strip and the home panel.
5. **Slow connection**: check a task with the network throttled; it should revert with Retry on failure.
6. **Birthdays**: add a birthday with and without a year, round-trip a CSV (birthday column present, absent, and blank), and check a Feb 29 birthday.
7. **Real data**: a few weeks of items, assigned to different people, to see whether the filter and the home panel feel right.
