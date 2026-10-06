# Domain: To-do

Status: **Built 2026-10-06.** Migrations 0027 (expand, additive) and 0028 (contract: moves calendar tasks here, then drops the task columns). Requirements are still loose; this is a deliberately small first version.

## What this domain is

The household's one shared to-do list, its own module at `/todo` (in the phone tab bar, where Contacts used to be). It replaced the calendar's tasks: the Calendar is now events and reminders only.

It is built on the Lists framework: one `List` of kind `TODO` per household (like the shopping list is its `GROCERY` list), created the first time it is needed (`lib/todo.ts` `getOrCreateTodoList`). It is hidden from Lists, and the Lists actions refuse to touch it (`requireList` in `app/(app)/lists/actions.ts`); it is changed only through `app/(app)/todo/actions.ts`, which enforce its rules.

## Design goal: four things in one step each

The owner's priority is speed for the common actions; everything else may cost a click.

| Action | How |
|---|---|
| Add | The box at the top (focused on arrival): type, Enter. The person picker beside it remembers the last choice (per device). A due date is one click (the calendar button). New items go to the bottom of the priority order. |
| Reorder | Drag the handle. The order is the priority. |
| Assign | The name on each row is a picker: a member or **Anyone** (unassigned). |
| Done | The checkbox. Done items collapse into "Done (n)" below and are removed after 30 days (or "Clear done"). Unchecking puts an item back in its old place. |

One click in (the item's text opens it): notes, due date, who, delete. **Prioritize** (pairwise "which matters more?", the Lists Elo ranking) is a separate page at `/todo/prioritize`.

## Rules

- **Who**: one household member (a Family & Friend contact of the household, `lib/householdMembers.ts`) or Anyone. A member who is later removed stays on items that already have them, marked "(removed)".
- **Filter**: Everyone's / Mine / a member's, plus "Include Anyone", remembered per device (browser storage; the page works without it). "Mine" is the contact the signed-in user acts as (`User.contactId`); a user who isn't one gets no "Mine". Dragging in a filtered view keeps hidden items where they were (`moveInOrder`).
- **Due dates** are optional plain dates and never reorder the list. Rows read "Overdue · Oct 3", "Today", "Tomorrow", a weekday within the week, else the date, relative to the browser's "today" (`LocalToday`).
- **Priority**: `ListItem.position` is the order; each open item's Elo `rating` is kept in step (a drag re-rates the whole list in order, `RANK_GAP` apart; a new item is rated just below the last), so a Prioritize session starts from the dragged order and each answer re-sorts the list.
- **Done items** are deleted 30 days after being checked, when the list is next read (there is no scheduler).
- **Home**: "Today & coming up" starts with **Your to-dos due**: open items due today or earlier that are yours or Anyone's (`dueTodos`), up to five, linking to `/todo`. To-dos never appear on the Calendar.
- Changes show at once (optimistic) and are put back with a message if saving fails; the page looks again every 30 seconds while visible, and on focus.

## Not built (on purpose, to stay simple)

Repeating to-dos (the calendar's recurrence could be reused), several lists or projects, subtasks, tags, comments, reminders/notifications, a time on the due date, history beyond 30 days.

## Key files

`lib/todo.ts`, `app/(app)/todo/{page,actions,TodoClient,TodoDetailDialog,assignees}`, `app/(app)/todo/prioritize/page.tsx`; the Prioritize screen is shared with Lists (`app/(app)/lists/[id]/compare/CompareClient.tsx`, which takes the comparison action as a prop). Tests: `tests/lib/todo.test.ts`, `tests/actions/todo.test.ts`, `tests/pages/todoPages.test.tsx`, `tests/components/todoUi.test.tsx`, `e2e/todo.e2e.ts`.

## Deploying this (expand / contract)

1. Apply `0027_todo_list_expand` (adds the `TODO` list kind and `ListItem.dueDate`, and gives `CalendarItem.kind` a default so the new code can insert events). Safe with the old code running.
2. Deploy the code.
3. Apply `0028_todo_list_contract`: it moves every calendar task to its household's to-do list (title, notes, assignee, date as due date, completion), deletes those calendar rows, and drops `CalendarItem.kind`, `completedAt`, `repeatAnchor` and the `CalendarKind` type. Then `prisma migrate diff` must say "empty migration".
