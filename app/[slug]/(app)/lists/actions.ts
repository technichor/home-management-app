"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";

export async function createListAction(slug: string, name: string, tags: string[]) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.householdId) throw new Error("Not authenticated");

  const list = await prisma.list.create({
    data: { householdId: session.householdId, name, tags },
  });

  revalidatePath(`/${slug}/lists`);
  return { id: list.id };
}

export async function renameListAction(id: string, name: string, slug: string) {
  await prisma.list.update({ where: { id }, data: { name } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
  revalidatePath(`/${slug}/lists/${id}`);
}

export async function archiveListAction(id: string, slug: string) {
  await prisma.list.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
}

export async function unarchiveListAction(id: string, slug: string) {
  await prisma.list.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
}

export async function deleteListAction(id: string, slug: string) {
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
  await requireList(listId);
  const existing = await prisma.listItem.findMany({ where: { listId }, select: { id: true } });
  const known = new Set(existing.map((e) => e.id));
  if (orderedIds.length !== known.size || !orderedIds.every((id) => known.has(id))) {
    throw new Error("Reorder list does not match the list's items");
  }
  await prisma.$transaction(
    orderedIds.map((id, position) => prisma.listItem.update({ where: { id }, data: { position } }))
  );
  revalidatePath(`/${slug}/lists/${listId}`);
}
