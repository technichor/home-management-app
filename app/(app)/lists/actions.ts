"use server";

import { contactIsIn } from "@/lib/scope";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseListItemsCSV } from "@/lib/listCsv";
import type { ListSortMode } from "@prisma/client";
import { updateRatings, ComparisonOutcome, DEFAULT_RATING } from "@/lib/elo";
import { requireMember } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { DEFAULT_GROCERY_CATEGORY, isGroceryCategory } from "@/lib/groceryCategories";
import type { GroceryCategory } from "@prisma/client";
import { isHttpUrl } from "@/lib/formFields";
import { candidatesFor } from "@/lib/channels";
import { accessTo, isShareable, newPublicToken, type ListAccess } from "@/lib/listAccess";

/** The longest link an item can have. */
const MAX_ITEM_URL = 2000;

/** A new list, owned by its creator and shared with the household. A Gift ideas list starts out public too. */
export async function createListAction(name: string, tags: string[], kind: "STANDARD" | "GIFT" = "STANDARD") {
  const user = await requireMember();
  const cleanName = name.trim();
  if (!cleanName) throw new Error("List name is required");
  if (kind !== "STANDARD" && kind !== "GIFT") throw new Error("Invalid list type");

  const list = await prisma.list.create({
    data: { householdId: user.householdId, ownerUserId: user.id, name: cleanName, tags, kind, ...(kind === "GIFT" && { publicToken: newPublicToken() }) },
  });

  revalidatePath("/lists");
  return { id: list.id };
}

export async function renameListAction(id: string, name: string) {
  await requireStandardList(id, "manage");
  const cleanName = name.trim();
  if (!cleanName) throw new Error("List name is required");
  await prisma.list.update({ where: { id }, data: { name: cleanName } });
  revalidatePath("/lists");
  revalidatePath("/lists/archived");
  revalidatePath(`/lists/${id}`);
}

export async function archiveListAction(id: string) {
  await requireStandardList(id, "manage");
  await prisma.list.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/lists");
  revalidatePath("/lists/archived");
}

export async function unarchiveListAction(id: string) {
  await requireStandardList(id, "manage");
  await prisma.list.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath("/lists");
  revalidatePath("/lists/archived");
}

export async function deleteListAction(id: string) {
  await requireStandardList(id, "manage");
  await prisma.list.delete({ where: { id } });
  revalidatePath("/lists");
  revalidatePath("/lists/archived");
}

// ---------- Items ----------

const ACCESS_RANK: Record<ListAccess, number> = { view: 0, edit: 1, manage: 2 };

/**
 * A list these actions may touch, for something that needs `need` (lib/listAccess.ts): an ordinary or Gift list the
 * caller can see, or the household's shopping list. A list the caller can't see is "not found"; one they can see but
 * not change says so.
 */
async function requireList(listId: string, need: ListAccess = "edit", ordinaryOnly = false) {
  const user = await requireMember();
  const list = await prisma.list.findUnique({ where: { id: listId }, include: { shares: { select: { userId: true, canEdit: true } } } });
  const access = list ? accessTo(list, user) : null;
  if (!list || !access) throw new Error("List not found");
  // The to-do list has its own rules (members only, due dates, ratings kept in step) in app/(app)/todo/actions.ts.
  if (list.kind === "TODO") throw new Error("The to-do list can't be changed this way");
  if (ordinaryOnly && !isShareable(list.kind)) throw new Error("The shopping list can't be changed this way");
  if (ACCESS_RANK[access] < ACCESS_RANK[need]) {
    throw new Error(need === "manage" ? "Only the list's owner can do that" : "This list is shared with you to view, not to change");
  }
  return { ...list, access, user };
}

/**
 * An ordinary list (or a Gift ideas list). The shopping (GROCERY) list belongs to Meal Planning and can't be renamed,
 * archived, deleted, ranked, reordered, assigned, shared or imported through these actions.
 */
async function requireStandardList(listId: string, need: ListAccess = "edit") {
  return requireList(listId, need, true);
}

async function requireItem(itemId: string) {
  const item = await prisma.listItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Item not found");
  const list = await requireList(item.listId);
  return { ...item, listKind: list.kind, listHouseholdId: list.householdId };
}

/** An item's link: blank is none; otherwise http or https, and not too long. */
function cleanUrl(url: string | null | undefined): string | null {
  const clean = url?.trim() || null;
  if (clean === null) return null;
  if (clean.length > MAX_ITEM_URL) throw new Error(`A link can be at most ${MAX_ITEM_URL.toLocaleString("en-US")} characters`);
  if (!isHttpUrl(clean)) throw new Error("A link must start with http:// or https://");
  return clean;
}

/** Add items (one per text). `url` is a link for the item, when adding just one (a gift idea and its shop page). */
export async function addItemsAction(listId: string, texts: string[], category?: GroceryCategory, url?: string | null) {
  const list = await requireList(listId);
  // Items of a grocery list always have a section (Other by default); items of an ordinary list never do.
  if (list.kind === "GROCERY") {
    if (category !== undefined && !isGroceryCategory(category)) throw new Error("Invalid section");
  } else if (category !== undefined) {
    throw new Error("Only the shopping list has sections");
  }
  const itemCategory = list.kind === "GROCERY" ? (category ?? DEFAULT_GROCERY_CATEGORY) : null;
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return;
  const link = cleanUrl(url);
  if (link && clean.length > 1) throw new Error("A link can only go with one item");
  const last = await prisma.listItem.aggregate({ where: { listId }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  await prisma.listItem.createMany({
    data: clean.map((text, i) => ({ listId, text, position: start + i, ...(itemCategory && { category: itemCategory }), ...(link && { url: link }) })),
  });
  revalidatePath(`/lists/${listId}`);
}

export async function toggleItemAction(itemId: string, checked: boolean) {
  const item = await requireItem(itemId);
  await prisma.listItem.update({
    where: { id: itemId },
    data: { checked, checkedAt: checked ? new Date() : null },
  });
  revalidatePath(`/lists/${item.listId}`);
}

export async function updateItemAction(
  itemId: string,
  data: { text?: string; quantity?: string | null; notes?: string | null; url?: string | null; assignedToContactId?: string | null }
) {
  const item = await requireItem(itemId);
  if (data.text !== undefined && !data.text.trim()) throw new Error("Item text is required");
  if (data.assignedToContactId !== undefined && item.listKind === "GROCERY") {
    throw new Error("Items on the shopping list can't be assigned");
  }
  const url = data.url === undefined ? undefined : cleanUrl(data.url);
  if (data.assignedToContactId) {
    // Someone in the list's own household's directory (whoever is editing it).
    const contact = await prisma.contact.findUnique({ where: { id: data.assignedToContactId } });
    if (!contact || contact.deletedAt || !contactIsIn(contact, item.listHouseholdId)) {
      throw new Error("Contact not found");
    }
  }
  await prisma.listItem.update({
    where: { id: itemId },
    data: {
      ...(data.text !== undefined && { text: data.text.trim() }),
      ...(data.quantity !== undefined && { quantity: data.quantity?.trim() || null }),
      ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
      ...(url !== undefined && { url }),
      ...(data.assignedToContactId !== undefined && { assignedToContactId: data.assignedToContactId }),
    },
  });
  revalidatePath(`/lists/${item.listId}`);
}

export async function deleteItemAction(itemId: string) {
  const item = await requireItem(itemId);
  await prisma.listItem.delete({ where: { id: itemId } });
  revalidatePath(`/lists/${item.listId}`);
}

export async function reorderItemsAction(listId: string, orderedIds: string[]) {
  const list = await requireStandardList(listId);
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
  revalidatePath(`/lists/${listId}`);
}

export async function importItemsAction(listId: string, csvText: string) {
  await requireStandardList(listId);
  const { items, errors } = parseListItemsCSV(csvText);
  if (errors.length > 0) return { added: 0, errors };

  // Append-only: never touches or removes existing items.
  const last = await prisma.listItem.aggregate({ where: { listId }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  await prisma.listItem.createMany({
    data: items.map((item, i) => ({ listId, ...item, position: start + i })),
  });
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
  return { added: items.length, errors: [] };
}

/** One answer in Prioritize: returns the two new ratings, or `{ ok: false, error }` for an answer that can't be saved. */
export async function recordComparisonAction(
  listId: string,
  itemAId: string,
  itemBId: string,
  outcome: ComparisonOutcome
) {
  const list = await requireStandardList(listId);
  return attempt(async () => {
    if (list.sortMode !== "PAIRWISE") {
      throw new UserError("This list is sorted manually. Switch it to pairwise ranking to compare items.");
    }
    if (itemAId === itemBId) throw new UserError("Pick two different items");
    if (!["A", "B", "EQUAL"].includes(outcome)) throw new UserError("Invalid comparison result");

    const result = await prisma.$transaction(async (tx) => {
      const [a, b] = await Promise.all([
        tx.listItem.findUnique({ where: { id: itemAId } }),
        tx.listItem.findUnique({ where: { id: itemBId } }),
      ]);
      if (!a || !b || a.listId !== listId || b.listId !== listId) throw new UserError("Item not found in this list");

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

    revalidatePath(`/lists/${listId}`);
    return result;
  });
}

export async function setSortModeAction(listId: string, mode: ListSortMode) {
  const list = await requireStandardList(listId);
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
  revalidatePath(`/lists/${listId}`);
}

// ---------- Sharing (the list's owner; docs/domains/lists.md, Sharing) ----------

function refreshList(listId: string) {
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}

/** Everyone in the household can see and edit it (on), or only its owner and the people it is shared with (off). */
export async function setSharedWithHouseholdAction(listId: string, shared: boolean) {
  return attempt(async () => {
    if (typeof shared !== "boolean") throw new UserError("Invalid setting");
    await requireStandardList(listId, "manage");
    await prisma.list.update({ where: { id: listId }, data: { sharedWithHousehold: shared } });
    refreshList(listId);
  });
}

/**
 * Share the list with people (to view, or with `canEdit` to change its items): accounts in the list's household or a
 * household synced with it, the same people a channel can hold. Someone already on it keeps their row (use
 * setShareEditAction to change it).
 */
export async function shareListAction(listId: string, userIds: string[], canEdit: boolean) {
  return attempt(async () => {
    const list = await requireStandardList(listId, "manage");
    if (!Array.isArray(userIds) || userIds.length === 0 || typeof canEdit !== "boolean") throw new UserError("Choose who to share it with");
    const allowed = new Set((await candidatesFor({ id: list.user.id, householdId: list.householdId })).map((c) => c.id));
    allowed.delete(list.ownerUserId ?? "");
    if (!userIds.every((id) => allowed.has(id))) throw new UserError("Choose people from your household or a household you're synced with");
    await prisma.listShare.createMany({ data: [...new Set(userIds)].map((userId) => ({ listId, userId, canEdit })), skipDuplicates: true });
    refreshList(listId);
  });
}

/** Whether someone the list is shared with can change its items. */
export async function setShareEditAction(listId: string, userId: string, canEdit: boolean) {
  return attempt(async () => {
    await requireStandardList(listId, "manage");
    if (typeof canEdit !== "boolean") throw new UserError("Invalid setting");
    const changed = await prisma.listShare.updateMany({ where: { listId, userId }, data: { canEdit } });
    if (changed.count === 0) throw new UserError("That person no longer has this list");
    refreshList(listId);
  });
}

/** Stop sharing the list with someone. */
export async function unshareListAction(listId: string, userId: string) {
  return attempt(async () => {
    await requireStandardList(listId, "manage");
    await prisma.listShare.deleteMany({ where: { listId, userId } });
    refreshList(listId);
  });
}

/** Take a list someone shared with you off your lists (you lose access to it). */
export async function leaveSharedListAction(listId: string) {
  const user = await requireMember();
  return attempt(async () => {
    const left = await prisma.listShare.deleteMany({ where: { listId, userId: user.id } });
    if (left.count === 0) throw new UserError("That list isn't shared with you");
    revalidatePath("/lists");
  });
}

/** Turn the public link on (a new link, if there was none) or off (the link stops working). */
export async function setPublicAction(listId: string, isPublic: boolean) {
  return attempt(async () => {
    if (typeof isPublic !== "boolean") throw new UserError("Invalid setting");
    const list = await requireStandardList(listId, "manage");
    if (isPublic === (list.publicToken !== null)) return;
    await prisma.list.update({ where: { id: listId }, data: { publicToken: isPublic ? newPublicToken() : null } });
    refreshList(listId);
  });
}

/** A new public link; the old one stops working at once. */
export async function newPublicLinkAction(listId: string) {
  return attempt(async () => {
    const list = await requireStandardList(listId, "manage");
    if (list.publicToken === null) throw new UserError("Turn on the public link first");
    await prisma.list.update({ where: { id: listId }, data: { publicToken: newPublicToken() } });
    refreshList(listId);
  });
}
