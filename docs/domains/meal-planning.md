# Domain: Meal Planning

Status: **Built and deployed to production.** Migrations 0020, 0021 and 0022 are additive and applied to the production database.

## What this domain is

Families plan meals for the coming week on a calendar, build one shopping list as they plan, and keep a library of meals they've eaten before for brainstorming. It is standalone from the future Scheduling module, but dates are stored as plain calendar dates (a Postgres `DATE`) so meals can appear on a calendar later.

Three concepts:

- **Meal**: a library entry with a name and a long free-text description (a place to paste a recipe).
- **Planned entry**: puts a Meal, or a one-off text such as "leftovers", on a date and a slot (breakfast, lunch, dinner). A slot can hold several entries.
- **Shopping list**: the Lists module extended with a `GROCERY` kind that groups items by store section. One per household.

Access is the same as every other domain: any signed-in household account can read and write everything of its own household. Every query and action takes the household from the session, and any id sent from the browser (meal, entry, list item) is checked to belong to that household. Everything is a hard delete; there is no soft delete, activity log or history.

## Schema (migrations 0020, 0021, 0022)

| Model / field | Notes |
|---|---|
| `List.kind` (`ListKind` STANDARD \| GROCERY, default STANDARD) | 0020. One GROCERY list per household, enforced in the app only (`lib/shopping.ts`), not by a constraint, so splitting by store later needs no migration. |
| `ListItem.category` (`GroceryCategory`, nullable) | 0020. Null in STANDARD lists. PRODUCE, MEAT_SEAFOOD, DAIRY_EGGS, BAKERY, PANTRY, FROZEN, BEVERAGES, SNACKS, HOUSEHOLD, OTHER. Labels and the fixed display order are in `lib/groceryCategories.ts`. |
| `Meal` | 0021. `householdId`, `name`, `nameKey` (lowercased, trimmed name), `description`, timestamps. `@@unique([householdId, nameKey])`: names are unique per household, ignoring case. |
| `MealPlanEntry` | 0021. `householdId`, `date` (`@db.Date`), `slot` (`MealSlot`), `mealId` (nullable, `onDelete: SetNull`), `text`. Exactly one of `mealId` / `text` is set (Zod `planEntrySchema` and the action layer). `@@index([householdId, date])`. |
| `MealPlanSettings` | 0022. One row per household, keyed by `householdId`: `weekStartsOn` (SUNDAY default), `showBreakfast` (false), `showLunch` (true), `showDinner` (true). Created with these defaults on first read (`getMealPlanSettings`). At least one `show*` must stay true. |

## Rules

**Lists guards (stage 1).** The shopping list can't be renamed, archived, unarchived, deleted, reordered, ranked (comparison or sort mode), imported into, or have items assigned, through the Lists actions (`requireStandardList` in `app/(app)/lists/actions.ts`). It is left out of the Lists index, the archived view and the home page card, and its `/lists/[id]` and `/lists/[id]/compare` pages return 404. Adding, checking, editing (quantity and notes) and deleting items still use the shared Lists actions. `addItemsAction` files grocery items in Other unless given a section, and refuses a section on a standard list.

**Library (stage 2).** Last made = latest entry date on or before the browser's today for that meal; times made = the count of those entries. Both are derived in a query (`mealStats`), never stored. Deleting a meal asks first and says how many planned entries use it; in one transaction it first copies the meal's name into `text` on every entry that references it, then deletes the meal (`deleteMealKeepingEntries`), so plan history survives as one-offs.

**Planner (stage 3).** The week shown comes from the URL (`?week=YYYY-MM-DD`, snapped to the household's week start) and defaults to the week containing the browser's today. **"Today" is always the browser's local date**, passed as `?today=YYYY-MM-DD` by `components/LocalToday.tsx`; the planner renders nothing until it has it, so it never flashes the server's (UTC) week. Navigation is unbounded. Entries sit in cells in creation order, and a cell can hold several. Typed library names are matched case-insensitively: a typed name that exists selects that meal rather than creating a duplicate (`createMealAndAddAction` is find-or-create in a transaction, and retries once on a unique-name race). Entries in a hidden slot are counted in a small "N hidden entries" note. Layout is a CSS grid with one column per day above 1100px and a vertical list of days below it (today scrolled into view on the current week).

**Shopping list (stage 4).** Items are grouped by section in the fixed order with empty sections hidden; unchecked items first in the order added, then checked ones, crossed out. Quick add keeps focus in the box, with a section picker (default Other, then remembered for the next item) and a light "already on the list" warning for a duplicate unchecked item. Check/uncheck, move section, edit quantity/notes and delete are optimistic: a change that fails is put back and the row shows "Couldn't save. Retry". "Remove checked items (N)" states the count and asks first. The list re-checks every 12 seconds while the tab is visible and on window focus (`SHOPPING_POLL_MS`), and takes the server's copy only when none of the user's own changes are still being saved. It appears as a slide-over in the planner (with an unchecked-count badge) and as a full page, `/meals/shopping`, with large tap targets and collapsible sections.

**Suggestions (stage 5, `lib/suggestions.ts`).** Rules only, no AI. "Due for a repeat" ranks never-made meals first, then the oldest last-made. "Family staples" ranks by times made (never-made meals aren't staples). Both exclude meals already planned in the viewed week and meals made within the last 14 days (`RECENT_DAYS`; a meal made exactly 14 days ago is still excluded). Four are shown per list; Shuffle draws four at random from the best twelve. They appear in an "Ideas" panel on the planner (choose the day and meal, then tap Add) and in each cell's add box when nothing has been typed.

## Routes

```
/meals                       planner (week grid; Ideas panel; Shopping list slide-over; settings)
/meals/library               meal library: search, sort by name / last made / most made
/meals/library/new           add a meal
/meals/library/[id]          meal detail (description as plain text, stats, edit, delete)
/meals/library/[id]/edit     edit a meal
/meals/shopping              the shopping list, full page
```

Server actions: `app/(app)/meals/actions.ts` (meals, plan entries, planner settings) and `app/(app)/meals/shopping/actions.ts` (add item, change section, remove checked). They return `{ ok: false, error }` for expected failures, because production builds hide the message of a thrown server-action error; the Lists actions the shopping list reuses (`toggleItemAction`, `updateItemAction`, `deleteItemAction`) still throw, so the shopping list treats any throw as "couldn't save".

## Key files

`lib/dates.ts` (calendar-date helpers, week math), `lib/meals.ts` + `lib/mealKey.ts`, `lib/mealPlan.ts`, `lib/groceryCategories.ts`, `lib/shopping.ts`, `lib/shoppingGroups.ts`, `lib/suggestions.ts`, `lib/actionResult.ts` (`attempt` / `UserError`), `components/LocalToday.tsx`, `components/MealsNav.tsx`, and the pages and clients under `app/(app)/meals/`. The module is added to the nav in `components/navModules.tsx`.

## Decisions made while building

- The planner needs the browser's date, so it waits for `?today=` (one quick extra render on first load) instead of guessing from the server clock.
- The shopping list has its own row component rather than reusing `ListDetailClient`, which is built around drag-reorder, assignees and ranking; the server actions are shared.
- The "Meals" module is a fifth phone tab-bar item (`TAB_BAR_COUNT` is 5).
- Entry detail loads each meal's description with the page (at most about 21 entries' worth), rather than fetching on open.
- The shopping section picker keeps its last choice, which suits adding a whole aisle at once.

## Out of scope (not built)

Ingredients on meals or "add ingredients to the list"; structured recipes, ratings, tags, dietary flags; auto-categorizing shopping items or remembering sections; editable sections, per-store order, multiple or split shopping lists; assigning a cook; snacks or dessert slots; integration with the Scheduling calendar; CSV import/export for meals, plans or the shopping list; reordering entries within a slot; offline mode; activity log, soft delete or version history. Nice-to-haves skipped: drag entries between cells, "Save to library" on a one-off.

## Deploying this

The three migrations are additive (nothing is dropped), so the order is simple: apply 0020-0022 to the production database (`npx prisma db execute --file prisma/migrations/<name>/migration.sql --schema prisma/schema.prisma` with `.env.local` exported, which points at production), confirm `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` says "empty migration", merge to `main` (Vercel deploys), then probe the site. Old code keeps working against the new columns because they all have defaults.

## Still needs a manual check in a real browser

Automated tests cover the logic, the layouts at 375px and 1280px, the browser-local date in two far-off time zones, and two people editing the shopping list at once. Not yet done by a person on real devices:

1. **A real phone**: the planner list of days (today scrolled to the top), adding a meal with the on-screen keyboard, and the shopping page in a store (tap targets, check-off with one hand, the section picker, the keyboard Enter key adding items and keeping focus).
2. **Evening "today"**: open the planner in the evening in your own time zone and confirm the highlighted day is your local date.
3. **Slow or flaky connection** on the shopping list: check an item with the network throttled or offline, and confirm it reverts with a visible "Couldn't save. Retry" and that Retry works.
4. **Two devices** on one household at the same time (the shopping list should catch up within about 15 seconds).
5. **Dark mode** on the planner grid, the Ideas panel and the shopping list.
6. **A long pasted recipe** (thousands of characters, with line breaks and indentation) in a meal's description: how it reads on the detail page and in the planner's entry dialog.
7. **Real data**: add a few weeks of history, then check the library's last made / times made and that the suggestions feel sensible.
