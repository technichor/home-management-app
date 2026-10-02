// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }),
}));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: {
    list: { findMany: vi.fn(), findUnique: vi.fn() },
    contact: { findMany: vi.fn() },
  },
}));
// Client components are tested on their own; here we only check what the pages hand them.
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/lists/ListsClient", () => ({
  default: (p: any) => ((seen.lists = p), <div>lists client</div>),
}));
vi.mock("@/app/(app)/lists/archived/ArchivedListsClient", () => ({
  default: (p: any) => ((seen.archived = p), <div>archived client</div>),
}));
vi.mock("@/app/(app)/lists/[id]/ListDetailClient", () => ({
  default: (p: any) => ((seen.detail = p), <div>detail client</div>),
}));
vi.mock("@/app/(app)/lists/[id]/compare/CompareClient", () => ({
  default: (p: any) => ((seen.compare = p), <div>compare client</div>),
}));

import { prisma } from "@/lib/db";
import ListsPage from "@/app/(app)/lists/page";
import ArchivedListsPage from "@/app/(app)/lists/archived/page";
import ListDetailPage from "@/app/(app)/lists/[id]/page";
import ComparePage from "@/app/(app)/lists/[id]/compare/page";
const idParams = Promise.resolve({ id: "l1" });

const item = (over: object = {}) => ({
  id: "i1",
  text: "milk",
  quantity: "2",
  notes: "n",
  checked: false,
  assignedToContactId: "c1",
  rating: 1500,
  comparisonCount: 0,
  ...over,
});
const dbList = (over: object = {}) => ({
  id: "l1",
  householdId: "h1",
  name: "Groceries",
  tags: ["a"],
  sortMode: "MANUAL",
  archivedAt: null,
  items: [item()],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
});

describe("ListsPage", () => {
  it("passes the household's active lists with item counts", async () => {
    vi.mocked(prisma.list.findMany).mockResolvedValue([
      dbList({ items: [{ id: "1", checked: true }, { id: "2", checked: false }] }),
    ] as any);
    render(await ListsPage());
    expect(prisma.list.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "h1", archivedAt: null } })
    );
    expect(seen.lists).toEqual({
      lists: [{ id: "l1", name: "Groceries", tags: ["a"], totalItems: 2, checkedItems: 1 }],
    });
  });
});

describe("ArchivedListsPage", () => {
  it("passes archived lists with a formatted archive date", async () => {
    vi.mocked(prisma.list.findMany).mockResolvedValue([
      dbList({ archivedAt: new Date("2026-03-04T12:00:00Z"), items: [] }),
      dbList({ id: "l2", archivedAt: new Date("2026-03-05T12:00:00Z"), items: [{ id: "1", checked: true }, { id: "2", checked: false }] }),
    ] as any);
    render(await ArchivedListsPage());
    expect(prisma.list.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "h1", archivedAt: { not: null } } })
    );
    expect(seen.archived.lists[1]).toMatchObject({ id: "l2", totalItems: 2, checkedItems: 1 });
    expect(seen.archived.lists[0]).toMatchObject({
      id: "l1",
      totalItems: 0,
      checkedItems: 0,
      archivedAt: new Date("2026-03-04T12:00:00Z").toLocaleDateString(),
    });
  });
});

describe("ListDetailPage", () => {
  beforeEach(() => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: "c1", firstName: "Sam", lastName: "Smith" },
    ] as any);
  });

  it("passes the list, its items and contact names", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ sortMode: "PAIRWISE" }) as any);
    render(await ListDetailPage({ params: idParams, searchParams: Promise.resolve({}) }));
    expect(seen.detail).toMatchObject({
      listId: "l1",
      listName: "Groceries",
      sortMode: "PAIRWISE",
      openImport: false,
      contacts: [{ id: "c1", name: "Sam Smith" }],
    });
    expect(seen.detail.items[0]).toEqual({
      id: "i1",
      text: "milk",
      quantity: "2",
      notes: "n",
      checked: false,
      assignedToContactId: "c1",
    });
    expect(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  });

  it("opens the import when asked via ?import=1", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList() as any);
    render(await ListDetailPage({ params: idParams, searchParams: Promise.resolve({ import: "1" }) }));
    expect(seen.detail.openImport).toBe(true);
  });

  it("404s for a missing list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(null);
    await expect(
      ListDetailPage({ params: idParams, searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("404s for another household's list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ householdId: "other" }) as any);
    await expect(
      ListDetailPage({ params: idParams, searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NOT_FOUND");
  });
});

describe("ComparePage", () => {
  it("passes the unchecked items with their ratings", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ sortMode: "PAIRWISE" }) as any);
    render(await ComparePage({ params: idParams }));
    expect(seen.compare).toEqual({
      listId: "l1",
      items: [{ id: "i1", text: "milk", quantity: "2", rating: 1500, comparisonCount: 0 }],
    });
    expect(screen.getByText("Prioritize")).toBeInTheDocument();
  });

  it("sends manually sorted lists back to the list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ sortMode: "MANUAL" }) as any);
    await expect(ComparePage({ params: idParams })).rejects.toThrow("REDIRECT:/lists/l1");
  });

  it("404s for a missing list or another household's list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(null);
    await expect(ComparePage({ params: idParams })).rejects.toThrow("NOT_FOUND");
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ householdId: "other" }) as any);
    await expect(ComparePage({ params: idParams })).rejects.toThrow("NOT_FOUND");
  });
});
