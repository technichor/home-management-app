import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(), startSession: vi.fn(), isUnverified: (u: any) => u.emailVerifiedAt === null }));
vi.mock("@/lib/db", () => {
  const prisma: any = {
    householdInvite: { findUnique: vi.fn(), updateMany: vi.fn() },
    household: { findUnique: vi.fn() },
    joinRequest: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    user: { updateMany: vi.fn(), update: vi.fn() },
    contact: { create: vi.fn() },
    activityLogEntry: { create: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { acceptHouseholdInviteAction } from "@/app/join/[token]/actions";
import { requestJoinAction, cancelJoinRequestAction } from "@/app/onboarding/actions";
import { prisma } from "@/lib/db";
import { getSessionUser, startSession } from "@/lib/auth";
import { hashInviteToken } from "@/lib/syncToken";

const user = { id: "u1", firstName: "Pat", lastName: "Lee", household: null };
const future = new Date(Date.now() + 3600_000);
const invite = (over: any = {}) => ({
  id: "i1",
  householdId: "h1",
  status: "PENDING",
  expiresAt: future,
  household: { id: "h1", deletedAt: null },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(user as any);
});

describe("acceptHouseholdInviteAction", () => {
  it("sends a signed-out visitor to log in and come back", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(acceptHouseholdInviteAction("tok")).rejects.toThrow("REDIRECT:/login?next=%2Fjoin%2Ftok");
  });

  it("refuses a user who hasn't confirmed their email", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, emailVerifiedAt: null } as any);
    expect(await acceptHouseholdInviteAction("tok")).toEqual({ error: "Confirm your email address first." });
    expect(prisma.householdInvite.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a user who already has a household", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, household: { id: "h0", deletedAt: null } } as any);
    expect(await acceptHouseholdInviteAction("tok")).toEqual({ error: "You already belong to a household." });
    expect(prisma.householdInvite.findUnique).not.toHaveBeenCalled();
  });

  it("rejects unknown, deleted-household, used and expired invites", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(null);
    expect(await acceptHouseholdInviteAction("tok")).toEqual({ error: "This invite link is not valid." });
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(
      invite({ household: { id: "h1", deletedAt: new Date() } }) as any
    );
    expect(await acceptHouseholdInviteAction("tok")).toEqual({ error: "This invite link is not valid." });
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite({ status: "REVOKED" }) as any);
    expect(await acceptHouseholdInviteAction("tok")).toEqual({ error: "This invite was already used or withdrawn." });
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite({ expiresAt: new Date(Date.now() - 1000) }) as any);
    expect(await acceptHouseholdInviteAction("tok")).toEqual({ error: "This invite has expired. Ask for a new one." });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("looks the invite up by token hash", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(null);
    await acceptHouseholdInviteAction("tok");
    expect(vi.mocked(prisma.householdInvite.findUnique).mock.calls[0][0].where).toEqual({ tokenHash: hashInviteToken("tok") });
  });

  it("joins as a member, cancels other requests, signs the session in and goes to the household", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite() as any);
    vi.mocked(prisma.householdInvite.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: "c1" } as any);
    await expect(acceptHouseholdInviteAction("tok")).rejects.toThrow("REDIRECT:/home");
    expect(vi.mocked(prisma.householdInvite.updateMany).mock.calls[0][0].data).toMatchObject({
      status: "ACCEPTED",
      acceptedById: "u1",
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", householdId: null },
      data: { householdId: "h1", role: "MEMBER" },
    });
    expect(vi.mocked(prisma.joinRequest.updateMany).mock.calls[0][0].data).toMatchObject({ status: "CANCELLED" });
    expect(startSession).toHaveBeenCalledWith(user);
  });

  it("loses a race for the same invite gracefully", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite() as any);
    vi.mocked(prisma.householdInvite.updateMany).mockResolvedValue({ count: 0 });
    expect(await acceptHouseholdInviteAction("tok")).toEqual({ error: "This invite was already used or withdrawn." });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite() as any);
    vi.mocked(prisma.householdInvite.updateMany).mockRejectedValue(new Error("db down"));
    await expect(acceptHouseholdInviteAction("tok")).rejects.toThrow("db down");
  });
});

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

describe("requestJoinAction", () => {
  it("won't ask to join before the email is confirmed", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, emailVerifiedAt: null } as any);
    expect(await requestJoinAction(null, fd({ joinCode: "ABCD2345" }))).toEqual({ error: "Confirm your email address first." });
    expect(prisma.household.findUnique).not.toHaveBeenCalled();
  });

  it("requires a signed-in user without a household", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(requestJoinAction(null, fd({ joinCode: "ABCD2345" }))).rejects.toThrow("REDIRECT:/login");
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, household: { id: "h0", deletedAt: null } } as any);
    expect(await requestJoinAction(null, fd({ joinCode: "ABCD2345" }))).toEqual({ error: "You already belong to a household." });
  });

  it("reports an empty, unknown or deleted-household code the same way", async () => {
    const none = { error: "No household uses that code." };
    expect(await requestJoinAction(null, fd({}))).toEqual(none);
    expect(await requestJoinAction(null, fd({ joinCode: "  " }))).toEqual(none);
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    expect(await requestJoinAction(null, fd({ joinCode: "ABCD2345" }))).toEqual(none);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "h1", displayName: "H", deletedAt: new Date() } as any);
    expect(await requestJoinAction(null, fd({ joinCode: "ABCD2345" }))).toEqual(none);
  });

  it("won't duplicate a pending request", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "h1", displayName: "The Smiths", deletedAt: null } as any);
    vi.mocked(prisma.joinRequest.findFirst).mockResolvedValue({ id: "r1" } as any);
    expect(await requestJoinAction(null, fd({ joinCode: "ABCD2345" }))).toEqual({ error: "You already asked to join The Smiths." });
    expect(prisma.joinRequest.create).not.toHaveBeenCalled();
  });

  it("files the request using the normalized code", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "h1", displayName: "The Smiths", deletedAt: null } as any);
    vi.mocked(prisma.joinRequest.findFirst).mockResolvedValue(null);
    expect(await requestJoinAction(null, fd({ joinCode: " abcd-2345 " }))).toBeNull();
    expect(vi.mocked(prisma.household.findUnique).mock.calls[0][0].where).toEqual({ joinCode: "ABCD2345" });
    expect(prisma.joinRequest.create).toHaveBeenCalledWith({ data: { userId: "u1", householdId: "h1" } });
  });
});

describe("cancelJoinRequestAction", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(cancelJoinRequestAction("r1")).rejects.toThrow("REDIRECT:/login");
  });
  it("cancels only the caller's own pending request", async () => {
    await cancelJoinRequestAction("r1");
    expect(vi.mocked(prisma.joinRequest.updateMany).mock.calls[0][0].where).toEqual({ id: "r1", userId: "u1", status: "PENDING" });
  });
});
