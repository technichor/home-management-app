import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: {
    list: { findFirst: vi.fn(), create: vi.fn() },
    listItem: { aggregate: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { addShoppingItemAction, removeCheckedItemsAction, setItemCategoryAction } from "@/app/(app)/meals/shopping/actions";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.list.findFirst).mockResolvedValue({ id: "g1" } as any);
  vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: 4 } } as any);
  vi.mocked(prisma.listItem.create).mockResolvedValue({ id: "i1" } as any);
  vi.mocked(prisma.listItem.findFirst).mockResolvedValue({ id: "i1" } as any);
  vi.mocked(prisma.listItem.update).mockResolvedValue({} as any);
  vi.mocked(prisma.listItem.deleteMany).mockResolvedValue({ count: 2 } as any);
});

describe("authentication", () => {
  it.each([
    ["addShoppingItemAction", () => addShoppingItemAction("milk", "DAIRY_EGGS")],
    ["setItemCategoryAction", () => setItemCategoryAction("i1", "PRODUCE")],
    ["removeCheckedItemsAction", () => removeCheckedItemsAction()],
  ])("%s refuses a caller with no session, touching nothing", async (_n, call) => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.list.findFirst).not.toHaveBeenCalled();
    expect(prisma.listItem.create).not.toHaveBeenCalled();
    expect(prisma.listItem.update).not.toHaveBeenCalled();
    expect(prisma.listItem.deleteMany).not.toHaveBeenCalled();
  });
});

describe("addShoppingItemAction", () => {
  it("adds a trimmed item to the household's own shopping list, last in order, in the chosen section", async () => {
    expect(await addShoppingItemAction("  milk ", "DAIRY_EGGS")).toEqual({ ok: true, id: "i1" });
    expect(prisma.list.findFirst).toHaveBeenCalledWith({ where: { householdId: "h1", kind: "GROCERY" }, orderBy: { createdAt: "asc" } });
    expect(prisma.listItem.create).toHaveBeenCalledWith({ data: { listId: "g1", text: "milk", category: "DAIRY_EGGS", position: 5 } });
    expect(revalidatePath).toHaveBeenCalledWith("/meals/shopping");
  });

  it("defaults to Other and starts positions at 0 on an empty list", async () => {
    vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: null } } as any);
    await addShoppingItemAction("eggs");
    expect(prisma.listItem.create).toHaveBeenCalledWith({ data: { listId: "g1", text: "eggs", category: "OTHER", position: 0 } });
  });

  it("creates the list if the household has none yet", async () => {
    vi.mocked(prisma.list.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "fresh" } as any);
    vi.mocked(prisma.list.create).mockResolvedValue({ id: "fresh" } as any);
    await addShoppingItemAction("eggs");
    expect(prisma.list.create).toHaveBeenCalledWith({ data: { householdId: "h1", kind: "GROCERY", name: "Shopping list", tags: [] } });
    expect(vi.mocked(prisma.listItem.create).mock.calls[0][0]!.data).toMatchObject({ listId: "fresh" });
  });

  it("rejects blank text, over-long text and an invalid section, writing nothing", async () => {
    expect(await addShoppingItemAction("   ")).toEqual({ ok: false, error: "Type an item first" });
    expect(await addShoppingItemAction("a".repeat(201))).toEqual({ ok: false, error: "Items can be at most 200 characters" });
    expect(await addShoppingItemAction("x", "ELECTRONICS" as any)).toEqual({ ok: false, error: "Invalid section" });
    expect(prisma.listItem.create).not.toHaveBeenCalled();
  });
});

describe("setItemCategoryAction", () => {
  it("moves an item, finding it only through the household's grocery list", async () => {
    expect(await setItemCategoryAction("i1", "FROZEN")).toEqual({ ok: true });
    expect(prisma.listItem.findFirst).toHaveBeenCalledWith({
      where: { id: "i1", list: { householdId: "h1", kind: "GROCERY" } },
      select: { id: true },
    });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { category: "FROZEN" } });
  });

  it("treats another household's item, or an item of an ordinary list, as not found", async () => {
    vi.mocked(prisma.listItem.findFirst).mockResolvedValue(null);
    expect(await setItemCategoryAction("theirs", "FROZEN")).toEqual({ ok: false, error: "That item isn't on your shopping list any more" });
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("rejects a section that doesn't exist", async () => {
    expect(await setItemCategoryAction("i1", "ELECTRONICS" as any)).toEqual({ ok: false, error: "Invalid section" });
    expect(prisma.listItem.findFirst).not.toHaveBeenCalled();
  });
});

describe("removeCheckedItemsAction", () => {
  it("deletes only the checked items of the household's shopping list and says how many", async () => {
    expect(await removeCheckedItemsAction()).toEqual({ ok: true, removed: 2 });
    expect(prisma.listItem.deleteMany).toHaveBeenCalledWith({ where: { listId: "g1", checked: true } });
    expect(revalidatePath).toHaveBeenCalledWith("/meals");
  });
});
