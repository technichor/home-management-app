import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ requireOwner: vi.fn(), requireMember: vi.fn() }));
vi.mock("@/lib/db", () => {
  const prisma: any = {
    householdInvite: { create: vi.fn(), updateMany: vi.fn() },
    household: { update: vi.fn() },
    joinRequest: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    contact: { create: vi.fn() },
    activityLogEntry: { create: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import {
  createInviteAction,
  revokeInviteAction,
  setJoinCodeAction,
  decideJoinRequestAction,
  promoteMemberAction,
  removeMemberAction,
  leaveHouseholdAction,
} from "@/app/(app)/household/actions";
import { prisma } from "@/lib/db";
import { requireOwner, requireMember } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const owner: any = { id: "o1", role: "OWNER", householdId: "h1", household: { id: "h1", urlSlug: "smiths" } };
const member: any = { id: "m1", role: "MEMBER", householdId: "h1", household: { id: "h1", urlSlug: "smiths" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(owner);
  vi.mocked(requireMember).mockResolvedValue(owner);
});

describe("owner-only actions", () => {
  it.each([
    ["createInvite", () => createInviteAction()],
    ["revokeInvite", () => revokeInviteAction("i1")],
    ["setJoinCode", () => setJoinCodeAction(true)],
    ["decideJoinRequest", () => decideJoinRequestAction("r1", "approve")],
    ["promoteMember", () => promoteMemberAction("m1")],
    ["removeMember", () => removeMemberAction("m1")],
  ])("%s refuses a non-owner", async (_n, call) => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("Only a household owner can do that."));
    await expect(call()).rejects.toThrow("Only a household owner");
  });
});

describe("createInviteAction", () => {
  it("stores only the token hash, with an expiry, and returns the link", async () => {
    const r = await createInviteAction();
    expect(r.ok && r.invitePath).toMatch(/^\/join\/[A-Za-z0-9_-]{43}$/);
    const data = vi.mocked(prisma.householdInvite.create).mock.calls[0][0].data as any;
    expect(data.householdId).toBe("h1");
    expect(data.createdById).toBe("o1");
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toContain((r as any).invitePath.slice(6));
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(revalidatePath).toHaveBeenCalledWith("/household");
  });
});

describe("revokeInviteAction", () => {
  it("revokes a pending invite in the owner's household only", async () => {
    vi.mocked(prisma.householdInvite.updateMany).mockResolvedValue({ count: 1 });
    expect(await revokeInviteAction("i1")).toEqual({ ok: true });
    expect(vi.mocked(prisma.householdInvite.updateMany).mock.calls[0][0].where).toEqual({
      id: "i1",
      householdId: "h1",
      status: "PENDING",
    });
  });
  it("reports an invite that is not pending", async () => {
    vi.mocked(prisma.householdInvite.updateMany).mockResolvedValue({ count: 0 });
    expect(await revokeInviteAction("i1")).toEqual({ ok: false, error: "That invite is no longer pending." });
  });
});

describe("setJoinCodeAction", () => {
  it("turns on with a new code", async () => {
    const r = await setJoinCodeAction(true);
    expect(r.ok && r.joinCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(vi.mocked(prisma.household.update).mock.calls[0][0].where).toEqual({ id: "h1" });
  });
  it("turns off", async () => {
    expect(await setJoinCodeAction(false)).toEqual({ ok: true, joinCode: null });
    expect(vi.mocked(prisma.household.update).mock.calls[0][0].data).toEqual({ joinCode: null });
  });
  it("reports a code collision and rethrows other errors", async () => {
    vi.mocked(prisma.household.update).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await setJoinCodeAction(true)).toEqual({ ok: false, error: "Could not make a code. Try again." });
    vi.mocked(prisma.household.update).mockRejectedValueOnce(new Error("db down"));
    await expect(setJoinCodeAction(true)).rejects.toThrow("db down");
  });
});

describe("decideJoinRequestAction", () => {
  const request = { id: "r1", userId: "u9", user: { id: "u9", firstName: "Pat", lastName: "Lee" } };

  it("reports a request that is not pending in this household", async () => {
    vi.mocked(prisma.joinRequest.findFirst).mockResolvedValue(null);
    expect(await decideJoinRequestAction("r1", "approve")).toEqual({ ok: false, error: "That request is no longer pending." });
    expect(vi.mocked(prisma.joinRequest.findFirst).mock.calls[0][0]!.where).toMatchObject({ householdId: "h1", status: "PENDING" });
  });

  it("declines", async () => {
    vi.mocked(prisma.joinRequest.findFirst).mockResolvedValue(request as any);
    expect(await decideJoinRequestAction("r1", "decline")).toEqual({ ok: true });
    expect(vi.mocked(prisma.joinRequest.updateMany).mock.calls[0][0].data).toMatchObject({ status: "DECLINED" });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("approves: adds the member with a contact and cancels their other requests", async () => {
    vi.mocked(prisma.joinRequest.findFirst).mockResolvedValue(request as any);
    vi.mocked(prisma.joinRequest.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: "c9" } as any);
    expect(await decideJoinRequestAction("r1", "approve")).toEqual({ ok: true });
    expect(vi.mocked(prisma.user.updateMany).mock.calls[0][0]).toEqual({
      where: { id: "u9", householdId: null },
      data: { householdId: "h1", role: "MEMBER" },
    });
    const calls = vi.mocked(prisma.joinRequest.updateMany).mock.calls.map((c) => c[0].data);
    expect(calls[0]).toMatchObject({ status: "APPROVED" });
    expect(calls[1]).toMatchObject({ status: "CANCELLED" });
  });

  it("does not approve a request someone else just answered", async () => {
    vi.mocked(prisma.joinRequest.findFirst).mockResolvedValue(request as any);
    vi.mocked(prisma.joinRequest.updateMany).mockResolvedValue({ count: 0 });
    expect(await decideJoinRequestAction("r1", "approve")).toEqual({ ok: false, error: "That request is no longer pending." });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("reports a requester who joined another household meanwhile", async () => {
    vi.mocked(prisma.joinRequest.findFirst).mockResolvedValue(request as any);
    vi.mocked(prisma.joinRequest.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
    expect(await decideJoinRequestAction("r1", "approve")).toEqual({
      ok: false,
      error: "That person already belongs to a household.",
    });
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors", async () => {
    vi.mocked(prisma.joinRequest.findFirst).mockResolvedValue(request as any);
    vi.mocked(prisma.joinRequest.updateMany).mockRejectedValue(new Error("db down"));
    await expect(decideJoinRequestAction("r1", "approve")).rejects.toThrow("db down");
  });
});

describe("promoteMemberAction", () => {
  it("promotes only within the owner's household", async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
    expect(await promoteMemberAction("m1")).toEqual({ ok: true });
    expect(vi.mocked(prisma.user.updateMany).mock.calls[0][0].where).toEqual({ id: "m1", householdId: "h1" });
  });
  it("reports someone outside the household", async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
    expect(await promoteMemberAction("x")).toEqual({ ok: false, error: "That person is not in your household." });
  });
});

describe("removeMemberAction", () => {
  it("won't remove yourself", async () => {
    expect(await removeMemberAction("o1")).toEqual({ ok: false, error: "Use Leave household to remove yourself." });
  });
  it("reports someone outside the household", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    expect(await removeMemberAction("x")).toEqual({ ok: false, error: "That person is not in your household." });
    expect(vi.mocked(prisma.user.findFirst).mock.calls[0][0]!.where).toEqual({ id: "x", householdId: "h1" });
  });
  it("detaches a member", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "m1" } as any);
    expect(await removeMemberAction("m1")).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { householdId: null, role: "MEMBER", contactId: null },
    });
  });
});

describe("leaveHouseholdAction", () => {
  it("lets a member leave and goes to onboarding", async () => {
    vi.mocked(requireMember).mockResolvedValue(member);
    await expect(leaveHouseholdAction()).rejects.toThrow("REDIRECT:/onboarding");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { householdId: null, role: "MEMBER", contactId: null },
    });
  });

  it("stops the only owner from leaving", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    expect((await leaveHouseholdAction()) as any).toEqual({
      ok: false,
      error: "You are the only owner. Make someone else an owner before you leave.",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("lets an owner leave when another owner remains", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1);
    await expect(leaveHouseholdAction()).rejects.toThrow("REDIRECT:/onboarding");
  });
});
