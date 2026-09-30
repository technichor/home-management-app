import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    household: {
      findUnique: vi.fn(),
    },
  },
}));

import { loginAction, logoutAction } from "@/app/[slug]/actions";
import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";

function makeFormData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loginAction
// ---------------------------------------------------------------------------

describe("loginAction", () => {
  it("redirects with error when password field is empty", async () => {
    const fd = makeFormData({ password: "" });
    await expect(loginAction("reynolds-family", fd)).rejects.toThrow(
      "REDIRECT:/reynolds-family?error=Password+is+required"
    );
  });

  it("redirects with error when household not found", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    const fd = makeFormData({ password: "anything" });
    await expect(loginAction("reynolds-family", fd)).rejects.toThrow(
      "REDIRECT:/reynolds-family?error=Household+not+found"
    );
  });

  it("redirects with error when household has no passwordHash (not activated)", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({
      id: "hh1",
      passwordHash: null,
      deletedAt: null,
    } as any);
    const fd = makeFormData({ password: "anything" });
    await expect(loginAction("reynolds-family", fd)).rejects.toThrow(
      "REDIRECT:/reynolds-family?error=Household+not+found"
    );
  });

  it("redirects with error when household is soft-deleted", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({
      id: "hh1",
      passwordHash: "hash",
      deletedAt: new Date(),
    } as any);
    const fd = makeFormData({ password: "anything" });
    await expect(loginAction("reynolds-family", fd)).rejects.toThrow(
      "REDIRECT:/reynolds-family?error=Household+not+found"
    );
  });

  it("redirects with error when password is incorrect", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({
      id: "hh1",
      passwordHash: "hash",
      deletedAt: null,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const fd = makeFormData({ password: "wrong-pw" });
    await expect(loginAction("reynolds-family", fd)).rejects.toThrow(
      "REDIRECT:/reynolds-family?error=Incorrect+password"
    );
  });

  it("sets session and redirects to contacts on successful login", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({
      id: "hh1",
      passwordHash: "hash",
      deletedAt: null,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const mockSession = {
      householdId: "",
      householdSlug: "",
      save: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getIronSession).mockResolvedValue(mockSession as any);

    const fd = makeFormData({ password: "correct-pw" });
    await expect(loginAction("reynolds-family", fd)).rejects.toThrow(
      "REDIRECT:/reynolds-family/contacts"
    );

    expect(mockSession.householdId).toBe("hh1");
    expect(mockSession.householdSlug).toBe("reynolds-family");
    expect(mockSession.save).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// logoutAction
// ---------------------------------------------------------------------------

describe("logoutAction", () => {
  it("destroys session and redirects to household slug page", async () => {
    const mockSession = {
      householdSlug: "reynolds-family",
      destroy: vi.fn(),
    };
    vi.mocked(getIronSession).mockResolvedValue(mockSession as any);

    await expect(logoutAction()).rejects.toThrow("REDIRECT:/reynolds-family");
    expect(mockSession.destroy).toHaveBeenCalled();
  });

  it("redirects to / when session has no slug", async () => {
    const mockSession = {
      householdSlug: undefined,
      destroy: vi.fn(),
    };
    vi.mocked(getIronSession).mockResolvedValue(mockSession as any);

    await expect(logoutAction()).rejects.toThrow("REDIRECT:/");
  });
});
