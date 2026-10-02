import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);

vi.mock("@/lib/db", () => ({
  prisma: {
    contact: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    household: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    activityLogEntry: {
      create: vi.fn(),
    },
  },
}));

import { restoreContactAction, restoreHouseholdAction } from "@/app/[slug]/(app)/contacts/removed/actions";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getIronSession } from "iron-session";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: "c1", ownerHouseholdId: "h1" } as any);
  vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "x1", ownerHouseholdId: "h1" } as any);
  vi.mocked(prisma.contact.update).mockResolvedValue({} as any);
  vi.mocked(prisma.household.update).mockResolvedValue({} as any);
  vi.mocked(prisma.activityLogEntry.create).mockResolvedValue({} as any);
});

// ---------------------------------------------------------------------------
// restoreContactAction
// ---------------------------------------------------------------------------

describe("restoreContactAction", () => {
  it("clears deletedAt on the contact", async () => {
    await restoreContactAction("c1", "reynolds-family");
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { deletedAt: null },
    });
  });

  it("creates a RESTORED activity log entry", async () => {
    await restoreContactAction("c1", "reynolds-family");
    expect(prisma.activityLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "CONTACT",
          entityId: "c1",
          action: "RESTORED",
          source: "MANUAL",
        }),
      })
    );
  });

  it("revalidates the removed and contacts paths", async () => {
    await restoreContactAction("c1", "reynolds-family");
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts/removed");
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts");
  });
});

// ---------------------------------------------------------------------------
// restoreHouseholdAction
// ---------------------------------------------------------------------------

describe("restoreHouseholdAction", () => {
  it("clears deletedAt on the household", async () => {
    await restoreHouseholdAction("hh1", "reynolds-family");
    expect(prisma.household.update).toHaveBeenCalledWith({
      where: { id: "hh1" },
      data: { deletedAt: null },
    });
  });

  it("creates a RESTORED activity log entry", async () => {
    await restoreHouseholdAction("hh1", "reynolds-family");
    expect(prisma.activityLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "HOUSEHOLD",
          entityId: "hh1",
          action: "RESTORED",
          source: "MANUAL",
        }),
      })
    );
  });

  it("revalidates the removed and households paths", async () => {
    await restoreHouseholdAction("hh1", "reynolds-family");
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts/removed");
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts/households");
  });
});

describe("authentication", () => {
  it("refuses to restore a contact without a session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(restoreContactAction("c1", "s")).rejects.toThrow("Not authenticated");
    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(prisma.activityLogEntry.create).not.toHaveBeenCalled();
  });

  it("refuses to restore a household without a session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(restoreHouseholdAction("h1", "s")).rejects.toThrow("Not authenticated");
    expect(prisma.household.update).not.toHaveBeenCalled();
    expect(prisma.activityLogEntry.create).not.toHaveBeenCalled();
  });
});

describe("directory ownership", () => {
  it("won't restore a contact from another account's directory", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: "c1", ownerHouseholdId: "other" } as any);
    await expect(restoreContactAction("c1", "s")).rejects.toThrow("Contact not found");
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null);
    await expect(restoreContactAction("c1", "s")).rejects.toThrow("Contact not found");
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it("won't restore a household from another account's directory", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "x1", ownerHouseholdId: "other" } as any);
    await expect(restoreHouseholdAction("x1", "s")).rejects.toThrow("Household not found");
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    await expect(restoreHouseholdAction("x1", "s")).rejects.toThrow("Household not found");
    expect(prisma.household.update).not.toHaveBeenCalled();
  });

  it("can restore its own household record", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "h1", ownerHouseholdId: null } as any);
    await restoreHouseholdAction("h1", "s");
    expect(prisma.household.update).toHaveBeenCalled();
  });
});
