import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    contact: { findUnique: vi.fn(), create: vi.fn() },
    household: { update: vi.fn() },
    activityLogEntry: { create: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { linkAccountContactAction, createAccountContactAction } from "@/app/[slug]/(app)/account/actions";

const member = (over: object = {}) => ({
  id: "m1", householdId: "h1", category: "FAMILY_FRIEND", deletedAt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.contact.findUnique).mockResolvedValue(member() as any);
  vi.mocked(prisma.contact.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.household.update).mockResolvedValue({} as any);
  vi.mocked(prisma.activityLogEntry.create).mockResolvedValue({} as any);
});

describe("linkAccountContactAction", () => {
  it("links the account to a member of its own household", async () => {
    await linkAccountContactAction("s", "m1");
    expect(prisma.household.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { accountContactId: "m1" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/s/account");
  });

  it("requires a session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(linkAccountContactAction("s", "m1")).rejects.toThrow("Not authenticated");
    expect(prisma.household.update).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing contact", null],
    ["a removed contact", member({ deletedAt: new Date() })],
    ["a contact from another household", member({ householdId: "other" })],
    ["a contact that is not Family & Friend", member({ category: "SERVICE_PROVIDER" })],
  ])("rejects %s", async (_name, contact) => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact as any);
    await expect(linkAccountContactAction("s", "m1")).rejects.toThrow("Choose a Family & Friend contact");
    expect(prisma.household.update).not.toHaveBeenCalled();
  });
});

describe("createAccountContactAction", () => {
  it("creates a household member, links the account to it, and logs it", async () => {
    await createAccountContactAction("s", "  Sam ", "Smith");
    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: { householdId: "h1", firstName: "Sam", lastName: "Smith", category: "FAMILY_FRIEND" },
    });
    expect(prisma.household.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { accountContactId: "new1" },
    });
    expect(prisma.activityLogEntry.create).toHaveBeenCalledWith({
      data: { entityType: "CONTACT", entityId: "new1", action: "CREATED", source: "MANUAL" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/s/account");
    expect(revalidatePath).toHaveBeenCalledWith("/s/contacts");
  });

  it("requires a session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(createAccountContactAction("s", "A", "B")).rejects.toThrow("Not authenticated");
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it("rejects a blank name without writing", async () => {
    await expect(createAccountContactAction("s", " ", "B")).rejects.toThrow("First name is required");
    await expect(createAccountContactAction("s", "A", "")).rejects.toThrow("Last name is required");
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });
});
