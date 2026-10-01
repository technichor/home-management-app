import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    list: { findUnique: vi.fn() },
    listItem: { aggregate: vi.fn(), createMany: vi.fn() },
  },
}));

import { importItemsAction } from "@/app/[slug]/(app)/lists/actions";
import { prisma } from "@/lib/db";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "h1" } as any);
  vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: 4 } } as any);
  vi.mocked(prisma.listItem.createMany).mockResolvedValue({ count: 0 } as any);
});

describe("importItemsAction", () => {
  it("appends items after the current last position, in file order", async () => {
    const result = await importItemsAction("l1", "reynolds", "text,quantity\nmilk,2\neggs,\n");
    expect(result).toEqual({ added: 2, errors: [] });
    expect(prisma.listItem.createMany).toHaveBeenCalledWith({
      data: [
        { listId: "l1", text: "milk", quantity: "2", notes: null, position: 5 },
        { listId: "l1", text: "eggs", quantity: null, notes: null, position: 6 },
      ],
    });
  });

  it("starts at position 0 for an empty list", async () => {
    vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: null } } as any);
    await importItemsAction("l1", "reynolds", "text\nmilk\n");
    expect(vi.mocked(prisma.listItem.createMany).mock.calls[0]?.[0]?.data).toMatchObject([{ position: 0 }]);
  });

  it("inserts nothing when any row is invalid", async () => {
    const result = await importItemsAction("l1", "reynolds", "text\nmilk\n\" \"\n");
    expect(result.added).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
  });

  it("rejects a list from another household", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "other" } as any);
    await expect(importItemsAction("l1", "reynolds", "text\nmilk\n")).rejects.toThrow("List not found");
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
  });
});
