import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }),
}));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    list: { findUnique: vi.fn() },
    listItem: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { recordComparisonAction } from "@/app/(app)/lists/actions";
import { prisma } from "@/lib/db";

const item = (id: string, rating: number, position: number, listId = "l1") => ({
  id,
  listId,
  rating,
  position,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "h1", sortMode: "PAIRWISE", kind: "STANDARD" } as any);
  vi.mocked(prisma.listItem.update).mockResolvedValue({} as any);
});

function setItems(items: ReturnType<typeof item>[]) {
  vi.mocked(prisma.listItem.findUnique).mockImplementation((async ({ where }: any) =>
    items.find((i) => i.id === where.id) ?? null) as any);
  // After the rating updates, the re-sort reads the list ordered by position.
  vi.mocked(prisma.listItem.findMany).mockResolvedValue(items as any);
}

describe("recordComparisonAction", () => {
  it("updates both ratings, bumps both counts, and returns the new ratings", async () => {
    setItems([item("a", 1500, 0), item("b", 1500, 1)]);
    const r = await recordComparisonAction("l1", "a", "b", "A");
    if (!r.ok) throw new Error(r.error);
    expect(r.a).toBeCloseTo(1516);
    expect(r.b).toBeCloseTo(1484);
    expect(prisma.listItem.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { rating: expect.closeTo(1516), comparisonCount: { increment: 1 } },
    });
    expect(prisma.listItem.update).toHaveBeenCalledWith({
      where: { id: "b" },
      data: { rating: expect.closeTo(1484), comparisonCount: { increment: 1 } },
    });
  });

  it("rewrites position by rating descending", async () => {
    // b currently sits above a; after the sort-by-rating step with a above b it must swap.
    setItems([item("b", 1484, 0), item("a", 1516, 1)]);
    await recordComparisonAction("l1", "a", "b", "A");
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { position: 0 } });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { position: 1 } });
  });

  it("rejects comparing an item with itself", async () => {
    expect(await recordComparisonAction("l1", "a", "a", "A")).toEqual({ ok: false, error: "Pick two different items" });
  });

  it("rejects an unknown outcome", async () => {
    expect(await recordComparisonAction("l1", "a", "b", "C" as any)).toEqual({ ok: false, error: "Invalid comparison result" });
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("rejects an item from another list", async () => {
    setItems([item("a", 1500, 0), item("b", 1500, 0, "other")]);
    expect(await recordComparisonAction("l1", "a", "b", "A")).toEqual({ ok: false, error: "Item not found in this list" });
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("rejects another household's list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "other" } as any);
    await expect(recordComparisonAction("l1", "a", "b", "A")).rejects.toThrow("List not found");
  });
});
