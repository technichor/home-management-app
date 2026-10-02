import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    contact: { findUnique: vi.fn() },
    household: { findUnique: vi.fn() },
    sync: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    conversation: { create: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hashInviteToken } from "@/lib/syncToken";
import { requestSyncAction, regenerateInviteAction } from "@/app/[slug]/(app)/contacts/[id]/syncActions";
import { respondToInviteAction } from "@/app/invite/[token]/actions";

const outsider = (over: object = {}) => ({ id: "c1", householdId: "other", deletedAt: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.contact.findUnique).mockResolvedValue(outsider() as any);
  vi.mocked(prisma.sync.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.sync.create).mockResolvedValue({} as any);
  vi.mocked(prisma.sync.updateMany).mockResolvedValue({ count: 1 } as any);
});

describe("requestSyncAction", () => {
  it("creates a pending sync and returns a one-time link whose hash is what gets stored", async () => {
    const result = await requestSyncAction("s", "c1", "  Pat@Example.com ");
    expect(result.ok).toBe(true);
    const invitePath = (result as { invitePath: string }).invitePath;
    expect(invitePath).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/);
    const token = invitePath.replace("/invite/", "");

    const data = vi.mocked(prisma.sync.create).mock.calls[0]?.[0]?.data as any;
    expect(data).toEqual({
      initiatingHouseholdId: "h1",
      relatedContactId: "c1",
      counterpartEmail: "pat@example.com",
      inviteTokenHash: hashInviteToken(token),
    });
    expect(JSON.stringify(data)).not.toContain(token);
    expect(revalidatePath).toHaveBeenCalledWith("/s/contacts/c1");
  });

  it("requires a session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(requestSyncAction("s", "c1", "a@b.co")).rejects.toThrow("Not authenticated");
    expect(prisma.sync.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const result = await requestSyncAction("s", "c1", "nope");
    expect(result).toEqual({ ok: false, error: "Enter a valid email address" });
    expect(prisma.sync.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing contact", null],
    ["a removed contact", outsider({ deletedAt: new Date() })],
  ])("rejects %s", async (_name, contact) => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact as any);
    expect(await requestSyncAction("s", "c1", "a@b.co")).toEqual({ ok: false, error: "Contact not found." });
    expect(prisma.sync.create).not.toHaveBeenCalled();
  });

  it("rejects someone in our own household", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(outsider({ householdId: "h1" }) as any);
    const result = await requestSyncAction("s", "c1", "a@b.co");
    expect(result).toEqual({ ok: false, error: "People in your own household can already message each other." });
    expect(prisma.sync.create).not.toHaveBeenCalled();
  });

  it("accepts a contact with no household at all", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(outsider({ householdId: null }) as any);
    expect((await requestSyncAction("s", "c1", "a@b.co")).ok).toBe(true);
  });

  it("refuses a second open sync for the same contact", async () => {
    vi.mocked(prisma.sync.findFirst).mockResolvedValue({ status: "PENDING" } as any);
    expect(await requestSyncAction("s", "c1", "a@b.co")).toEqual({
      ok: false,
      error: "An invite to this contact is already pending.",
    });
    vi.mocked(prisma.sync.findFirst).mockResolvedValue({ status: "ACTIVE" } as any);
    expect(await requestSyncAction("s", "c1", "a@b.co")).toEqual({
      ok: false,
      error: "You are already synced with this contact.",
    });
    expect(prisma.sync.create).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.sync.findFirst).mock.calls[0]?.[0]).toMatchObject({
      where: { status: { in: ["PENDING", "ACTIVE"] } },
    });
  });
});

describe("regenerateInviteAction", () => {
  const mine = { id: "sy1", initiatingHouseholdId: "h1", relatedContactId: "c1" };

  it("replaces the link on our own pending invite", async () => {
    vi.mocked(prisma.sync.findUnique).mockResolvedValue(mine as any);
    const result = await regenerateInviteAction("s", "sy1");
    expect(result.ok).toBe(true);
    const token = (result as { invitePath: string }).invitePath.replace("/invite/", "");
    expect(prisma.sync.updateMany).toHaveBeenCalledWith({
      where: { id: "sy1", status: "PENDING" },
      data: { inviteTokenHash: hashInviteToken(token) },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/s/contacts/c1");
  });

  it("requires a session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(regenerateInviteAction("s", "sy1")).rejects.toThrow("Not authenticated");
  });

  it.each([
    ["a missing sync", null],
    ["another household's sync", { ...mine, initiatingHouseholdId: "other" }],
  ])("rejects %s", async (_name, sync) => {
    vi.mocked(prisma.sync.findUnique).mockResolvedValue(sync as any);
    expect(await regenerateInviteAction("s", "sy1")).toEqual({ ok: false, error: "Invite not found." });
    expect(prisma.sync.updateMany).not.toHaveBeenCalled();
  });

  it("will not touch an invite that is no longer pending", async () => {
    vi.mocked(prisma.sync.findUnique).mockResolvedValue(mine as any);
    vi.mocked(prisma.sync.updateMany).mockResolvedValue({ count: 0 } as any);
    expect(await regenerateInviteAction("s", "sy1")).toEqual({
      ok: false,
      error: "Only a pending invite can get a new link.",
    });
  });
});

describe("respondToInviteAction", () => {
  const pending = {
    id: "sy1",
    status: "PENDING",
    initiatingHouseholdId: "h-inviter",
    initiatingHousehold: { displayName: "Reynolds" },
  };

  beforeEach(() => {
    vi.mocked(prisma.sync.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ displayName: "Smiths" } as any);
    vi.mocked(prisma.conversation.create).mockResolvedValue({} as any);
  });

  it("accepting records our household, activates the sync, and opens a new SYNCED conversation", async () => {
    const result = await respondToInviteAction("tok", "accept");
    expect(result).toEqual({ ok: true, status: "ACTIVE" });
    expect(prisma.sync.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { inviteTokenHash: hashInviteToken("tok") } })
    );
    expect(prisma.sync.updateMany).toHaveBeenCalledWith({
      where: { id: "sy1", status: "PENDING" },
      data: { status: "ACTIVE", counterpartHouseholdId: "h1", respondedAt: expect.any(Date) },
    });
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { scope: "SYNCED", syncId: "sy1", name: "Reynolds & Smiths" },
    });
  });

  it("declining marks the sync declined without opening a conversation or recording our household", async () => {
    const result = await respondToInviteAction("tok", "decline");
    expect(result).toEqual({ ok: true, status: "DECLINED" });
    expect(prisma.sync.updateMany).toHaveBeenCalledWith({
      where: { id: "sy1", status: "PENDING" },
      data: { status: "DECLINED", respondedAt: expect.any(Date) },
    });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(respondToInviteAction("tok", "accept")).rejects.toThrow("Not authenticated");
    expect(prisma.sync.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a decision that is neither accept nor decline", async () => {
    expect(await respondToInviteAction("tok", "maybe" as any)).toEqual({ ok: false, error: "Invalid response." });
    expect(prisma.sync.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown or replaced link", async () => {
    vi.mocked(prisma.sync.findUnique).mockResolvedValue(null);
    expect(await respondToInviteAction("tok", "accept")).toEqual({ ok: false, error: "This invite link is not valid." });
  });

  it("does not let a household answer its own invite", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "h-inviter" } as any);
    expect(await respondToInviteAction("tok", "accept")).toEqual({
      ok: false,
      error: "You cannot answer your own invite.",
    });
    expect(prisma.sync.updateMany).not.toHaveBeenCalled();
  });

  it.each(["ACTIVE", "DECLINED", "REVOKED"])("rejects an invite that is already %s", async (status) => {
    vi.mocked(prisma.sync.findUnique).mockResolvedValue({ ...pending, status } as any);
    expect(await respondToInviteAction("tok", "accept")).toEqual({
      ok: false,
      error: "This invite was already answered.",
    });
    expect(prisma.sync.updateMany).not.toHaveBeenCalled();
  });

  it("loses gracefully if someone else answered between the check and the write", async () => {
    vi.mocked(prisma.sync.updateMany).mockResolvedValue({ count: 0 } as any);
    expect(await respondToInviteAction("tok", "accept")).toEqual({
      ok: false,
      error: "This invite was already answered.",
    });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("fails as unauthenticated if the logged-in household no longer exists", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    await expect(respondToInviteAction("tok", "accept")).rejects.toThrow("Not authenticated");
    expect(prisma.sync.updateMany).not.toHaveBeenCalled();
  });
});
