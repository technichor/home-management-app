import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    list: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    listItem: { findUnique: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    contact: { findUnique: vi.fn() },
  };
  prisma.$transaction = (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: any) => unknown)(prisma) : Promise.all(arg as unknown[]);
  return { prisma };
});

import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import {
  addItemsAction,
  archiveListAction,
  deleteListAction,
  importItemsAction,
  recordComparisonAction,
  renameListAction,
  reorderItemsAction,
  setSortModeAction,
  toggleItemAction,
  unarchiveListAction,
  updateItemAction,
  deleteItemAction,
} from "@/app/(app)/lists/actions";

const grocery = { id: "g1", householdId: "h1", kind: "GROCERY", sortMode: "MANUAL" };
const standard = { id: "l1", householdId: "h1", kind: "STANDARD", sortMode: "MANUAL" };
const SHOPPING = "The shopping list can't be changed this way";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.list.findUnique).mockResolvedValue(grocery as any);
  vi.mocked(prisma.listItem.findUnique).mockResolvedValue({ id: "i1", listId: "g1" } as any);
  vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: 0 } } as any);
  vi.mocked(prisma.listItem.createMany).mockResolvedValue({ count: 1 } as any);
  vi.mocked(prisma.listItem.update).mockResolvedValue({} as any);
  vi.mocked(prisma.listItem.delete).mockResolvedValue({} as any);
});

describe("the shopping (grocery) list can't be changed through the Lists actions", () => {
  it.each([
    ["rename", () => renameListAction("g1", "Other name")],
    ["archive", () => archiveListAction("g1")],
    ["unarchive", () => unarchiveListAction("g1")],
    ["delete", () => deleteListAction("g1")],
    ["reorder", () => reorderItemsAction("g1", ["i1"])],
    ["import", () => importItemsAction("g1", "text\nmilk")],
    ["compare", () => recordComparisonAction("g1", "i1", "i2", "A")],
    ["sort mode", () => setSortModeAction("g1", "PAIRWISE")],
  ])("refuses to %s it, writing nothing", async (_name, call) => {
    await expect(call()).rejects.toThrow(SHOPPING);
    expect(prisma.list.update).not.toHaveBeenCalled();
    expect(prisma.list.delete).not.toHaveBeenCalled();
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("refuses to assign an item to a contact, even to clear the assignee", async () => {
    await expect(updateItemAction("i1", { assignedToContactId: "c1" })).rejects.toThrow("can't be assigned");
    await expect(updateItemAction("i1", { assignedToContactId: null })).rejects.toThrow("can't be assigned");
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("still lets items be edited, checked and deleted (shared item behavior)", async () => {
    await updateItemAction("i1", { quantity: "2", notes: "ripe" });
    await toggleItemAction("i1", true);
    await deleteItemAction("i1");
    expect(prisma.listItem.update).toHaveBeenCalledTimes(2);
    expect(prisma.listItem.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });
});

describe("the same actions still work on an ordinary list", () => {
  beforeEach(() => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(standard as any);
    vi.mocked(prisma.list.update).mockResolvedValue({} as any);
    vi.mocked(prisma.list.delete).mockResolvedValue({} as any);
  });

  it("renames, archives, unarchives and deletes it", async () => {
    await renameListAction("l1", "New");
    await archiveListAction("l1");
    await unarchiveListAction("l1");
    await deleteListAction("l1");
    expect(prisma.list.update).toHaveBeenCalledTimes(3);
    expect(prisma.list.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
  });
});

describe("another household's grocery list is still just not found", () => {
  it("reports it as missing before saying anything about its kind", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ ...grocery, householdId: "other" } as any);
    await expect(renameListAction("g1", "x")).rejects.toThrow("List not found");
  });
});

describe("addItemsAction and sections", () => {
  it("puts items on a grocery list in Other unless a section is given", async () => {
    await addItemsAction("g1", ["milk"]);
    expect(vi.mocked(prisma.listItem.createMany).mock.calls[0][0]).toEqual({
      data: [{ listId: "g1", text: "milk", position: 1, category: "OTHER" }],
    });
  });

  it("files them in the given section", async () => {
    await addItemsAction("g1", ["apples", "pears"], "PRODUCE");
    expect(vi.mocked(prisma.listItem.createMany).mock.calls[0][0]).toEqual({
      data: [
        { listId: "g1", text: "apples", position: 1, category: "PRODUCE" },
        { listId: "g1", text: "pears", position: 2, category: "PRODUCE" },
      ],
    });
  });

  it("rejects a section that doesn't exist", async () => {
    await expect(addItemsAction("g1", ["x"], "ELECTRONICS" as any)).rejects.toThrow("Invalid section");
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
  });

  it("gives an ordinary list's items no section, and refuses one", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(standard as any);
    await addItemsAction("l1", ["milk"]);
    expect(vi.mocked(prisma.listItem.createMany).mock.calls[0][0]).toEqual({
      data: [{ listId: "l1", text: "milk", position: 1 }],
    });
    await expect(addItemsAction("l1", ["milk"], "PRODUCE")).rejects.toThrow("Only the shopping list has sections");
  });
});

describe("the to-do list can't be changed through the Lists actions at all", () => {
  it.each([
    ["rename", () => renameListAction("t1", "Other name")],
    ["delete", () => deleteListAction("t1")],
    ["add to", () => addItemsAction("t1", ["Mow"])],
    ["check an item of", () => toggleItemAction("i1", true)],
    ["edit an item of", () => updateItemAction("i1", { assignedToContactId: "anyone-in-the-directory" })],
    ["delete an item of", () => deleteItemAction("i1")],
    ["compare items of", () => recordComparisonAction("t1", "i1", "i2", "A")],
  ])("refuses to %s it, writing nothing", async (_name, call) => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "t1", householdId: "h1", kind: "TODO", sortMode: "MANUAL" } as any);
    vi.mocked(prisma.listItem.findUnique).mockResolvedValue({ id: "i1", listId: "t1" } as any);
    await expect(call()).rejects.toThrow("The to-do list can't be changed this way");
    expect(prisma.list.update).not.toHaveBeenCalled();
    expect(prisma.list.delete).not.toHaveBeenCalled();
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
    expect(prisma.listItem.update).not.toHaveBeenCalled();
    expect(prisma.listItem.delete).not.toHaveBeenCalled();
  });
});
