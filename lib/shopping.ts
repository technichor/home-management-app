import { prisma } from "@/lib/db";
import { DEFAULT_GROCERY_CATEGORY } from "@/lib/groceryCategories";
import type { ShoppingItem } from "@/lib/shoppingGroups";

export const SHOPPING_LIST_NAME = "Shopping list";

/**
 * The household's shopping list: its GROCERY list, created the first time it's needed. "One per household" is
 * kept here in the app, not by a database constraint, so splitting by store later needs no migration. (If two
 * requests ever created one at the same moment, the oldest wins from then on.)
 */
export async function getOrCreateShoppingList(householdId: string) {
  const existing = await prisma.list.findFirst({ where: { householdId, kind: "GROCERY" }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  const created = await prisma.list.create({ data: { householdId, kind: "GROCERY", name: SHOPPING_LIST_NAME, tags: [] } });
  const oldest = await prisma.list.findFirst({ where: { householdId, kind: "GROCERY" }, orderBy: { createdAt: "asc" } });
  return oldest ?? created;
}

/** The shopping list and its items, in the order they were added. */
export async function loadShopping(householdId: string): Promise<{ listId: string; items: ShoppingItem[] }> {
  const list = await getOrCreateShoppingList(householdId);
  const rows = await prisma.listItem.findMany({ where: { listId: list.id }, orderBy: [{ createdAt: "asc" }, { position: "asc" }] });
  return {
    listId: list.id,
    items: rows.map((r) => ({
      id: r.id,
      text: r.text,
      quantity: r.quantity,
      notes: r.notes,
      checked: r.checked,
      // Every item of a grocery list has a section; an old or odd row without one lands in Other.
      category: r.category ?? DEFAULT_GROCERY_CATEGORY,
    })),
  };
}
