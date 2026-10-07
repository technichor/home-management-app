"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { dateToString, isDateString, stringToDate } from "@/lib/dates";
import { updateRatings, type ComparisonOutcome } from "@/lib/elo";
import { assertMemberChoice } from "@/lib/householdMembers";
import { getOrCreateTodoList, RANK_GAP, ratingsInOrder, todoFieldsSchema, type TodoFields } from "@/lib/todo";

// Server actions are public endpoints: each one takes the household from the session and only ever touches that
// household's to-do list. An item id from the browser that isn't on it is "not found".

async function loadItem(householdId: string, id: string) {
  const item = await prisma.listItem.findFirst({ where: { id, list: { householdId, kind: "TODO" } } });
  if (!item) throw new UserError("That to-do isn't on the list any more");
  return item;
}

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }): T {
  if (!result.success) throw new UserError(result.error.issues[0].message);
  return result.data;
}

function refresh() {
  revalidatePath("/todo");
  revalidatePath("/home");
  revalidatePath("/maintenance", "layout");
}

/** Add a to-do at the bottom of the order (lowest priority until it is moved up). */
export async function addTodoAction(fields: TodoFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const data = parse(todoFieldsSchema.safeParse(fields));
    await assertMemberChoice(householdId, data.assigneeContactId);
    const list = await getOrCreateTodoList(householdId);
    const last = await prisma.listItem.findFirst({ where: { listId: list.id, checked: false }, orderBy: { position: "desc" } });
    const lastPosition = await prisma.listItem.aggregate({ where: { listId: list.id }, _max: { position: true } });
    const created = await prisma.listItem.create({
      data: {
        listId: list.id,
        text: data.text,
        notes: data.notes,
        assignedToContactId: data.assigneeContactId,
        dueDate: data.dueDate ? stringToDate(data.dueDate) : null,
        position: (lastPosition._max.position ?? -1) + 1,
        ...(last && { rating: last.rating - RANK_GAP }),
      },
    });
    refresh();
    return { id: created.id };
  });
}

/** Change any of a to-do's fields; the ones not given stay as they are. */
export async function updateTodoAction(id: string, fields: Partial<TodoFields>) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const item = await loadItem(householdId, id);
    const data = parse(todoFieldsSchema.partial().safeParse(fields));
    if (data.assigneeContactId !== undefined) await assertMemberChoice(householdId, data.assigneeContactId, item.assignedToContactId);
    await prisma.listItem.update({
      where: { id },
      data: {
        ...(data.text !== undefined && { text: data.text }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.assigneeContactId !== undefined && { assignedToContactId: data.assigneeContactId }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? stringToDate(data.dueDate) : null }),
      },
    });
    refresh();
  });
}

/**
 * Mark a to-do done or not done (`today` is the browser's date). Undone, it goes back to its old place in the order.
 * A maintenance to-do also records the service: done sets the item's last service to today (keeping the previous date
 * on the to-do), and undone puts that previous date back. One that was skipped records nothing either way.
 */
export async function setTodoDoneAction(id: string, done: boolean, today: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    if (!isDateString(today)) throw new UserError("Choose a valid date");
    const item = await loadItem(householdId, id);
    if (item.maintenanceItemId === null || done === item.checked) {
      await prisma.listItem.update({ where: { id }, data: { checked: done, checkedAt: done ? new Date() : null } });
    } else if (done) {
      const serviceItem = await prisma.maintenanceItem.findUniqueOrThrow({ where: { id: item.maintenanceItemId } });
      const previous = serviceItem.lastServicedOn;
      await prisma.$transaction([
        // A later date already recorded (serviced ahead, entered by hand) is kept.
        ...(previous === null || dateToString(previous) < today
          ? [prisma.maintenanceItem.update({ where: { id: serviceItem.id }, data: { lastServicedOn: stringToDate(today) } })]
          : []),
        prisma.listItem.update({ where: { id }, data: { checked: true, checkedAt: new Date(), previousServicedOn: previous } }),
      ]);
    } else {
      await prisma.$transaction([
        ...(item.previousServicedOn
          ? [prisma.maintenanceItem.update({ where: { id: item.maintenanceItemId }, data: { lastServicedOn: item.previousServicedOn } })]
          : []),
        prisma.listItem.update({ where: { id }, data: { checked: false, checkedAt: null, previousServicedOn: null } }),
      ]);
    }
    refresh();
  });
}

/**
 * Close a maintenance to-do without recording a service ("skip this time"). It stays with the done items, and the
 * reminder comes back once those are cleared (after 30 days) if the item still needs service.
 */
export async function skipMaintenanceTodoAction(id: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const item = await loadItem(householdId, id);
    if (item.maintenanceItemId === null) throw new UserError("Only a maintenance to-do can be skipped");
    await prisma.listItem.update({ where: { id }, data: { checked: true, checkedAt: new Date(), previousServicedOn: null } });
    refresh();
  });
}

/** Hard delete (no undo). */
export async function deleteTodoAction(id: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await loadItem(householdId, id);
    await prisma.listItem.delete({ where: { id } });
    refresh();
  });
}

/** Remove every done to-do now, instead of waiting for them to age out. */
export async function clearDoneTodosAction() {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const list = await getOrCreateTodoList(householdId);
    await prisma.listItem.deleteMany({ where: { listId: list.id, checked: true } });
    refresh();
  });
}

/** Save a new priority order: every open to-do's id, most important first. Ratings follow the order. */
export async function reorderTodosAction(orderedIds: string[]) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const list = await getOrCreateTodoList(householdId);
    const open = await prisma.listItem.findMany({ where: { listId: list.id, checked: false }, select: { id: true } });
    const known = new Set(open.map((o) => o.id));
    if (orderedIds.length !== known.size || new Set(orderedIds).size !== known.size || !orderedIds.every((id) => known.has(id))) {
      throw new UserError("The list changed while you were moving things. Try again.");
    }
    const ratings = ratingsInOrder(orderedIds.length);
    await prisma.$transaction(orderedIds.map((id, position) => prisma.listItem.update({ where: { id }, data: { position, rating: ratings[position] } })));
    refresh();
  });
}

/**
 * One answer in Prioritize ("which matters more?"): update the two ratings (Elo) and re-sort the open to-dos by rating.
 * Returns the two new ratings.
 */
export async function recordTodoComparisonAction(itemAId: string, itemBId: string, outcome: ComparisonOutcome) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    if (itemAId === itemBId) throw new UserError("Pick two different to-dos");
    if (!["A", "B", "EQUAL"].includes(outcome)) throw new UserError("Invalid answer");
    const [a, b] = await Promise.all([loadItem(householdId, itemAId), loadItem(householdId, itemBId)]);
    const next = updateRatings(a.rating, b.rating, outcome);
    await prisma.$transaction(async (tx) => {
      await tx.listItem.update({ where: { id: a.id }, data: { rating: next.a, comparisonCount: { increment: 1 } } });
      await tx.listItem.update({ where: { id: b.id }, data: { rating: next.b, comparisonCount: { increment: 1 } } });
      // Ties keep their current relative order.
      const open = await tx.listItem.findMany({ where: { listId: a.listId, checked: false }, orderBy: { position: "asc" } });
      const sorted = [...open].sort((x, y) => y.rating - x.rating);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].position !== i) await tx.listItem.update({ where: { id: sorted[i].id }, data: { position: i } });
      }
    });
    refresh();
    return { a: next.a, b: next.b };
  });
}
