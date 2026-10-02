import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { getSessionUser, homePathFor, startSession } from "@/lib/auth";

beforeEach(() => vi.clearAllMocks());

describe("getSessionUser", () => {
  it("is null when nobody is signed in", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    expect(await getSessionUser()).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("loads the signed-in user with their household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1" } as any);
    expect(await getSessionUser()).toEqual({ id: "u1" });
    expect(vi.mocked(prisma.user.findUnique).mock.calls[0][0]).toMatchObject({ where: { id: "u1" } });
  });
});

describe("homePathFor", () => {
  it("goes to the household's contacts when the user has an active household", () => {
    expect(homePathFor({ id: "u", household: { id: "h", urlSlug: "smiths", deletedAt: null } })).toBe("/smiths/contacts");
  });
  it("goes to onboarding with no household", () => {
    expect(homePathFor({ id: "u", household: null })).toBe("/onboarding");
  });
  it("goes to onboarding when the household is deleted or has no slug", () => {
    expect(homePathFor({ id: "u", household: { id: "h", urlSlug: "s", deletedAt: new Date() } })).toBe("/onboarding");
    expect(homePathFor({ id: "u", household: { id: "h", urlSlug: null, deletedAt: null } })).toBe("/onboarding");
  });
});

describe("startSession", () => {
  it("stores the user and bridges the legacy household fields", async () => {
    const session: any = { save: vi.fn() };
    vi.mocked(getIronSession).mockResolvedValue(session);
    await startSession({ id: "u1", household: { id: "h1", urlSlug: "smiths", deletedAt: null } });
    expect(session).toMatchObject({ userId: "u1", householdId: "h1", householdSlug: "smiths" });
    expect(session.save).toHaveBeenCalled();
  });

  it("stores only the user when there is no usable household", async () => {
    const session: any = { save: vi.fn() };
    vi.mocked(getIronSession).mockResolvedValue(session);
    await startSession({ id: "u1", household: null });
    expect(session.userId).toBe("u1");
    expect(session.householdId).toBeUndefined();
  });
});
