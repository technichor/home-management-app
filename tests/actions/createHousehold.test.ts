import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

vi.mock("@/lib/db", () => {
  const prisma: any = {
    household: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    contact: { create: vi.fn() },
    activityLogEntry: { createMany: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

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
  setupCode: "let-me-in",
  firstName: "Sam",
  lastName: "Reynolds",
  displayName: "The Reynolds Family",
  urlSlug: "reynolds-family",
  password: "secure-password",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SETUP_CODE", "let-me-in");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createHouseholdAction: setup code", () => {
  it("is closed when no SETUP_CODE is configured", async () => {
    vi.stubEnv("SETUP_CODE", "");
    const result = await createHouseholdAction(null, makeFormData(validInput));
    expect(result?.error).toMatch(/turned off/i);
    expect(prisma.household.findUnique).not.toHaveBeenCalled();
    expect(prisma.household.create).not.toHaveBeenCalled();
  });

  it("is closed even if the caller sends an empty code", async () => {
    vi.stubEnv("SETUP_CODE", "");
    const result = await createHouseholdAction(null, makeFormData({ ...validInput, setupCode: "" }));
    expect(result?.error).toMatch(/turned off/i);
  });

  it.each([
    ["a wrong code of a different length", "nope"],
    ["a wrong code of the same length", "let-me-out"],
    ["an empty code", ""],
  ])("rejects %s without touching the database", async (_name, code) => {
    const result = await createHouseholdAction(null, makeFormData({ ...validInput, setupCode: code }));
    expect(result?.error).toBe("Incorrect setup code.");
    expect(prisma.household.findUnique).not.toHaveBeenCalled();
    expect(prisma.household.create).not.toHaveBeenCalled();
  });

  it("rejects a request with no setupCode field at all", async () => {
    const { setupCode: _omit, ...withoutCode } = validInput;
    const result = await createHouseholdAction(null, makeFormData(withoutCode));
    expect(result?.error).toBe("Incorrect setup code.");
  });
});

describe("createHouseholdAction", () => {
  it("returns error when displayName is missing", async () => {
    const result = await createHouseholdAction(null, makeFormData({ ...validInput, displayName: "" }));
    expect(result?.error).toMatch(/required/i);
  });

  it("returns error when the owner's name is missing", async () => {
    const first = await createHouseholdAction(null, makeFormData({ ...validInput, firstName: "" }));
    const last = await createHouseholdAction(null, makeFormData({ ...validInput, lastName: "" }));
    expect(first?.error).toBe("First name is required");
    expect(last?.error).toBe("Last name is required");
    expect(prisma.household.create).not.toHaveBeenCalled();
  });

  it("returns error for bad slug format", async () => {
    const result = await createHouseholdAction(null, makeFormData({ ...validInput, urlSlug: "Bad Slug!" }));
    expect(result?.error).toBeTruthy();
  });

  it("returns error for short password", async () => {
    const result = await createHouseholdAction(null, makeFormData({ ...validInput, password: "short" }));
    expect(result?.error).toMatch(/8 characters/i);
  });

  it("returns error when slug is already taken", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "existing" } as any);
    const result = await createHouseholdAction(null, makeFormData(validInput));
    expect(result?.error).toMatch(/already taken/i);
    expect(prisma.household.create).not.toHaveBeenCalled();
  });

  function allowCreate() {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed_pw" as never);
    vi.mocked(prisma.household.create).mockResolvedValue({ id: "hh1" } as any);
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: "owner1" } as any);
    vi.mocked(prisma.household.update).mockResolvedValue({} as any);
    vi.mocked(prisma.activityLogEntry.createMany).mockResolvedValue({ count: 2 } as any);
    const session = { householdId: "", householdSlug: "", save: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(getIronSession).mockResolvedValue(session as any);
    return session;
  }

  it("creates the household and its owner contact, links them, logs both, signs in, and redirects", async () => {
    const session = allowCreate();
    await expect(createHouseholdAction(null, makeFormData(validInput))).rejects.toThrow(
      "REDIRECT:/reynolds-family/contacts"
    );

    expect(prisma.household.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        displayName: "The Reynolds Family",
        urlSlug: "reynolds-family",
        passwordHash: "hashed_pw",
      }),
    });
    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: { householdId: "hh1", firstName: "Sam", lastName: "Reynolds", category: "FAMILY_FRIEND" },
    });
    expect(prisma.household.update).toHaveBeenCalledWith({
      where: { id: "hh1" },
      data: { accountContactId: "owner1" },
    });
    expect(prisma.activityLogEntry.createMany).toHaveBeenCalledWith({
      data: [
        { entityType: "HOUSEHOLD", entityId: "hh1", action: "CREATED", source: "MANUAL" },
        { entityType: "CONTACT", entityId: "owner1", action: "CREATED", source: "MANUAL" },
      ],
    });
    expect(session.householdId).toBe("hh1");
    expect(session.householdSlug).toBe("reynolds-family");
    expect(session.save).toHaveBeenCalled();
  });

  it("hashes the password with bcrypt cost 12", async () => {
    allowCreate();
    await expect(createHouseholdAction(null, makeFormData(validInput))).rejects.toThrow("REDIRECT:");
    expect(bcrypt.hash).toHaveBeenCalledWith("secure-password", 12);
  });
});
