import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { list: { findFirst: vi.fn(), create: vi.fn() }, listItem: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { getOrCreateShoppingList, loadShopping, SHOPPING_LIST_NAME } from "@/lib/shopping";
import { groupShopping, uncheckedCount, type ShoppingItem } from "@/lib/shoppingGroups";

const item = (id: string, category: ShoppingItem["category"], checked = false): ShoppingItem => ({
  id, text: id, quantity: null, notes: null, checked, category,
});

describe("groupShopping", () => {
  it("lists sections in the fixed store order, hiding empty ones", () => {
    const groups = groupShopping([item("a", "OTHER"), item("b", "DAIRY_EGGS"), item("c", "PRODUCE"), item("d", "FROZEN")]);
    expect(groups.map((g) => g.label)).toEqual(["Produce", "Dairy & Eggs", "Frozen", "Other"]);
  });

  it("puts unchecked items first in the order added, then checked ones in the order added", () => {
    const [group] = groupShopping([
      item("1", "PRODUCE", true),
      item("2", "PRODUCE"),
      item("3", "PRODUCE", true),
      item("4", "PRODUCE"),
    ]);
    expect(group.items.map((i) => i.id)).toEqual(["2", "4", "1", "3"]);
    expect(group.unchecked).toBe(2);
  });

  it("is empty for an empty list", () => {
    expect(groupShopping([])).toEqual([]);
  });

  it("counts what is still to buy", () => {
    expect(uncheckedCount([item("1", "PRODUCE", true), item("2", "BAKERY"), item("3", "OTHER")])).toBe(2);
    expect(uncheckedCount([])).toBe(0);
  });
});

beforeEach(() => vi.resetAllMocks());

describe("getOrCreateShoppingList", () => {
  it("uses the household's existing grocery list (the oldest)", async () => {
    vi.mocked(prisma.list.findFirst).mockResolvedValue({ id: "g1" } as any);
    expect(await getOrCreateShoppingList("h1")).toEqual({ id: "g1" });
    expect(prisma.list.findFirst).toHaveBeenCalledWith({ where: { householdId: "h1", kind: "GROCERY" }, orderBy: { createdAt: "asc" } });
    expect(prisma.list.create).not.toHaveBeenCalled();
  });

  it("creates it the first time, named 'Shopping list'", async () => {
    vi.mocked(prisma.list.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "new" } as any);
    vi.mocked(prisma.list.create).mockResolvedValue({ id: "new" } as any);
    expect(await getOrCreateShoppingList("h1")).toEqual({ id: "new" });
    expect(prisma.list.create).toHaveBeenCalledWith({ data: { householdId: "h1", kind: "GROCERY", name: SHOPPING_LIST_NAME, tags: [] } });
    expect(SHOPPING_LIST_NAME).toBe("Shopping list");
  });

  it("settles on the oldest if two were created at the same moment", async () => {
    vi.mocked(prisma.list.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "older" } as any);
    vi.mocked(prisma.list.create).mockResolvedValue({ id: "mine" } as any);
    expect(await getOrCreateShoppingList("h1")).toEqual({ id: "older" });
  });

  it("falls back to the one it made if it can't find any afterwards", async () => {
    vi.mocked(prisma.list.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.list.create).mockResolvedValue({ id: "mine" } as any);
    expect(await getOrCreateShoppingList("h1")).toEqual({ id: "mine" });
  });
});

describe("loadShopping", () => {
  it("returns the list's items in the order added, and puts a section-less item in Other", async () => {
    vi.mocked(prisma.list.findFirst).mockResolvedValue({ id: "g1" } as any);
    vi.mocked(prisma.listItem.findMany).mockResolvedValue([
      { id: "i1", text: "milk", quantity: "2", notes: "whole", checked: false, category: "DAIRY_EGGS" },
      { id: "i2", text: "odd", quantity: null, notes: null, checked: true, category: null },
    ] as any);
    expect(await loadShopping("h1")).toEqual({
      listId: "g1",
      items: [
        { id: "i1", text: "milk", quantity: "2", notes: "whole", checked: false, category: "DAIRY_EGGS" },
        { id: "i2", text: "odd", quantity: null, notes: null, checked: true, category: "OTHER" },
      ],
    });
    expect(vi.mocked(prisma.listItem.findMany).mock.calls[0][0]).toEqual({
      where: { listId: "g1" },
      orderBy: [{ createdAt: "asc" }, { position: "asc" }],
    });
  });
});
