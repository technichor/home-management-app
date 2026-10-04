import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { sync: { findMany: vi.fn() }, user: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import {
  NOT_CONNECTED_ERROR,
  addToGeneral,
  allConnected,
  candidatesFor,
  checkChannelMembers,
  connectedHouseholdIds,
  ensureGeneral,
  leaveChannelTx,
  removeUserFromAllChannels,
} from "@/lib/channels";

const sync = (a: string, b: string | null) => ({ initiatingHouseholdId: a, counterpartHouseholdId: b });
const me = { id: "u1", householdId: "h1" };

function fakeTx() {
  return {
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn() },
    conversationMember: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  } as any;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.sync.findMany).mockResolvedValue([]);
  vi.mocked(prisma.user.findMany).mockResolvedValue([]);
});

describe("connectedHouseholdIds", () => {
  it("returns the other side of each active sync, whichever side started it, without duplicates or blanks", async () => {
    vi.mocked(prisma.sync.findMany).mockResolvedValue([sync("h1", "h2"), sync("h3", "h1"), sync("h1", "h2"), sync("h1", null)] as any);
    expect(await connectedHouseholdIds("h1")).toEqual(["h2", "h3"]);
    expect(vi.mocked(prisma.sync.findMany).mock.calls[0][0]!.where).toMatchObject({ status: "ACTIVE" });
  });
});

describe("candidatesFor", () => {
  it("lists accounts in the own and connected households, marking the own", async () => {
    vi.mocked(prisma.sync.findMany).mockResolvedValue([sync("h1", "h2")] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u2", firstName: "Ann", lastName: "A", householdId: "h1", household: { displayName: "Us" } },
      { id: "u3", firstName: "Bo", lastName: "B", householdId: "h2", household: null },
    ] as any);
    expect(await candidatesFor(me)).toEqual([
      { id: "u2", name: "Ann A", householdId: "h1", householdName: "Us", mine: true },
      { id: "u3", name: "Bo B", householdId: "h2", householdName: "", mine: false },
    ]);
    const where = vi.mocked(prisma.user.findMany).mock.calls[0][0]!.where as any;
    expect(where.householdId).toEqual({ in: ["h1", "h2"] });
    expect(where.id).toEqual({ not: "u1" });
  });
});

describe("allConnected", () => {
  it("is true for zero, one or the same household without asking the database", async () => {
    expect(await allConnected([])).toBe(true);
    expect(await allConnected(["h1", "h1"])).toBe(true);
    expect(prisma.sync.findMany).not.toHaveBeenCalled();
  });

  it("needs every pair linked", async () => {
    vi.mocked(prisma.sync.findMany).mockResolvedValue([sync("h1", "h2"), sync("h3", "h1")] as any);
    expect(await allConnected(["h1", "h2", "h3"])).toBe(false);
    vi.mocked(prisma.sync.findMany).mockResolvedValue([sync("h1", "h2"), sync("h3", "h1"), sync("h2", "h3")] as any);
    expect(await allConnected(["h1", "h2", "h3"])).toBe(true);
  });
});

describe("checkChannelMembers", () => {
  it("accepts nobody (or only yourself) without checking anything", async () => {
    expect(await checkChannelMembers(me, ["u1"])).toEqual({ ok: true, userIds: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("accepts people from the own household", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u2", householdId: "h1" }] as any);
    expect(await checkChannelMembers(me, ["u2", "u2"])).toEqual({ ok: true, userIds: ["u2"] });
  });

  it("refuses unknown users, users with no household and users from households not synced", async () => {
    const refusal = { ok: false, error: "You can only add people from your household or a household you're synced with." };
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);
    expect(await checkChannelMembers(me, ["ghost"])).toEqual(refusal);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u2", householdId: null }] as any);
    expect(await checkChannelMembers(me, ["u2"])).toEqual(refusal);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u2", householdId: "h9" }] as any);
    expect(await checkChannelMembers(me, ["u2"])).toEqual(refusal);
  });

  it("accepts a connected household's user", async () => {
    vi.mocked(prisma.sync.findMany).mockResolvedValue([sync("h1", "h2")] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u2", householdId: "h2" }] as any);
    expect(await checkChannelMembers(me, ["u2"])).toEqual({ ok: true, userIds: ["u2"] });
  });

  it("refuses when households already in the channel aren't connected to the newcomer's", async () => {
    // h1 is synced with h2 and h3, but h2 and h3 are not synced with each other.
    vi.mocked(prisma.sync.findMany).mockResolvedValue([sync("h1", "h2"), sync("h1", "h3")] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u3", householdId: "h3" }] as any);
    expect(await checkChannelMembers(me, ["u3"], ["h2"])).toEqual({ ok: false, error: NOT_CONNECTED_ERROR });
  });
});

describe("General channel", () => {
  it("ensureGeneral returns the existing channel", async () => {
    const tx = fakeTx();
    tx.conversation.findFirst.mockResolvedValue({ id: "g1" });
    expect(await ensureGeneral(tx, "h1")).toBe("g1");
    expect(tx.conversation.create).not.toHaveBeenCalled();
  });

  it("ensureGeneral creates it holding the whole household", async () => {
    const tx = fakeTx();
    tx.conversation.findFirst.mockResolvedValue(null);
    tx.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    tx.conversation.create.mockResolvedValue({ id: "g2" });
    expect(await ensureGeneral(tx, "h1")).toBe("g2");
    expect(tx.conversation.create).toHaveBeenCalledWith({
      data: { kind: "GENERAL", householdId: "h1", name: "General", members: { create: [{ userId: "u1" }, { userId: "u2" }] } },
    });
  });

  it("addToGeneral adds the user once", async () => {
    const tx = fakeTx();
    tx.conversation.findFirst.mockResolvedValue({ id: "g1" });
    await addToGeneral(tx, "u9", "h1");
    expect(tx.conversationMember.upsert).toHaveBeenCalledWith({
      where: { conversationId_userId: { conversationId: "g1", userId: "u9" } },
      create: { conversationId: "g1", userId: "u9" },
      update: {},
    });
  });
});

describe("leaveChannelTx", () => {
  it("only removes the membership in General", async () => {
    const tx = fakeTx();
    await leaveChannelTx(tx, "g1", "u1", "GENERAL");
    expect(tx.conversationMember.deleteMany).toHaveBeenCalledWith({ where: { conversationId: "g1", userId: "u1" } });
    expect(tx.conversationMember.findMany).not.toHaveBeenCalled();
  });

  it("archives a channel nobody is left in", async () => {
    const tx = fakeTx();
    tx.conversationMember.findMany.mockResolvedValue([]);
    await leaveChannelTx(tx, "c1", "u1", "CHANNEL");
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { archivedAt: expect.any(Date) } });
  });

  it("promotes the longest-standing member when no manager is left", async () => {
    const tx = fakeTx();
    tx.conversationMember.findMany.mockResolvedValue([{ id: "m2", role: "MEMBER" }, { id: "m3", role: "MEMBER" }]);
    await leaveChannelTx(tx, "c1", "u1", "CHANNEL");
    expect(tx.conversationMember.update).toHaveBeenCalledWith({ where: { id: "m2" }, data: { role: "MANAGER" } });
    expect(tx.conversation.update).not.toHaveBeenCalled();
  });

  it("changes nothing when a manager remains", async () => {
    const tx = fakeTx();
    tx.conversationMember.findMany.mockResolvedValue([{ id: "m2", role: "MANAGER" }]);
    await leaveChannelTx(tx, "c1", "u1", "CHANNEL");
    expect(tx.conversationMember.update).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
  });
});

describe("removeUserFromAllChannels", () => {
  it("leaves every channel the user is in", async () => {
    const tx = fakeTx();
    tx.conversationMember.findMany
      .mockResolvedValueOnce([
        { conversationId: "g1", conversation: { kind: "GENERAL" } },
        { conversationId: "c1", conversation: { kind: "CHANNEL" } },
      ])
      .mockResolvedValueOnce([{ id: "m2", role: "MANAGER" }]);
    await removeUserFromAllChannels(tx, "u1");
    expect(tx.conversationMember.deleteMany).toHaveBeenCalledTimes(2);
    expect(tx.conversationMember.deleteMany).toHaveBeenCalledWith({ where: { conversationId: "c1", userId: "u1" } });
  });
});
