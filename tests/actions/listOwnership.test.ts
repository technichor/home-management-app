import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }),
}));
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
} from "@/app/[slug]/(app)/lists/actions";
import { prisma } from "@/lib/db";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.list.update).mockResolvedValue({} as any);
  vi.mocked(prisma.list.delete).mockResolvedValue({} as any);
});

describe("list actions: household ownership", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["renameListAction", () => renameListAction("l1", "New", "s")],
    ["archiveListAction", () => archiveListAction("l1", "s")],
    ["unarchiveListAction", () => unarchiveListAction("l1", "s")],
    ["deleteListAction", () => deleteListAction("l1", "s")],
  ];

  it.each(calls)("%s works on the logged-in household's list", async (_name, call) => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue({ id: "l1", householdId: "h1" } as any);
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
