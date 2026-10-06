import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: {
    accountRecord: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    contact: { findMany: vi.fn() },
  },
}));

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createAccountRecordAction, deleteAccountRecordAction, updateAccountRecordAction } from "@/app/(app)/accounts/actions";

const fields = { name: "Corey's HSA", kind: "HEALTH_SAVINGS" as const, status: "ACTIVE" as const };
const members = [{ id: "m1", firstName: "Sam", lastName: "Doe", nickname: null }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue({ id: "a1", householdId: "h1", ownerContactId: null } as any);
  vi.mocked(prisma.accountRecord.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.accountRecord.update).mockResolvedValue({} as any);
  vi.mocked(prisma.accountRecord.delete).mockResolvedValue({} as any);
  vi.mocked(prisma.contact.findMany).mockResolvedValue(members as any);
});

describe("authentication", () => {
  it.each([
    ["create", () => createAccountRecordAction(fields)],
    ["update", () => updateAccountRecordAction("a1", fields)],
    ["delete", () => deleteAccountRecordAction("a1")],
  ])("%s refuses a caller with no session, touching nothing", async (_n, call) => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.accountRecord.findFirst).not.toHaveBeenCalled();
    expect(prisma.accountRecord.create).not.toHaveBeenCalled();
    expect(prisma.accountRecord.update).not.toHaveBeenCalled();
    expect(prisma.accountRecord.delete).not.toHaveBeenCalled();
  });
});

describe("createAccountRecordAction", () => {
  it("adds a record to the session's household", async () => {
    expect(await createAccountRecordAction({ ...fields, institution: "Fidelity", lastFour: "1234", ownerContactId: "m1", website: "https://f.test" })).toEqual({ ok: true, id: "new1" });
    expect(prisma.accountRecord.create).toHaveBeenCalledWith({
      data: {
        householdId: "h1", name: "Corey's HSA", kind: "HEALTH_SAVINGS", status: "ACTIVE", institution: "Fidelity", lastFour: "1234",
        ownerContactId: "m1", website: "https://f.test", phone: null, notes: null,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]!.where).toMatchObject({ ownerHouseholdId: "h1", householdId: "h1", category: "FAMILY_FRIEND", deletedAt: null });
  });

  it("owned by the whole household needs no member lookup", async () => {
    await createAccountRecordAction(fields);
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("refuses an owner who isn't one of the household's members", async () => {
    expect(await createAccountRecordAction({ ...fields, ownerContactId: "someone-elses" })).toEqual({ ok: false, error: "Choose one of your household's members" });
    expect(prisma.accountRecord.create).not.toHaveBeenCalled();
  });

  it("refuses a whole account number or a bad name, writing nothing", async () => {
    expect(await createAccountRecordAction({ ...fields, lastFour: "123456789" })).toMatchObject({ ok: false });
    expect(await createAccountRecordAction({ ...fields, name: " " })).toEqual({ ok: false, error: "Give it a name" });
    expect(prisma.accountRecord.create).not.toHaveBeenCalled();
  });
});

describe("updateAccountRecordAction", () => {
  it("finds the record only through the session's household, then replaces its fields", async () => {
    expect(await updateAccountRecordAction("a1", { ...fields, status: "REVIEW", notes: "Roll into the IRA" })).toEqual({ ok: true });
    expect(prisma.accountRecord.findFirst).toHaveBeenCalledWith({ where: { id: "a1", householdId: "h1" } });
    expect(vi.mocked(prisma.accountRecord.update).mock.calls[0][0]).toMatchObject({ where: { id: "a1" }, data: { status: "REVIEW", notes: "Roll into the IRA" } });
    expect(revalidatePath).toHaveBeenCalledWith("/accounts/a1");
  });

  it("keeps an owner who has since been removed, but won't pick a new non-member", async () => {
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue({ id: "a1", ownerContactId: "gone" } as any);
    expect(await updateAccountRecordAction("a1", { ...fields, ownerContactId: "gone" })).toEqual({ ok: true });
    expect(await updateAccountRecordAction("a1", { ...fields, ownerContactId: "other" })).toEqual({ ok: false, error: "Choose one of your household's members" });
  });

  it("treats another household's record as gone", async () => {
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue(null);
    expect(await updateAccountRecordAction("theirs", fields)).toEqual({ ok: false, error: "That account isn't in your list any more" });
    expect(prisma.accountRecord.update).not.toHaveBeenCalled();
  });
});

describe("deleteAccountRecordAction", () => {
  it("deletes the household's own record", async () => {
    expect(await deleteAccountRecordAction("a1")).toEqual({ ok: true });
    expect(prisma.accountRecord.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });
  it("leaves another household's record alone", async () => {
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue(null);
    expect(await deleteAccountRecordAction("theirs")).toEqual({ ok: false, error: "That account isn't in your list any more" });
    expect(prisma.accountRecord.delete).not.toHaveBeenCalled();
  });
});
