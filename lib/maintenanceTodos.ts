import { prisma } from "@/lib/db";
import { addDays, dateToString, stringToDate } from "@/lib/dates";
import { nextServiceDue } from "@/lib/maintenance";
import { getOrCreateTodoList, RANK_GAP } from "@/lib/todo";

// Maintenance services become to-dos when they come due. A to-do made this way points at its item
// (ListItem.maintenanceItemId) and the service date it stands for (serviceDueOn). Checking it off records the service
// on the item (app/(app)/todo/actions.ts); "Serviced today" on the item checks it off (app/(app)/maintenance/actions.ts).

/** A service shows on the to-do list this many days before it is due. */
export const MAINTENANCE_LEAD_DAYS = 7;

export const maintenanceTodoText = (name: string) => `Maintenance: ${name}`;

/**
 * Bring the household's to-do list in step with its maintenance schedule (there is no scheduler, so the pages that show
 * to-dos call this first). For every item with a schedule and a recorded service whose next service is due within
 * MAINTENANCE_LEAD_DAYS: make a to-do, unless one for that service date exists (open, or already checked off or
 * skipped). Open ones whose item changed follow its new due date, or go when the item no longer needs service soon (its
 * schedule was removed, it was serviced, or its date moved out). Items never serviced make no to-do: the Maintenance
 * page asks for their last service date instead. A new to-do goes for whoever had the item's last one, at the bottom.
 */
export async function syncMaintenanceTodos(householdId: string, today: string): Promise<void> {
  const horizon = addDays(today, MAINTENANCE_LEAD_DAYS);
  const [items, linked] = await Promise.all([
    prisma.maintenanceItem.findMany({
      where: { householdId, serviceEveryMonths: { not: null }, lastServicedOn: { not: null } },
      select: { id: true, name: true, serviceEveryMonths: true, lastServicedOn: true },
    }),
    prisma.listItem.findMany({
      where: { list: { householdId, kind: "TODO" }, maintenanceItemId: { not: null } },
      select: { id: true, maintenanceItemId: true, serviceDueOn: true, checked: true, assignedToContactId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const dueOf = new Map(items.map((i) => [i.id, nextServiceDue({ serviceEveryMonths: i.serviceEveryMonths, lastServicedOn: dateToString(i.lastServicedOn!) })!]));

  // Open ones follow their item. (deleteMany/updateMany: a page load running at the same moment may have done it.)
  for (const todo of linked.filter((l) => !l.checked)) {
    const due = dueOf.get(todo.maintenanceItemId!);
    if (due === undefined || due > horizon) await prisma.listItem.deleteMany({ where: { id: todo.id } });
    else if (dateToString(todo.serviceDueOn!) !== due) {
      await prisma.listItem.updateMany({ where: { id: todo.id }, data: { serviceDueOn: stringToDate(due), dueDate: stringToDate(due) } });
    }
  }

  const needed = items.filter((item) => {
    const due = dueOf.get(item.id)!;
    const mine = linked.filter((l) => l.maintenanceItemId === item.id);
    return due <= horizon && !mine.some((l) => !l.checked || dateToString(l.serviceDueOn!) === due);
  });
  if (needed.length === 0) return;

  const list = await getOrCreateTodoList(householdId);
  const [lastOpen, lastPosition] = await Promise.all([
    prisma.listItem.findFirst({ where: { listId: list.id, checked: false }, orderBy: { position: "desc" } }),
    prisma.listItem.aggregate({ where: { listId: list.id }, _max: { position: true } }),
  ]);
  const start = (lastPosition._max.position ?? -1) + 1;
  await prisma.listItem.createMany({
    // Two page loads at once may both get here; the unique (item, service date) keeps it to one.
    skipDuplicates: true,
    data: needed.map((item, i) => ({
      listId: list.id,
      text: maintenanceTodoText(item.name),
      maintenanceItemId: item.id,
      serviceDueOn: stringToDate(dueOf.get(item.id)!),
      dueDate: stringToDate(dueOf.get(item.id)!),
      assignedToContactId: linked.find((l) => l.maintenanceItemId === item.id)?.assignedToContactId ?? null,
      position: start + i,
      ...(lastOpen && { rating: lastOpen.rating - RANK_GAP * (i + 1) }),
    })),
  });
}
