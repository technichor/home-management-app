"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import { parseListItemsCSV } from "@/lib/listCsv";
import type { ListSortMode } from "@prisma/client";
import { updateRatings, ComparisonOutcome, DEFAULT_RATING } from "@/lib/elo";

export async function createListAction(slug: string, name: string, tags: string[]) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.householdId) throw new Error("Not authenticated");
  const cleanName = name.trim();
  if (!cleanName) throw new Error("List name is required");

  const list = await prisma.list.create({
    data: { householdId: session.householdId, name: cleanName, tags },
  });

  revalidatePath(`/${slug}/lists`);
  return { id: list.id };
}

export async function renameListAction(id: string, name: string, slug: string) {
  await requireList(id);
  const cleanName = name.trim();
  if (!cleanName) throw new Error("List name is required");
  await prisma.list.update({ where: { id }, data: { name: cleanName } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
  revalidatePath(`/${slug}/lists/${id}`);
}

export async function archiveListAction(id: string, slug: string) {
  await requireList(id);
  await prisma.list.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
}

export async function unarchiveListAction(id: string, slug: string) {
  await requireList(id);
  await prisma.list.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
}

export async function deleteListAction(id: string, slug: string) {
  await requireList(id);
  await prisma.list.delete({ where: { id } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
}

// ---------- Items ----------

async function requireList(listId: string) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.householdId) throw new Error("Not authenticated");
  const list = await prisma.list.findUnique({ where: { id: listId } });
  if (!list || list.householdId !== session.householdId) throw new Error("List not found");
  return list;
}

async function requireItem(itemId: string) {
  const item = await prisma.listItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Item not found");
  await requireList(item.listId);
  return item;
}

export async function addItemsAction(listId: string, slug: string, texts: string[]) {
  await requireList(listId);
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return;
  const last = await prisma.listItem.aggregate({ where: { listId }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  await prisma.listItem.createMany({
    data: clean.map((text, i) => ({ listId, text, position: start + i })),
  });
  revalidatePath(`/${slug}/lists/${listId}`);
}

export async function toggleItemAction(itemId: string, slug: string, checked: boolean) {
  const item = await requireItem(itemId);
  await prisma.listItem.update({
    where: { id: itemId },
    data: { checked, checkedAt: checked ? new Date() : null },
  });
  revalidatePath(`/${slug}/lists/${item.listId}`);
}

export async function updateItemAction(
  itemId: string,
  slug: string,
  data: { text?: string; quantity?: string | null; notes?: string | null; assignedToContactId?: string | null }
) {
  const item = await requireItem(itemId);
  if (data.text !== undefined && !data.text.trim()) throw new Error("Item text is required");
  if (data.assignedToContactId) {
    const contact = await prisma.contact.findUnique({ where: { id: data.assignedToContactId } });
    if (!contact || contact.deletedAt) throw new Error("Contact not found");
  }
  await prisma.listItem.update({
    where: { id: itemId },
    data: {
      ...(data.text !== undefined && { text: data.text.trim() }),
      ...(data.quantity !== undefined && { quantity: data.quantity?.trim() || null }),
      ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
      ...(data.assignedToContactId !== undefined && { assignedToContactId: data.assignedToContactId }),
    },
  });
  revalidatePath(`/${slug}/lists/${item.listId}`);
}

export async function deleteItemAction(itemId: string, slug: string) {
  const item = await requireItem(itemId);
  await prisma.listItem.delete({ where: { id: itemId } });
  revalidatePath(`/${slug}/lists/${item.listId}`);
}

export async function reorderItemsAction(listId: string, slug: string, orderedIds: string[]) {
  const list = await requireList(listId);
  if (list.sortMode !== "MANUAL") {
    throw new Error("This list is ranked by pairwise comparison. Switch it to manual sorting to drag items.");
  }
  const existing = await prisma.listItem.findMany({ where: { listId }, select: { id: true } });
  const known = new Set(existing.map((e) => e.id));
  if (
    orderedIds.length !== known.size ||
    new Set(orderedIds).size !== known.size ||
    !orderedIds.every((id) => known.has(id))
  ) {
    throw new Error("Reorder list does not match the list's items");
  }
  await prisma.$transaction(
    orderedIds.map((id, position) => prisma.listItem.update({ where: { id }, data: { position } }))
  );
  revalidatePath(`/${slug}/lists/${listId}`);
}

export async function importItemsAction(listId: string, slug: string, csvText: string) {
  await requireList(listId);
  const { items, errors } = parseListItemsCSV(csvText);
  if (errors.length > 0) return { added: 0, errors };

  // Append-only: never touches or removes existing items.
  const last = await prisma.listItem.aggregate({ where: { listId }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  await prisma.listItem.createMany({
    data: items.map((item, i) => ({ listId, ...item, position: start + i })),
  });
  revalidatePath(`/${slug}/lists/${listId}`);
  revalidatePath(`/${slug}/lists`);
  return { added: items.length, errors: [] };
}

export async function recordComparisonAction(
  listId: string,
  slug: string,
  itemAId: string,
  itemBId: string,
  outcome: ComparisonOutcome
) {
  const list = await requireList(listId);
  if (list.sortMode !== "PAIRWISE") {
    throw new Error("This list is sorted manually. Switch it to pairwise ranking to compare items.");
  }
  if (itemAId === itemBId) throw new Error("Pick two different items");
  if (!["A", "B", "EQUAL"].includes(outcome)) throw new Error("Invalid comparison result");

  const result = await prisma.$transaction(async (tx) => {
    const [a, b] = await Promise.all([
      tx.listItem.findUnique({ where: { id: itemAId } }),
      tx.listItem.findUnique({ where: { id: itemBId } }),
    ]);
    if (!a || !b || a.listId !== listId || b.listId !== listId) throw new Error("Item not found in this list");

    const next = updateRatings(a.rating, b.rating, outcome);
    await tx.listItem.update({
      where: { id: a.id },
      data: { rating: next.a, comparisonCount: { increment: 1 } },
    });
    await tx.listItem.update({
      where: { id: b.id },
      data: { rating: next.b, comparisonCount: { increment: 1 } },
    });

    // Re-sort the whole list by rating (ties keep their current relative order) and write it to position.
    const all = await tx.listItem.findMany({ where: { listId }, orderBy: { position: "asc" } });
    const sorted = [...all].sort((x, y) => y.rating - x.rating);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].position !== i) {
        await tx.listItem.update({ where: { id: sorted[i].id }, data: { position: i } });
      }
    }
    return { a: next.a, b: next.b };
  });

  revalidatePath(`/${slug}/lists/${listId}`);
  return result;
}

export async function setSortModeAction(listId: string, slug: string, mode: ListSortMode) {
  const list = await requireList(listId);
  if (mode !== "MANUAL" && mode !== "PAIRWISE") throw new Error("Invalid sort mode");
  if (list.sortMode === mode) return;

  await prisma.$transaction(async (tx) => {
    await tx.list.update({ where: { id: listId }, data: { sortMode: mode } });
    // Manual -> pairwise: keep the current order (position) but start every item equal.
    if (mode === "PAIRWISE") {
      await tx.listItem.updateMany({
        where: { listId },
        data: { rating: DEFAULT_RATING, comparisonCount: 0 },
      });
    }
  });
  revalidatePath(`/${slug}/lists/${listId}`);
}
