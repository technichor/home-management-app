"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { isGroceryCategory } from "@/lib/groceryCategories";
import { getOrCreateShoppingList } from "@/lib/shopping";
import type { GroceryCategory } from "@prisma/client";

// Checking, editing (quantity and notes) and deleting shopping items use the Lists actions (toggleItemAction,
// updateItemAction, deleteItemAction), which already check the household. The actions here are the ones that need
// the shopping list's own rules. Each takes the household from the session; the list is always found through it.

const MAX_ITEM_TEXT = 200;

function refresh() {
  revalidatePath("/meals/shopping");
  revalidatePath("/meals");
}

/** Add one item to the shopping list, in a section (Other by default). Returns the new item's id. */
export async function addShoppingItemAction(text: string, category: GroceryCategory = "OTHER") {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const clean = text.trim();
    if (!clean) throw new UserError("Type an item first");
    if (clean.length > MAX_ITEM_TEXT) throw new UserError(`Items can be at most ${MAX_ITEM_TEXT} characters`);
    if (!isGroceryCategory(category)) throw new UserError("Invalid section");

    const list = await getOrCreateShoppingList(householdId);
    const last = await prisma.listItem.aggregate({ where: { listId: list.id }, _max: { position: true } });
    const item = await prisma.listItem.create({
      data: { listId: list.id, text: clean, category, position: (last._max.position ?? -1) + 1 },
    });
    refresh();
    return { id: item.id };
  });
}

/** Move an item to another section. Only items of the household's shopping list can be moved. */
export async function setItemCategoryAction(itemId: string, category: GroceryCategory) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    if (!isGroceryCategory(category)) throw new UserError("Invalid section");
    const item = await prisma.listItem.findFirst({
      where: { id: itemId, list: { householdId, kind: "GROCERY" } },
      select: { id: true },
    });
    if (!item) throw new UserError("That item isn't on your shopping list any more");
    await prisma.listItem.update({ where: { id: itemId }, data: { category } });
    refresh();
  });
}

/** Delete every checked item from the shopping list (hard delete). Returns how many went. */
export async function removeCheckedItemsAction() {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const list = await getOrCreateShoppingList(householdId);
    const removed = await prisma.listItem.deleteMany({ where: { listId: list.id, checked: true } });
    refresh();
    return { removed: removed.count };
  });
}
