import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }),
}));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    list: { findUnique: vi.fn(), update: vi.fn() },
    listItem: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  };
  prisma.$transaction = (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: any) => unknown)(prisma) : Promise.all(arg as unknown[]);
  return { prisma };
});

import {
  setSortModeAction,
  reorderItemsAction,
  recordComparisonAction,
} from "@/app/[slug]/(app)/lists/actions";
import { prisma } from "@/lib/db";

function listWithMode(sortMode: "MANUAL" | "PAIRWISE") {
  vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "h1", sortMode } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.list.update).mockResolvedValue({} as any);
  vi.mocked(prisma.listItem.updateMany).mockResolvedValue({ count: 0 } as any);
  vi.mocked(prisma.listItem.findMany).mockResolvedValue([{ id: "a" }, { id: "b" }] as any);
  vi.mocked(prisma.listItem.update).mockResolvedValue({} as any);
});

describe("setSortModeAction", () => {
  it("manual -> pairwise: sets the mode and resets every rating and count, without touching position", async () => {
    listWithMode("MANUAL");
    await setSortModeAction("l1", "s", "PAIRWISE");
    expect(prisma.list.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { sortMode: "PAIRWISE" } });
    expect(prisma.listItem.updateMany).toHaveBeenCalledWith({
      where: { listId: "l1" },
      data: { rating: 1500, comparisonCount: 0 },
    });
    const data = vi.mocked(prisma.listItem.updateMany).mock.calls[0]?.[0]?.data as object;
    expect(data).not.toHaveProperty("position");
  });

  it("pairwise -> manual: sets the mode and leaves items alone", async () => {
    listWithMode("PAIRWISE");
    await setSortModeAction("l1", "s", "MANUAL");
    expect(prisma.list.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { sortMode: "MANUAL" } });
    expect(prisma.listItem.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when the mode is unchanged (does not wipe ratings)", async () => {
    listWithMode("PAIRWISE");
    await setSortModeAction("l1", "s", "PAIRWISE");
    expect(prisma.list.update).not.toHaveBeenCalled();
    expect(prisma.listItem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid mode", async () => {
    listWithMode("MANUAL");
    await expect(setSortModeAction("l1", "s", "RANDOM" as any)).rejects.toThrow("Invalid sort mode");
  });

  it("rejects another household's list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "other", sortMode: "MANUAL" } as any);
    await expect(setSortModeAction("l1", "s", "PAIRWISE")).rejects.toThrow("List not found");
    expect(prisma.list.update).not.toHaveBeenCalled();
  });
});

describe("mode guards", () => {
  it("manual reorder is rejected on a pairwise list", async () => {
    listWithMode("PAIRWISE");
    await expect(reorderItemsAction("l1", "s", ["a", "b"])).rejects.toThrow("pairwise");
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("manual reorder works on a manual list", async () => {
    listWithMode("MANUAL");
    await reorderItemsAction("l1", "s", ["b", "a"]);
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { position: 0 } });
  });

  it("comparisons are rejected on a manual list", async () => {
    listWithMode("MANUAL");
    await expect(recordComparisonAction("l1", "s", "a", "b", "A")).rejects.toThrow("sorted manually");
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });
});
