import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/channels", () => ({ candidatesFor: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    list: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    listItem: { findUnique: vi.fn(), aggregate: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    listShare: { createMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    contact: { findUnique: vi.fn() },
  },
}));

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { candidatesFor } from "@/lib/channels";
import {
  addItemsAction,
  createListAction,
  deleteListAction,
  leaveSharedListAction,
  newPublicLinkAction,
  renameListAction,
  setPublicAction,
  setShareEditAction,
  setSharedWithHouseholdAction,
  shareListAction,
  toggleItemAction,
  unshareListAction,
  updateItemAction,
} from "@/app/(app)/lists/actions";

// The signed-in member is u1 of household h1 (tests/helpers/fakeAuth).
const list = (over: object = {}) => ({
  id: "l1",
  householdId: "h1",
  kind: "STANDARD",
  sortMode: "MANUAL",
  ownerUserId: "u1",
  sharedWithHousehold: true,
  publicToken: null,
  shares: [],
  ...over,
});
const theirs = (canEdit: boolean) => list({ householdId: "h2", ownerUserId: "x", shares: [{ userId: "u1", canEdit }] });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.list.findUnique).mockResolvedValue(list() as any);
  vi.mocked(prisma.list.create).mockResolvedValue({ id: "new" } as any);
  vi.mocked(prisma.listItem.findUnique).mockResolvedValue({ id: "i1", listId: "l1" } as any);
  vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: 0 } } as any);
  vi.mocked(prisma.listShare.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.listShare.deleteMany).mockResolvedValue({ count: 1 });
  vi.mocked(candidatesFor).mockResolvedValue([
    { id: "u1", name: "Casey", householdId: "h1", householdName: "The Beckers", mine: true },
    { id: "u2", name: "Sam", householdId: "h1", householdName: "The Beckers", mine: true },
    { id: "u3", name: "Ann", householdId: "h2", householdName: "The Rays", mine: false },
  ]);
});

describe("creating", () => {
  it("makes a Gift ideas list owned by its creator, public from the start", async () => {
    await createListAction("Christmas", [], "GIFT");
    const data = vi.mocked(prisma.list.create).mock.calls[0][0].data as any;
    expect(data).toMatchObject({ householdId: "h1", ownerUserId: "u1", name: "Christmas", kind: "GIFT" });
    expect(data.publicToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("refuses a kind of list that can't be made here", async () => {
    await expect(createListAction("Food", [], "GROCERY" as any)).rejects.toThrow("Invalid list type");
    expect(prisma.list.create).not.toHaveBeenCalled();
  });
});

describe("who may do what", () => {
  it("lets someone a list is shared with to view do nothing to it", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(theirs(false) as any);
    await expect(addItemsAction("l1", ["x"])).rejects.toThrow("This list is shared with you to view, not to change");
    await expect(toggleItemAction("i1", true)).rejects.toThrow("This list is shared with you to view, not to change");
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });

  it("lets someone it is shared with to edit change its items, but not rename, delete or share it", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(theirs(true) as any);
    await addItemsAction("l1", ["x"]);
    expect(prisma.listItem.createMany).toHaveBeenCalled();
    await expect(renameListAction("l1", "Mine now")).rejects.toThrow("Only the list's owner can do that");
    await expect(deleteListAction("l1")).rejects.toThrow("Only the list's owner can do that");
    await expect(setPublicAction("l1", true)).rejects.toThrow("Only the list's owner can do that");
  });

  it("treats a personal list of someone else's in the household as not there", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(list({ ownerUserId: "u2", sharedWithHousehold: false }) as any);
    await expect(addItemsAction("l1", ["x"])).rejects.toThrow("List not found");
  });
});

describe("item links", () => {
  it("adds an item with its link, trimmed", async () => {
    await addItemsAction("l1", ["Lego set"], undefined, "  https://shop.test/lego ");
    expect(vi.mocked(prisma.listItem.createMany).mock.calls[0][0]!.data).toEqual([{ listId: "l1", text: "Lego set", position: 1, url: "https://shop.test/lego" }]);
  });

  it.each([
    ["isn't http(s)", ["x"], "javascript:alert(1)", "A link must start with http:// or https://"],
    ["is too long", ["x"], `https://shop.test/${"a".repeat(2000)}`, "A link can be at most 2,000 characters"],
    ["goes with several items", ["a", "b"], "https://shop.test/x", "A link can only go with one item"],
  ])("refuses a link that %s", async (_n, texts, url, error) => {
    await expect(addItemsAction("l1", texts as string[], undefined, url as string)).rejects.toThrow(error as string);
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
  });

  it("sets, keeps and clears an item's link", async () => {
    await updateItemAction("i1", { url: "https://shop.test/a" });
    expect(vi.mocked(prisma.listItem.update).mock.calls[0][0].data).toEqual({ url: "https://shop.test/a" });
    await updateItemAction("i1", { text: "Lego" });
    expect(vi.mocked(prisma.listItem.update).mock.calls[1][0].data).toEqual({ text: "Lego" });
    await updateItemAction("i1", { url: "  " });
    expect(vi.mocked(prisma.listItem.update).mock.calls[2][0].data).toEqual({ url: null });
    await expect(updateItemAction("i1", { url: "ftp://x" })).rejects.toThrow("A link must start with http:// or https://");
  });

  it("assigns items to people in the list's own household's directory, whoever edits it", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(theirs(true) as any);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: "c1", ownerHouseholdId: "h2", deletedAt: null } as any);
    await updateItemAction("i1", { assignedToContactId: "c1" });
    expect(prisma.listItem.update).toHaveBeenCalled();
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: "c9", ownerHouseholdId: "h1", deletedAt: null } as any);
    await expect(updateItemAction("i1", { assignedToContactId: "c9" })).rejects.toThrow("Contact not found");
  });
});

describe("sharing", () => {
  it("turns sharing with the household off and on", async () => {
    expect(await setSharedWithHouseholdAction("l1", false)).toEqual({ ok: true });
    expect(prisma.list.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { sharedWithHousehold: false } });
    expect(revalidatePath).toHaveBeenCalledWith("/lists/l1");
    expect(await setSharedWithHouseholdAction("l1", "yes" as any)).toEqual({ ok: false, error: "Invalid setting" });
  });

  it("shares with people from the household or a synced one, each to view or edit, once", async () => {
    expect(await shareListAction("l1", ["u2", "u3", "u3"], true)).toEqual({ ok: true });
    expect(candidatesFor).toHaveBeenCalledWith({ id: "u1", householdId: "h1" });
    expect(prisma.listShare.createMany).toHaveBeenCalledWith({
      data: [
        { listId: "l1", userId: "u2", canEdit: true },
        { listId: "l1", userId: "u3", canEdit: true },
      ],
      skipDuplicates: true,
    });
  });

  it.each([
    ["someone it can't be shared with", ["stranger"], false, "Choose people from your household or a household you're synced with"],
    ["its own owner", ["u1"], false, "Choose people from your household or a household you're synced with"],
    ["nobody", [], false, "Choose who to share it with"],
    ["no choice of view or edit", ["u2"], "edit", "Choose who to share it with"],
  ])("refuses sharing with %s", async (_n, ids, canEdit, error) => {
    expect(await shareListAction("l1", ids as string[], canEdit as boolean)).toEqual({ ok: false, error });
    expect(prisma.listShare.createMany).not.toHaveBeenCalled();
  });

  it("lets a household owner share a list whose owner is gone, with anyone they could share with", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(list({ ownerUserId: null }) as any);
    expect(await shareListAction("l1", ["u3"], false)).toEqual({ ok: true });
    expect(prisma.listShare.createMany).toHaveBeenCalledWith({ data: [{ listId: "l1", userId: "u3", canEdit: false }], skipDuplicates: true });
  });

  it("changes what a person can do, or says they no longer have it", async () => {
    expect(await setShareEditAction("l1", "u2", true)).toEqual({ ok: true });
    expect(prisma.listShare.updateMany).toHaveBeenCalledWith({ where: { listId: "l1", userId: "u2" }, data: { canEdit: true } });
    vi.mocked(prisma.listShare.updateMany).mockResolvedValue({ count: 0 });
    expect(await setShareEditAction("l1", "u2", false)).toEqual({ ok: false, error: "That person no longer has this list" });
    expect(await setShareEditAction("l1", "u2", 1 as any)).toEqual({ ok: false, error: "Invalid setting" });
  });

  it("stops sharing with someone", async () => {
    expect(await unshareListAction("l1", "u2")).toEqual({ ok: true });
    expect(prisma.listShare.deleteMany).toHaveBeenCalledWith({ where: { listId: "l1", userId: "u2" } });
  });

  it("lets someone take a list shared with them off their lists, and only that", async () => {
    expect(await leaveSharedListAction("l1")).toEqual({ ok: true });
    expect(prisma.listShare.deleteMany).toHaveBeenCalledWith({ where: { listId: "l1", userId: "u1" } });
    vi.mocked(prisma.listShare.deleteMany).mockResolvedValue({ count: 0 });
    expect(await leaveSharedListAction("l1")).toEqual({ ok: false, error: "That list isn't shared with you" });
  });

  it("only the owner changes who it's shared with", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(list({ ownerUserId: "u2" }) as any);
    await expect(shareListAction("l1", ["u3"], false)).rejects.toThrow("Only the list's owner can do that");
    await expect(unshareListAction("l1", "u3")).rejects.toThrow("Only the list's owner can do that");
    expect(prisma.listShare.createMany).not.toHaveBeenCalled();
  });
});

describe("the public link", () => {
  it("turns it on with a new random link, and off (the link stops working)", async () => {
    expect(await setPublicAction("l1", true)).toEqual({ ok: true });
    expect((vi.mocked(prisma.list.update).mock.calls[0][0].data as any).publicToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    vi.mocked(prisma.list.findUnique).mockResolvedValue(list({ publicToken: "tok" }) as any);
    expect(await setPublicAction("l1", false)).toEqual({ ok: true });
    expect(prisma.list.update).toHaveBeenLastCalledWith({ where: { id: "l1" }, data: { publicToken: null } });
  });

  it("does nothing when it is already as asked, and refuses a non-answer", async () => {
    expect(await setPublicAction("l1", false)).toEqual({ ok: true });
    expect(prisma.list.update).not.toHaveBeenCalled();
    expect(await setPublicAction("l1", "on" as any)).toEqual({ ok: false, error: "Invalid setting" });
  });

  it("replaces the link, so the old one stops working, but only while it's on", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(list({ publicToken: "old" }) as any);
    expect(await newPublicLinkAction("l1")).toEqual({ ok: true });
    const token = (vi.mocked(prisma.list.update).mock.calls[0][0].data as any).publicToken;
    expect(token).not.toBe("old");
    vi.mocked(prisma.list.findUnique).mockResolvedValue(list() as any);
    expect(await newPublicLinkAction("l1")).toEqual({ ok: false, error: "Turn on the public link first" });
  });

  it("can't be had for the shopping list", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(list({ kind: "GROCERY", ownerUserId: null }) as any);
    await expect(setPublicAction("l1", true)).rejects.toThrow("The shopping list can't be changed this way");
  });
});
