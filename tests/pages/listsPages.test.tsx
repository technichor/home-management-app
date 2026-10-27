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
vi.mock("@/lib/channels", () => ({ candidatesFor: vi.fn() }));
vi.mock("@/lib/email", () => ({ appUrl: () => "https://domata.test" }));
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
import { candidatesFor } from "@/lib/channels";
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
  url: null,
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
  kind: "STANDARD",
  archivedAt: null,
  ownerUserId: "u1",
  sharedWithHousehold: true,
  publicToken: null,
  owner: { firstName: "Casey", lastName: "Becker" },
  household: { displayName: "The Beckers" },
  shares: [],
  items: [item()],
  ...over,
});
// The signed-in member is u1, an owner of h1 (tests/helpers/fakeAuth).

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
});

describe("ListsPage", () => {
  it("asks only for the lists the member can see, active ones, and passes each with its counts and who sees it", async () => {
    vi.mocked(prisma.list.findMany).mockResolvedValue([
      dbList({ items: [{ checked: true }, { checked: false }] }),
      dbList({ id: "l2", kind: "GIFT", publicToken: "tok", items: [] }),
    ] as any);
    render(await ListsPage());
    const where = vi.mocked(prisma.list.findMany).mock.calls[0][0]!.where;
    expect(where).toEqual({
      kind: { in: ["STANDARD", "GIFT"] },
      OR: [
        { ownerUserId: "u1" },
        { householdId: "h1", ownerUserId: null },
        { householdId: "h1", sharedWithHousehold: true },
        { shares: { some: { userId: "u1" } } },
      ],
      archivedAt: null,
    });
    expect(seen.lists.lists).toEqual([
      { id: "l1", name: "Groceries", tags: ["a"], kind: "STANDARD", totalItems: 2, checkedItems: 1, access: "manage", visibility: "HOUSEHOLD", sharedBy: null, archivedAt: null },
      { id: "l2", name: "Groceries", tags: ["a"], kind: "GIFT", totalItems: 0, checkedItems: 0, access: "manage", visibility: "PUBLIC", sharedBy: null, archivedAt: null },
    ]);
  });

  it("says who shared a list with the member, and what they can do with it", async () => {
    vi.mocked(prisma.list.findMany).mockResolvedValue([
      dbList({ id: "theirs", householdId: "h2", ownerUserId: "x", owner: { firstName: "Ann", lastName: "Ray" }, shares: [{ userId: "u1", canEdit: false }] }),
      dbList({ id: "private-to-me", ownerUserId: "x", sharedWithHousehold: false, shares: [{ userId: "u1", canEdit: true }] }),
      dbList({ id: "household", ownerUserId: "x" }),
      dbList({ id: "ownerless", ownerUserId: null, owner: null, sharedWithHousehold: false }),
    ] as any);
    render(await ListsPage());
    expect(seen.lists.lists.map((l: any) => [l.id, l.access, l.visibility, l.sharedBy])).toEqual([
      ["theirs", "view", "SHARED", "Ann Ray"],
      ["private-to-me", "edit", "SHARED", "Casey Becker"],
      ["household", "edit", "HOUSEHOLD", null],
      ["ownerless", "manage", "PERSONAL", null],
    ]);
  });
});

describe("ArchivedListsPage", () => {
  it("passes the archived lists the member can see, with the date archived", async () => {
    vi.mocked(prisma.list.findMany).mockResolvedValue([
      dbList({ archivedAt: new Date("2026-03-04T12:00:00Z"), items: [] }),
      dbList({ id: "l2", archivedAt: new Date("2026-03-05T12:00:00Z"), items: [{ checked: true }, { checked: false }] }),
    ] as any);
    render(await ArchivedListsPage());
    const args = vi.mocked(prisma.list.findMany).mock.calls[0][0]!;
    expect(args.where).toMatchObject({ archivedAt: { not: null }, kind: { in: ["STANDARD", "GIFT"] } });
    expect(args.orderBy).toEqual({ archivedAt: "desc" });
    expect(seen.archived.lists[1]).toMatchObject({ id: "l2", totalItems: 2, checkedItems: 1, access: "manage" });
    expect(seen.archived.lists[0]).toMatchObject({ id: "l1", totalItems: 0, archivedAt: new Date("2026-03-04T12:00:00Z").toLocaleDateString() });
  });
});

describe("ListDetailPage", () => {
  beforeEach(() => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: "c1", firstName: "Sam", lastName: "Smith" },
    ] as any);
  });

  it("passes the owner the list, its items, contact names and who it is shared with", async () => {
    vi.mocked(candidatesFor).mockResolvedValue([
      { id: "u1", name: "Casey Becker", householdId: "h1", householdName: "The Beckers", mine: true },
      { id: "u2", name: "Sam Becker", householdId: "h1", householdName: "The Beckers", mine: true },
    ]);
    vi.mocked(prisma.list.findUnique).mockResolvedValue(
      dbList({
        sortMode: "PAIRWISE",
        publicToken: "tok",
        items: [item({ url: "https://shop.test/x" })],
        shares: [{ userId: "u3", canEdit: true, user: { firstName: "Ann", lastName: "Ray", household: { displayName: "The Rays" } } }],
      }) as any,
    );
    render(await ListDetailPage({ params: idParams, searchParams: Promise.resolve({}) }));
    expect(seen.detail).toMatchObject({
      listId: "l1",
      listName: "Groceries",
      kind: "STANDARD",
      sortMode: "PAIRWISE",
      openImport: false,
      canEdit: true,
      visibility: "PUBLIC",
      ownerName: null,
      contacts: [{ id: "c1", name: "Sam Smith" }],
    });
    expect(seen.detail.items[0]).toEqual({ id: "i1", text: "milk", quantity: "2", notes: "n", url: "https://shop.test/x", checked: false, assignedToContactId: "c1" });
    expect(seen.detail.sharing).toEqual({
      householdName: "The Beckers",
      sharedWithHousehold: true,
      shares: [{ userId: "u3", name: "Ann Ray", householdName: "The Rays", canEdit: true }],
      // The people it can be shared with: the same as a channel can hold, less the owner.
      candidates: [{ id: "u2", name: "Sam Becker", householdName: "The Beckers" }],
      publicUrl: "https://domata.test/l/tok",
    });
    expect(candidatesFor).toHaveBeenCalledWith({ id: "u1", householdId: "h1" });
    expect(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  });

  it("gives someone it's shared with to view the list read only, with no sharing, contacts or assignee picking", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(
      dbList({ kind: "GIFT", householdId: "h2", ownerUserId: "x", owner: { firstName: "Ann", lastName: "Ray" }, shares: [{ userId: "u1", canEdit: false, user: { firstName: "Casey", lastName: "Becker", household: null } }] }) as any,
    );
    render(await ListDetailPage({ params: idParams, searchParams: Promise.resolve({}) }));
    expect(seen.detail).toMatchObject({ kind: "GIFT", canEdit: false, visibility: "SHARED", ownerName: "Ann Ray", sharing: null, contacts: [] });
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("names nobody as the owner of a list whose owner's account is gone, and says when a sharee has no household", async () => {
    vi.mocked(candidatesFor).mockResolvedValue([]);
    vi.mocked(prisma.list.findUnique).mockResolvedValue(
      dbList({ ownerUserId: null, owner: null, shares: [{ userId: "u9", canEdit: false, user: { firstName: "Lee", lastName: "Ray", household: null } }] }) as any,
    );
    render(await ListDetailPage({ params: idParams, searchParams: Promise.resolve({}) }));
    expect(seen.detail.ownerName).toBeNull();
    expect(seen.detail.sharing.shares[0].householdName).toBe("No household");
    expect(seen.detail.sharing.publicUrl).toBeNull();
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

  it("404s for a list the member can't see: another household's, or a personal list of someone else's", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ householdId: "other", ownerUserId: "x" }) as any);
    await expect(ListDetailPage({ params: idParams, searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ ownerUserId: "x", sharedWithHousehold: false }) as any);
    await expect(
      ListDetailPage({ params: idParams, searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("404s for the shopping list, which has its own page", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ kind: "GROCERY" }) as any);
    await expect(
      ListDetailPage({ params: idParams, searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NOT_FOUND");
  });
});

describe("ComparePage", () => {
  it("passes the unchecked items with their ratings", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ sortMode: "PAIRWISE" }) as any);
    render(await ComparePage({ params: idParams }));
    expect(seen.compare).toMatchObject({
      backHref: "/lists/l1",
      items: [{ id: "i1", text: "milk", detail: "2", rating: 1500, comparisonCount: 0 }],
    });
    // The answer is saved through the list's own comparison action, bound to this list.
    expect(seen.compare.compare).toEqual(expect.any(Function));
    expect(screen.getByText("Prioritize")).toBeInTheDocument();
  });

  it("sends manually sorted lists back to the list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ sortMode: "MANUAL" }) as any);
    await expect(ComparePage({ params: idParams })).rejects.toThrow("REDIRECT:/lists/l1");
  });

  it("404s for the shopping list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ kind: "GROCERY", sortMode: "PAIRWISE" }) as any);
    await expect(ComparePage({ params: idParams })).rejects.toThrow("NOT_FOUND");
  });

  it("404s for a missing list, another household's list, or one shared with the member only to view", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(null);
    await expect(ComparePage({ params: idParams })).rejects.toThrow("NOT_FOUND");
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ householdId: "other", ownerUserId: "x" }) as any);
    await expect(ComparePage({ params: idParams })).rejects.toThrow("NOT_FOUND");
    vi.mocked(prisma.list.findUnique).mockResolvedValue(dbList({ sortMode: "PAIRWISE", householdId: "other", ownerUserId: "x", shares: [{ userId: "u1", canEdit: false }] }) as any);
    await expect(ComparePage({ params: idParams })).rejects.toThrow("NOT_FOUND");
  });
});
