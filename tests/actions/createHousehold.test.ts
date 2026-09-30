import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock redirect to throw so execution stops (mirrors real Next.js behaviour).
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
      create: vi.fn(),
    },
    activityLogEntry: {
      create: vi.fn(),
    },
  },
}));

import { createHouseholdAction } from "@/app/setup/actions";
import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";

function makeFormData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const validInput = {
  displayName: "The Reynolds Family",
  urlSlug: "reynolds-family",
  password: "secure-password",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createHouseholdAction", () => {
  it("returns error when displayName is missing", async () => {
    const fd = makeFormData({ ...validInput, displayName: "" });
    const result = await createHouseholdAction(null, fd);
    expect(result?.error).toMatch(/required/i);
  });

  it("returns error for bad slug format", async () => {
    const fd = makeFormData({ ...validInput, urlSlug: "Bad Slug!" });
    const result = await createHouseholdAction(null, fd);
    expect(result?.error).toBeTruthy();
  });

  it("returns error for short password", async () => {
    const fd = makeFormData({ ...validInput, password: "short" });
    const result = await createHouseholdAction(null, fd);
    expect(result?.error).toMatch(/8 characters/i);
  });

  it("returns error when slug is already taken", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "existing" } as any);
    const fd = makeFormData(validInput);
    const result = await createHouseholdAction(null, fd);
    expect(result?.error).toMatch(/already taken/i);
  });

  it("creates household, logs activity, sets session, then redirects", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed_pw" as never);
    vi.mocked(prisma.household.create).mockResolvedValue({ id: "hh1" } as any);
    vi.mocked(prisma.activityLogEntry.create).mockResolvedValue({} as any);

    const mockSession = { householdId: "", householdSlug: "", save: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(getIronSession).mockResolvedValue(mockSession as any);

    const fd = makeFormData(validInput);
    await expect(createHouseholdAction(null, fd)).rejects.toThrow("REDIRECT:/reynolds-family/contacts");

    expect(prisma.household.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          displayName: "The Reynolds Family",
          urlSlug: "reynolds-family",
          passwordHash: "hashed_pw",
        }),
      })
    );
    expect(prisma.activityLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CREATED", entityType: "HOUSEHOLD", entityId: "hh1" }),
      })
    );
    expect(mockSession.householdId).toBe("hh1");
    expect(mockSession.householdSlug).toBe("reynolds-family");
    expect(mockSession.save).toHaveBeenCalled();
  });

  it("hashes the password with bcrypt cost 12", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed_pw" as never);
    vi.mocked(prisma.household.create).mockResolvedValue({ id: "hh1" } as any);
    vi.mocked(prisma.activityLogEntry.create).mockResolvedValue({} as any);
    vi.mocked(getIronSession).mockResolvedValue({
      householdId: "", householdSlug: "", save: vi.fn().mockResolvedValue(undefined),
    } as any);

    const fd = makeFormData(validInput);
    await expect(createHouseholdAction(null, fd)).rejects.toThrow("REDIRECT:");

    expect(bcrypt.hash).toHaveBeenCalledWith("secure-password", 12);
  });
});
