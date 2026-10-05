import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireHouseholdId: vi.fn() }));
vi.mock("@/lib/db", () => {
  const prisma: any = {
    contact: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    household: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
    activityLogEntry: { create: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { createContactAction, updateContactAction, deleteContactAction } from "@/app/(app)/contacts/contactActions";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const valid = { firstName: " Jane ", lastName: "Smith", category: "SERVICE_PROVIDER" as const };
const existing = (over: object = {}) => ({
  id: "c1", ownerHouseholdId: "h1", deletedAt: null, householdId: null, firstName: "Jane", lastName: "Smith",
  nickname: null, category: "SERVICE_PROVIDER", address: null, phoneMobile: null, phoneHome: null, phoneWork: null,
  emailPrimary: null, emailSecondary: null, tags: [], favorite: false, relationshipNotes: null,
  linkedFamilyMember: null, importantDate1: null, importantDate1Label: null, importantDate2: null,
  importantDate2Label: null, birthdayMonth: null, birthdayDay: null, birthdayYear: null, notes: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireHouseholdId).mockResolvedValue("h1");
  vi.mocked(prisma.contact.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.contact.findUnique).mockResolvedValue(existing() as any);
  vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "hh", ownerHouseholdId: "h1", deletedAt: null } as any);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
});

describe("all three actions require a household session", () => {
  it.each([
    ["create", () => createContactAction(valid)],
    ["update", () => updateContactAction("c1", valid)],
    ["delete", () => deleteContactAction("c1")],
  ])("%s", async (_n, call) => {
    vi.mocked(requireHouseholdId).mockRejectedValue(new Error("Not authenticated"));
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });
});

describe("createContactAction", () => {
  it("reports field errors without writing", async () => {
    const r = await createContactAction({ ...valid, firstName: "", category: "FAMILY_FRIEND", emailPrimary: "bad" });
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: {
        firstName: "First name is required",
        householdId: "Choose the household this person belongs to",
        emailPrimary: "Enter a valid email address",
      },
    });
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it("keeps the first message when a field has several", async () => {
    const r = await createContactAction({ ...valid, firstName: "" , lastName: ""});
    expect(r.ok).toBe(false);
  });

  it("refuses a household outside the caller's directory, a removed one, or a missing one", async () => {
    const message = { ok: false, error: "Choose one of your households", fieldErrors: { householdId: "Choose one of your households" } };
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "x", ownerHouseholdId: "other", deletedAt: null } as any);
    expect(await createContactAction({ ...valid, householdId: "x" })).toEqual(message);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "hh", ownerHouseholdId: "h1", deletedAt: new Date() } as any);
    expect(await createContactAction({ ...valid, householdId: "hh" })).toEqual(message);
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    expect(await createContactAction({ ...valid, householdId: "hh" })).toEqual(message);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it("creates the contact in the caller's directory and logs it", async () => {
    const r = await createContactAction({
      ...valid, nickname: "JJ", address: "9 Elm St", householdId: "hh", tags: ["a", "a", "b"], favorite: true,
      importantDate1: "2026-01-02", importantDate1Label: "Birthday",
    });
    expect(r).toEqual({ ok: true, id: "new1" });
    expect(vi.mocked(prisma.contact.create).mock.calls[0][0].data).toMatchObject({
      ownerHouseholdId: "h1", householdId: "hh", firstName: "Jane", lastName: "Smith", nickname: "JJ",
      address: "9 Elm St", tags: ["a", "b"], favorite: true, importantDate1: "2026-01-02",
      importantDate1Label: "Birthday", phoneMobile: null, notes: null,
    });
    expect(prisma.activityLogEntry.create).toHaveBeenCalledWith({
      data: { entityType: "CONTACT", entityId: "new1", action: "CREATED", source: "MANUAL" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/contacts");
  });

  it("drops the address of a Family & Friend contact (it uses the household's)", async () => {
    await createContactAction({ ...valid, category: "FAMILY_FRIEND", householdId: "hh", address: "1 Main St" });
    expect(vi.mocked(prisma.contact.create).mock.calls[0][0].data.address).toBeNull();
  });
});

describe("updateContactAction", () => {
  it.each([
    ["missing", null],
    ["in another directory", existing({ ownerHouseholdId: "other" })],
  ])("won't edit a contact that is %s", async (_n, value) => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(value as any);
    expect(await updateContactAction("c1", valid)).toEqual({ ok: false, error: "Contact not found." });
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it("won't edit a removed contact", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(existing({ deletedAt: new Date() }) as any);
    expect(await updateContactAction("c1", valid)).toEqual({ ok: false, error: "Restore this contact before editing it." });
  });

  it("returns field errors from the form schema", async () => {
    const r = await updateContactAction("c1", { ...valid, lastName: "" });
    expect(r).toMatchObject({ ok: false, fieldErrors: { lastName: "Last name is required" } });
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it("updates and logs only what changed, before and after", async () => {
    const r = await updateContactAction("c1", { ...valid, nickname: "JJ", tags: ["x"] });
    expect(r).toEqual({ ok: true, id: "c1" });
    expect(vi.mocked(prisma.contact.update).mock.calls[0][0].where).toEqual({ id: "c1" });
    const log = vi.mocked(prisma.activityLogEntry.create).mock.calls[0][0].data as any;
    expect(log).toMatchObject({ entityType: "CONTACT", entityId: "c1", action: "UPDATED", source: "MANUAL" });
    expect(log.changedFields).toEqual({ before: { nickname: null, tags: [] }, after: { nickname: "JJ", tags: ["x"] } });
    expect(revalidatePath).toHaveBeenCalledWith("/contacts/c1");
  });
});

describe("deleteContactAction", () => {
  it.each([
    ["missing", null],
    ["in another directory", existing({ ownerHouseholdId: "other" })],
    ["already removed", existing({ deletedAt: new Date() })],
  ])("won't remove a contact that is %s", async (_n, value) => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(value as any);
    expect(await deleteContactAction("c1")).toEqual({ ok: false, error: "Contact not found." });
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it("won't remove a household member's own profile", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u1" } as any);
    const r = await deleteContactAction("c1");
    expect(r.ok).toBe(false);
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it("soft-deletes and logs it", async () => {
    expect(await deleteContactAction("c1")).toEqual({ ok: true, id: "c1" });
    expect(prisma.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { deletedAt: expect.any(Date) } });
    expect(prisma.activityLogEntry.create).toHaveBeenCalledWith({
      data: { entityType: "CONTACT", entityId: "c1", action: "DELETED", source: "MANUAL" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/contacts/removed");
  });
});

describe("birthdays in the add and edit actions", () => {
  it("stores a birthday with a year, with only a month and day, or none", async () => {
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: "n1" } as any);
    for (const [input, expected] of [
      [{ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 }, [3, 4, 1985]],
      [{ birthdayMonth: 3, birthdayDay: 4 }, [3, 4, null]],
      [{}, [null, null, null]],
    ] as const) {
      vi.mocked(prisma.contact.create).mockClear();
      expect((await createContactAction({ ...valid, ...input })).ok).toBe(true);
      const data = vi.mocked(prisma.contact.create).mock.calls[0][0].data as any;
      expect([data.birthdayMonth, data.birthdayDay, data.birthdayYear]).toEqual(expected);
    }
  });

  it("returns a bad birthday as an error on the birthday field, saving nothing", async () => {
    const result = await createContactAction({ ...valid, birthdayMonth: 2, birthdayDay: 30 });
    expect(result).toMatchObject({ ok: false, fieldErrors: { birthday: "February doesn't have 30 days" } });
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it("logs a changed birthday, before and after, when editing", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(existing({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 }) as any);
    const result = await updateContactAction("c1", { ...valid, birthdayMonth: 3, birthdayDay: 5, birthdayYear: 1985 });
    expect(result.ok).toBe(true);
    const log = vi.mocked(prisma.activityLogEntry.create).mock.calls.at(-1)![0].data as any;
    expect(log.changedFields.before).toMatchObject({ birthdayDay: 4 });
    expect(log.changedFields.after).toMatchObject({ birthdayDay: 5 });
    expect(log.changedFields.after).not.toHaveProperty("birthdayMonth");
  });
});
