import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }),
}));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    list: { findUnique: vi.fn(), create: vi.fn() },
    listItem: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    contact: { findUnique: vi.fn() },
  };
  prisma.$transaction = (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: any) => unknown)(prisma) : Promise.all(arg as unknown[]);
  return { prisma };
});

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import {
  createListAction,
  addItemsAction,
  toggleItemAction,
  updateItemAction,
  deleteItemAction,
  reorderItemsAction,
} from "@/app/[slug]/(app)/lists/actions";
import { prisma } from "@/lib/db";

const myList = { id: "l1", householdId: "h1", sortMode: "MANUAL" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.list.findUnique).mockResolvedValue(myList as any);
  vi.mocked(prisma.list.create).mockResolvedValue({ id: "new" } as any);
  vi.mocked(prisma.listItem.findUnique).mockResolvedValue({ id: "i1", listId: "l1" } as any);
  vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: 2 } } as any);
  vi.mocked(prisma.listItem.createMany).mockResolvedValue({ count: 0 } as any);
  vi.mocked(prisma.listItem.update).mockResolvedValue({} as any);
  vi.mocked(prisma.listItem.delete).mockResolvedValue({} as any);
  vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: "c1", deletedAt: null } as any);
});

describe("createListAction", () => {
  it("creates the list in the session's household and returns its id", async () => {
    const r = await createListAction("reynolds", "Costco run", ["grocery"]);
    expect(r).toEqual({ id: "new" });
    expect(prisma.list.create).toHaveBeenCalledWith({
      data: { householdId: "h1", name: "Costco run", tags: ["grocery"] },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds/lists");
  });

  it("rejects an unauthenticated session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(createListAction("reynolds", "x", [])).rejects.toThrow("Not authenticated");
    expect(prisma.list.create).not.toHaveBeenCalled();
  });

  it("trims the name and rejects a blank one", async () => {
    await createListAction("reynolds", "  Trip  ", []);
    expect(prisma.list.create).toHaveBeenCalledWith({ data: { householdId: "h1", name: "Trip", tags: [] } });
    await expect(createListAction("reynolds", "   ", [])).rejects.toThrow("List name is required");
    expect(prisma.list.create).toHaveBeenCalledTimes(1);
  });
});

describe("requireList (shared by every item action)", () => {
  it("rejects an unauthenticated session before touching the database", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(addItemsAction("l1", "s", ["milk"])).rejects.toThrow("Not authenticated");
    expect(prisma.list.findUnique).not.toHaveBeenCalled();
  });
});

describe("addItemsAction", () => {
  it("appends trimmed, non-blank lines after the last position", async () => {
    await addItemsAction("l1", "s", ["  milk ", "", "   ", "eggs"]);
    expect(prisma.listItem.createMany).toHaveBeenCalledWith({
      data: [
        { listId: "l1", text: "milk", position: 3 },
        { listId: "l1", text: "eggs", position: 4 },
      ],
    });
  });

  it("starts at position 0 on an empty list", async () => {
    vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: null } } as any);
    await addItemsAction("l1", "s", ["milk"]);
    expect(vi.mocked(prisma.listItem.createMany).mock.calls[0]?.[0]?.data).toMatchObject([{ position: 0 }]);
  });

  it("does nothing when every line is blank", async () => {
    await addItemsAction("l1", "s", ["", "  "]);
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
  });

  it("rejects another household's list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ ...myList, householdId: "other" } as any);
    await expect(addItemsAction("l1", "s", ["milk"])).rejects.toThrow("List not found");
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
  });
});

describe("toggleItemAction", () => {
  it("sets checked and stamps checkedAt", async () => {
    await toggleItemAction("i1", "s", true);
    expect(prisma.listItem.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { checked: true, checkedAt: expect.any(Date) },
    });
  });

  it("clears checkedAt when unchecking", async () => {
    await toggleItemAction("i1", "s", false);
    expect(prisma.listItem.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { checked: false, checkedAt: null },
    });
  });

  it("rejects an item in another household's list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ ...myList, householdId: "other" } as any);
    await expect(toggleItemAction("i1", "s", true)).rejects.toThrow("List not found");
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("rejects a missing item", async () => {
    vi.mocked(prisma.listItem.findUnique).mockResolvedValue(null);
    await expect(toggleItemAction("nope", "s", true)).rejects.toThrow("Item not found");
  });
});

describe("updateItemAction", () => {
  it("trims text, and turns blank quantity and notes into null", async () => {
    await updateItemAction("i1", "s", { text: "  milk  ", quantity: "  ", notes: "" });
    expect(prisma.listItem.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { text: "milk", quantity: null, notes: null },
    });
  });

  it("only changes the fields it is given", async () => {
    await updateItemAction("i1", "s", { quantity: "2 gallons" });
    expect(prisma.listItem.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { quantity: "2 gallons" },
    });
  });

  it("rejects blank item text", async () => {
    await expect(updateItemAction("i1", "s", { text: "   " })).rejects.toThrow("Item text is required");
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("assigns an existing contact", async () => {
    await updateItemAction("i1", "s", { assignedToContactId: "c1" });
    expect(prisma.listItem.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { assignedToContactId: "c1" },
    });
  });

  it("clears the assignee with null without looking up a contact", async () => {
    await updateItemAction("i1", "s", { assignedToContactId: null });
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
    expect(prisma.listItem.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { assignedToContactId: null },
    });
  });

  it("rejects a soft-deleted contact", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: "c1", deletedAt: new Date() } as any);
    await expect(updateItemAction("i1", "s", { assignedToContactId: "c1" })).rejects.toThrow("Contact not found");
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("rejects a contact that does not exist", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null);
    await expect(updateItemAction("i1", "s", { assignedToContactId: "gone" })).rejects.toThrow("Contact not found");
  });
});

describe("deleteItemAction", () => {
  it("deletes the item", async () => {
    await deleteItemAction("i1", "s");
    expect(prisma.listItem.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });

  it("rejects an item in another household's list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ ...myList, householdId: "other" } as any);
    await expect(deleteItemAction("i1", "s")).rejects.toThrow("List not found");
    expect(prisma.listItem.delete).not.toHaveBeenCalled();
  });
});

describe("reorderItemsAction", () => {
  beforeEach(() => {
    vi.mocked(prisma.listItem.findMany).mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }] as any);
  });

  it("writes position 0..n-1 in the given order", async () => {
    await reorderItemsAction("l1", "s", ["c", "a", "b"]);
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { position: 0 } });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { position: 1 } });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { position: 2 } });
  });

  it("rejects an id list that is missing an item", async () => {
    await expect(reorderItemsAction("l1", "s", ["a", "b"])).rejects.toThrow("does not match");
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("rejects an id that is not in the list", async () => {
    await expect(reorderItemsAction("l1", "s", ["a", "b", "zzz"])).rejects.toThrow("does not match");
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("rejects duplicate ids", async () => {
    await expect(reorderItemsAction("l1", "s", ["a", "a", "b"])).rejects.toThrow("does not match");
  });
});
