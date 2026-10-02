import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { getSessionUser, getHouseholdId, homePathFor, isUnverified, startSession, requireHouseholdId, pageHouseholdId } from "@/lib/auth";

beforeEach(() => vi.clearAllMocks());

describe("getSessionUser", () => {
  it("is null when nobody is signed in", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    expect(await getSessionUser()).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("signs out sessions that started before the last password change", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1", issuedAt: 1000 } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", passwordChangedAt: new Date(2000) } as any);
    expect(await getSessionUser()).toBeNull();
    // a cookie from before sessions carried issuedAt counts as oldest
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    expect(await getSessionUser()).toBeNull();
  });

  it("keeps sessions that started after the last password change", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1", issuedAt: 3000 } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", passwordChangedAt: new Date(2000) } as any);
    expect(await getSessionUser()).toMatchObject({ id: "u1" });
  });

  it("loads the signed-in user with their household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1" } as any);
    expect(await getSessionUser()).toEqual({ id: "u1" });
    expect(vi.mocked(prisma.user.findUnique).mock.calls[0][0]).toMatchObject({ where: { id: "u1" } });
  });
});

describe("isUnverified / homePathFor for unverified users", () => {
  it("only a null emailVerifiedAt counts as unverified", () => {
    expect(isUnverified({ emailVerifiedAt: null })).toBe(true);
    expect(isUnverified({ emailVerifiedAt: new Date() })).toBe(false);
    expect(isUnverified({})).toBe(false);
  });
  it("sends an unverified user to confirm their email, even if they have a household", () => {
    expect(homePathFor({ id: "u", emailVerifiedAt: null, household: { deletedAt: null } })).toBe("/verify-email");
  });
});

describe("homePathFor", () => {
  it("goes to the home page when the user has an active household", () => {
    expect(homePathFor({ id: "u", household: { deletedAt: null } })).toBe("/home");
  });
  it("goes to onboarding with no household", () => {
    expect(homePathFor({ id: "u", household: null })).toBe("/onboarding");
  });
  it("goes to onboarding when the household was deleted", () => {
    expect(homePathFor({ id: "u", household: { deletedAt: new Date() } })).toBe("/onboarding");
  });
});

describe("startSession", () => {
  it("stores the user id and when the session started", async () => {
    const session: any = { save: vi.fn() };
    vi.mocked(getIronSession).mockResolvedValue(session);
    const before = Date.now();
    await startSession({ id: "u1" });
    expect(session.userId).toBe("u1");
    expect(session.issuedAt).toBeGreaterThanOrEqual(before);
    expect(session.save).toHaveBeenCalled();
  });
});

describe("getHouseholdId", () => {
  it("is the user's household id, or null without an active household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", householdId: "h1", household: { deletedAt: null } } as any);
    expect(await getHouseholdId()).toBe("h1");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", householdId: "h1", household: { deletedAt: new Date() } } as any);
    expect(await getHouseholdId()).toBeNull();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", householdId: null, household: null } as any);
    expect(await getHouseholdId()).toBeNull();
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    expect(await getHouseholdId()).toBeNull();
  });
});

describe("requireHouseholdId / pageHouseholdId", () => {
  const withHousehold = { id: "u1", householdId: "h1", household: { id: "h1", deletedAt: null } };

  it("return the household id", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(withHousehold as any);
    expect(await requireHouseholdId()).toBe("h1");
    expect(await pageHouseholdId()).toBe("h1");
  });

  it("requireHouseholdId throws when there is none", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(requireHouseholdId()).rejects.toThrow("Not authenticated");
  });

  it("pageHouseholdId sends visitors to log in and household-less users to onboarding", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(pageHouseholdId()).rejects.toThrow("REDIRECT:/login");
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", householdId: null, household: null } as any);
    await expect(pageHouseholdId()).rejects.toThrow("REDIRECT:/onboarding");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...withHousehold, household: { id: "h1", deletedAt: new Date() } } as any);
    await expect(pageHouseholdId()).rejects.toThrow("REDIRECT:/onboarding");
  });
});

describe("requireMember / requireOwner", () => {
  async function load() {
    return import("@/lib/auth");
  }
  const member = (role: string, household: any = { id: "h", displayName: "H", deletedAt: null }) => ({
    id: "u1",
    role,
    householdId: household ? "h" : null,
    household,
  });

  it("rejects a signed-out user, a household-less user and a deleted household", async () => {
    const { requireMember } = await load();
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(requireMember()).rejects.toThrow("Not authenticated");
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member("MEMBER", null) as any);
    await expect(requireMember()).rejects.toThrow("Not authenticated");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member("OWNER", { id: "h", deletedAt: new Date() }) as any);
    await expect(requireMember()).rejects.toThrow("Not authenticated");
  });

  it("returns a member, and only lets owners through requireOwner", async () => {
    const { requireMember, requireOwner } = await load();
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member("MEMBER") as any);
    expect((await requireMember()).householdId).toBe("h");
    await expect(requireOwner()).rejects.toThrow("Only a household owner");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member("OWNER") as any);
    expect((await requireOwner()).role).toBe("OWNER");
  });
});
