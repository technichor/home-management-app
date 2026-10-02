import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(), startSession: vi.fn() }));
vi.mock("@/lib/db", () => {
  const prisma: any = {
    household: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    contact: { create: vi.fn() },
    user: { update: vi.fn() },
    activityLogEntry: { createMany: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { createHouseholdForUserAction } from "@/app/onboarding/actions";
import { prisma } from "@/lib/db";
import { getSessionUser, startSession } from "@/lib/auth";

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

const user = { id: "u1", firstName: "Sam", lastName: "Smith", household: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(user as any);
  vi.mocked(prisma.household.findMany).mockResolvedValue([]);
  vi.mocked(prisma.household.create).mockResolvedValue({ id: "h1" } as any);
  vi.mocked(prisma.contact.create).mockResolvedValue({ id: "c1" } as any);
});

describe("createHouseholdForUserAction", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(createHouseholdForUserAction(null, fd({ displayName: "X" }))).rejects.toThrow("REDIRECT:/login");
    expect(prisma.household.create).not.toHaveBeenCalled();
  });

  it("refuses a user who already has a household", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, household: { id: "h0", deletedAt: null } } as any);
    expect(await createHouseholdForUserAction(null, fd({ displayName: "X" }))).toEqual({
      error: "You already belong to a household.",
    });
    expect(prisma.household.create).not.toHaveBeenCalled();
  });

  it("lets a user whose household was deleted start a new one", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, household: { id: "h0", deletedAt: new Date() } } as any);
    await expect(createHouseholdForUserAction(null, fd({ displayName: "Smiths" }))).rejects.toThrow("REDIRECT:");
  });

  it("requires a household name", async () => {
    const r = await createHouseholdForUserAction(null, fd({ displayName: "  " }));
    expect(r?.error).toContain("Household name is required");
  });

  it("creates the household, the founder's contact and the owner link together, then signs in", async () => {
    await expect(
      createHouseholdForUserAction(null, fd({ displayName: "The Smiths", mailingAddress: " 1 Main St " }))
    ).rejects.toThrow("REDIRECT:/the-smiths/contacts");

    expect(vi.mocked(prisma.household.create).mock.calls[0][0].data).toEqual({
      displayName: "The Smiths",
      mailingAddress: "1 Main St",
      urlSlug: "the-smiths",
    });
    expect(vi.mocked(prisma.contact.create).mock.calls[0][0].data).toEqual({
      householdId: "h1",
      ownerHouseholdId: "h1",
      firstName: "Sam",
      lastName: "Smith",
      category: "FAMILY_FRIEND",
    });
    expect(prisma.household.update).toHaveBeenCalledWith({ where: { id: "h1" }, data: { accountContactId: "c1" } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { householdId: "h1", role: "OWNER", contactId: "c1" },
    });
    expect(prisma.activityLogEntry.createMany).toHaveBeenCalled();
    expect(startSession).toHaveBeenCalledWith(user);
  });

  it("omits an empty address and picks a free slug", async () => {
    vi.mocked(prisma.household.findMany).mockResolvedValue([{ urlSlug: "the-smiths" }] as any);
    await expect(createHouseholdForUserAction(null, fd({ displayName: "The Smiths" }))).rejects.toThrow(
      "REDIRECT:/the-smiths-2/contacts"
    );
    expect(vi.mocked(prisma.household.create).mock.calls[0][0].data.mailingAddress).toBeUndefined();
  });

  it("reports a slug taken in a race", async () => {
    vi.mocked(prisma.household.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await createHouseholdForUserAction(null, fd({ displayName: "X Y" }))).toEqual({
      error: "That name was just taken. Try again.",
    });
  });

  it("rethrows unexpected errors", async () => {
    vi.mocked(prisma.household.create).mockRejectedValue(new Error("db down"));
    await expect(createHouseholdForUserAction(null, fd({ displayName: "X Y" }))).rejects.toThrow("db down");
  });
});
