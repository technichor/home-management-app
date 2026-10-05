import type { GroceryCategory } from "@prisma/client";
import { GROCERY_CATEGORIES, GROCERY_CATEGORY_LABELS } from "@/lib/groceryCategories";

export type ShoppingItem = {
  id: string;
  text: string;
  quantity: string | null;
  notes: string | null;
  checked: boolean;
  category: GroceryCategory;
};

export type ShoppingGroup = { category: GroceryCategory; label: string; items: ShoppingItem[]; unchecked: number };

/**
 * The shopping list as sections in the fixed store order, with empty sections left out. Within a section the
 * unchecked items come first in the order they were added (the order given), then the checked ones.
 */
export function groupShopping(items: ShoppingItem[]): ShoppingGroup[] {
  return GROCERY_CATEGORIES.flatMap((category) => {
    const inSection = items.filter((i) => i.category === category);
    if (inSection.length === 0) return [];
    const unchecked = inSection.filter((i) => !i.checked);
    return [
      {
        category,
        label: GROCERY_CATEGORY_LABELS[category],
        items: [...unchecked, ...inSection.filter((i) => i.checked)],
        unchecked: unchecked.length,
      },
    ];
  });
}

export const uncheckedCount = (items: ShoppingItem[]) => items.filter((i) => !i.checked).length;
