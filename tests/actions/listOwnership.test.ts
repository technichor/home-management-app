import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }),
}));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: {
    list: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import {
  renameListAction,
  archiveListAction,
  unarchiveListAction,
  deleteListAction,
} from "@/app/(app)/lists/actions";
import { prisma } from "@/lib/db";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.list.update).mockResolvedValue({} as any);
  vi.mocked(prisma.list.delete).mockResolvedValue({} as any);
});

describe("renameListAction: name validation", () => {
  it("trims the new name and rejects a blank one", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "h1", kind: "STANDARD" } as any);
    await renameListAction("l1", "  New  ");
    expect(prisma.list.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { name: "New" } });
    await expect(renameListAction("l1", " ")).rejects.toThrow("List name is required");
    expect(prisma.list.update).toHaveBeenCalledTimes(1);
  });
});

describe("list actions: household ownership", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["renameListAction", () => renameListAction("l1", "New")],
    ["archiveListAction", () => archiveListAction("l1")],
    ["unarchiveListAction", () => unarchiveListAction("l1")],
    ["deleteListAction", () => deleteListAction("l1")],
  ];

  it.each(calls)("%s works on the logged-in household's list", async (_name, call) => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "h1", kind: "STANDARD" } as any);
    await expect(call()).resolves.toBeUndefined();
  });

  it.each(calls)("%s rejects another household's list without writing", async (_name, call) => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "other" } as any);
    await expect(call()).rejects.toThrow("List not found");
    expect(prisma.list.update).not.toHaveBeenCalled();
    expect(prisma.list.delete).not.toHaveBeenCalled();
  });

  it.each(calls)("%s rejects a list that does not exist", async (_name, call) => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(null);
    await expect(call()).rejects.toThrow("List not found");
  });
});
