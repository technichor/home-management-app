import type { GroceryCategory } from "@prisma/client";

/** The store sections of a grocery list, in the fixed order they are shown. */
export const GROCERY_CATEGORIES: readonly GroceryCategory[] = [
  "PRODUCE",
  "MEAT_SEAFOOD",
  "DAIRY_EGGS",
  "BAKERY",
  "PANTRY",
  "FROZEN",
  "BEVERAGES",
  "SNACKS",
  "HOUSEHOLD",
  "OTHER",
];

export const GROCERY_CATEGORY_LABELS: Record<GroceryCategory, string> = {
  PRODUCE: "Produce",
  MEAT_SEAFOOD: "Meat & Seafood",
  DAIRY_EGGS: "Dairy & Eggs",
  BAKERY: "Bakery",
  PANTRY: "Pantry & Dry Goods",
  FROZEN: "Frozen",
  BEVERAGES: "Beverages",
  SNACKS: "Snacks",
  HOUSEHOLD: "Household & Personal Care",
  OTHER: "Other",
};

export const DEFAULT_GROCERY_CATEGORY: GroceryCategory = "OTHER";

export function isGroceryCategory(value: unknown): value is GroceryCategory {
  return typeof value === "string" && (GROCERY_CATEGORIES as readonly string[]).includes(value);
}
