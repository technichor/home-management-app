import { z } from "zod";
import { prisma } from "@/lib/db";
import { daysBetween, dateToString, formatCalendarDate, formatDayHeading } from "@/lib/dates";
import { calendarName } from "@/lib/contactDates";
import { DEFAULT_RATING } from "@/lib/elo";
import { optionalDate, optionalId, optionalNotes } from "@/lib/formFields";

// The household's to-do list: one List of kind TODO (like the shopping list is its GROCERY list), with its own page
// at /todo. Its open items are in priority order (position). Drag-reordering and pairwise "Prioritize" both set that
// order, and each item's Elo rating is kept in step with it, so a Prioritize session starts from the dragged order.

export const TODO_LIST_NAME = "To-do list";
/** Done items are kept this long (for "what did we do?" and undo), then removed. */
export const DONE_KEEP_DAYS = 30;
export const MAX_TODO_TEXT = 300;
export const MAX_TODO_NOTES = 5000;
/** The rating step between neighbours in the order. */
export const RANK_GAP = 24;

export const todoFieldsSchema = z.object({
  text: z.string().trim().min(1, "Type what needs doing").max(MAX_TODO_TEXT, `A to-do can be at most ${MAX_TODO_TEXT} characters`),
  notes: optionalNotes(MAX_TODO_NOTES),
  assigneeContactId: optionalId(),
  dueDate: optionalDate("due date"),
});

export type TodoFields = z.input<typeof todoFieldsSchema>;

/**
 * The household's to-do list, created the first time it's needed. "One per household" is kept here in the app, not by a
 * database constraint (if two requests ever created one at the same moment, the oldest wins from then on).
 */
export async function getOrCreateTodoList(householdId: string) {
  const existing = await prisma.list.findFirst({ where: { householdId, kind: "TODO" }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  await prisma.list.create({ data: { householdId, kind: "TODO", name: TODO_LIST_NAME, tags: [] } });
  return (await prisma.list.findFirst({ where: { householdId, kind: "TODO" }, orderBy: { createdAt: "asc" } }))!;
}

export type TodoItem = {
  id: string;
  text: string;
  notes: string | null;
  assigneeContactId: string | null;
  /** The assignee's short name, kept even after they are removed from the household. */
  assigneeName: string | null;
  dueDate: string | null;
  done: boolean;
  rating: number;
  comparisonCount: number;
  /** The maintenance item a to-do was made for (lib/maintenanceTodos.ts), or null for an ordinary to-do. */
  maintenance: { id: string; name: string } | null;
};

const ASSIGNEE = {
  assignedToContact: { select: { firstName: true, nickname: true } },
  maintenanceItem: { select: { id: true, name: true } },
} as const;

type Row = {
  id: string;
  text: string;
  notes: string | null;
  assignedToContactId: string | null;
  assignedToContact: { firstName: string; nickname: string | null } | null;
  dueDate: Date | null;
  checked: boolean;
  rating: number;
  comparisonCount: number;
  maintenanceItem: { id: string; name: string } | null;
};

function toTodoItem(r: Row): TodoItem {
  return {
    id: r.id,
    text: r.text,
    notes: r.notes,
    assigneeContactId: r.assignedToContactId,
    assigneeName: r.assignedToContact ? calendarName(r.assignedToContact) : null,
    dueDate: r.dueDate ? dateToString(r.dueDate) : null,
    done: r.checked,
    rating: r.rating,
    comparisonCount: r.comparisonCount,
    maintenance: r.maintenanceItem,
  };
}

/**
 * The to-do list: open items in priority order, and done items, most recently done first. Done items older than
 * DONE_KEEP_DAYS are removed first (there is no scheduler, so the list tidies itself when it is read).
 */
export async function loadTodo(householdId: string, now: Date = new Date()): Promise<{ listId: string; open: TodoItem[]; done: TodoItem[] }> {
  const list = await getOrCreateTodoList(householdId);
  await prisma.listItem.deleteMany({
    where: { listId: list.id, checked: true, checkedAt: { lt: new Date(now.getTime() - DONE_KEEP_DAYS * 86_400_000) } },
  });
  const [open, done] = await Promise.all([
    prisma.listItem.findMany({ where: { listId: list.id, checked: false }, include: ASSIGNEE, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.listItem.findMany({ where: { listId: list.id, checked: true }, include: ASSIGNEE, orderBy: [{ checkedAt: "desc" }] }),
  ]);
  return { listId: list.id, open: open.map(toTodoItem), done: done.map(toTodoItem) };
}

/**
 * The home page's to-dos: the open ones that are the user's or anyone's (unassigned). Those due today or earlier come
 * first, then the rest, each part in priority order. A user who doesn't act as a contact sees just the unassigned ones.
 */
export async function homeTodos(householdId: string, contactId: string | null, today: string): Promise<TodoItem[]> {
  const rows = await prisma.listItem.findMany({
    where: {
      list: { householdId, kind: "TODO" },
      checked: false,
      OR: [{ assignedToContactId: null }, ...(contactId ? [{ assignedToContactId: contactId }] : [])],
    },
    include: ASSIGNEE,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const items = rows.map(toTodoItem);
  const due = (i: TodoItem) => i.dueDate !== null && i.dueDate <= today;
  return [...items.filter(due), ...items.filter((i) => !due(i))];
}

/** Whose to-dos to show: everyone's, the signed-in user's, or one member's (a contact id). */
export type TodoWho = "everyone" | "mine" | (string & {});
export type TodoFilter = { who: TodoWho; includeAnyone: boolean };
export const DEFAULT_TODO_FILTER: TodoFilter = { who: "everyone", includeAnyone: true };

/** Whether an item shows under a filter. Unassigned ("anyone") items follow includeAnyone, whoever is picked. */
export function todoVisible(item: { assigneeContactId: string | null }, filter: TodoFilter, myContactId: string | null): boolean {
  if (item.assigneeContactId === null) return filter.includeAnyone;
  if (filter.who === "everyone") return true;
  return item.assigneeContactId === (filter.who === "mine" ? myContactId : filter.who);
}

export type DueTone = "overdue" | "today" | "soon" | "later";

/** How a due date reads on a row, relative to the browser's today: "Overdue · Oct 3", "Today", "Tomorrow", "Fri", "Oct 20". */
export function dueLabel(due: string, today: string): { text: string; tone: DueTone } {
  const days = daysBetween(today, due);
  const short = due.slice(0, 4) === today.slice(0, 4) ? formatCalendarDate(due).replace(/, \d{4}$/, "") : formatCalendarDate(due);
  if (days < 0) return { text: `Overdue · ${short}`, tone: "overdue" };
  if (days === 0) return { text: "Today", tone: "today" };
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  if (days < 7) return { text: formatDayHeading(due).weekday, tone: "soon" };
  return { text: short, tone: "later" };
}

/** The ratings that match an order of `count` items (first is highest), RANK_GAP apart. */
export function ratingsInOrder(count: number): number[] {
  return Array.from({ length: count }, (_, i) => DEFAULT_RATING + RANK_GAP * (count - 1 - i));
}

/**
 * Where an item goes in the full order after a drag in a possibly filtered view: the dragged item takes the place of
 * the item it was dropped on, and everything else keeps its order (hidden items included).
 */
export function moveInOrder(order: string[], activeId: string, overId: string): string[] {
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}
