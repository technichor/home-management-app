import { describe, it, expect } from "vitest";
import { GroceryCategory } from "@prisma/client";
import {
  DEFAULT_GROCERY_CATEGORY,
  GROCERY_CATEGORIES,
  GROCERY_CATEGORY_LABELS,
  isGroceryCategory,
} from "@/lib/groceryCategories";

describe("grocery categories", () => {
  it("lists every category in the schema exactly once, in the agreed display order", () => {
    expect([...GROCERY_CATEGORIES].sort()).toEqual(Object.values(GroceryCategory).sort());
    expect(GROCERY_CATEGORIES.map((c) => GROCERY_CATEGORY_LABELS[c])).toEqual([
      "Produce",
      "Meat & Seafood",
      "Dairy & Eggs",
      "Bakery",
      "Pantry & Dry Goods",
      "Frozen",
      "Beverages",
      "Snacks",
      "Household & Personal Care",
      "Other",
    ]);
  });

  it("defaults to Other and ends with it", () => {
    expect(DEFAULT_GROCERY_CATEGORY).toBe("OTHER");
    expect(GROCERY_CATEGORIES[GROCERY_CATEGORIES.length - 1]).toBe("OTHER");
  });

  it("recognises only real categories", () => {
    expect(isGroceryCategory("DAIRY_EGGS")).toBe(true);
    expect(isGroceryCategory("dairy")).toBe(false);
    expect(isGroceryCategory(null)).toBe(false);
    expect(isGroceryCategory(3)).toBe(false);
  });
});
