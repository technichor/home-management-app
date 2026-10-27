import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: {
    document: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    documentDismissal: { upsert: vi.fn(), deleteMany: vi.fn() },
    maintenanceItem: { findFirst: vi.fn() },
    accountRecord: { findFirst: vi.fn() },
    contact: { findMany: vi.fn() },
  },
}));

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  createDocumentAction,
  deleteDocumentAction,
  dismissSuggestionAction,
  restoreSuggestionAction,
  updateDocumentAction,
} from "@/app/(app)/documents/actions";

const fields = { title: "Will", typeKey: "will", links: [{ url: "https://drive.test/will" }] };
const members = [{ id: "m1", firstName: "Sam", lastName: "Doe", nickname: null }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.document.findFirst).mockResolvedValue({ id: "d1", householdId: "h1", ownerContactId: null } as any);
  vi.mocked(prisma.document.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.contact.findMany).mockResolvedValue(members as any);
  vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue({ id: "v1", category: "VEHICLE" } as any);
  vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue({ id: "a1" } as any);
});

describe("authentication", () => {
  it.each([
    ["create", () => createDocumentAction(fields)],
    ["update", () => updateDocumentAction("d1", fields)],
    ["delete", () => deleteDocumentAction("d1")],
    ["dismiss", () => dismissSuggestionAction("will", "household")],
    ["restore", () => restoreSuggestionAction("will", "household")],
  ])("%s refuses a caller with no session, touching nothing", async (_n, call) => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(call()).rejects.toThrow("Not authenticated");
    for (const fn of [prisma.document.findFirst, prisma.document.create, prisma.document.update, prisma.document.delete, prisma.documentDismissal.upsert, prisma.documentDismissal.deleteMany])
      expect(fn).not.toHaveBeenCalled();
  });
});

describe("createDocumentAction", () => {
  it("adds a document to the session's household, its category from its type and its links in order", async () => {
    const result = await createDocumentAction({
      ...fields,
      category: "OTHER", // ignored: a Will is Legal & estate
      links: [{ url: " https://drive.test/1 ", label: "Signed" }, { url: "https://drive.test/2" }],
      originalLocation: "Attorney's office",
    });
    expect(result).toEqual({ ok: true, id: "new1" });
    expect(prisma.document.create).toHaveBeenCalledWith({
      data: {
        householdId: "h1", title: "Will", category: "LEGAL", typeKey: "will", ownerContactId: null, maintenanceItemId: null, accountRecordId: null,
        originalLocation: "Attorney's office", notes: null,
        links: { create: [{ url: "https://drive.test/1", label: "Signed", position: 0 }, { url: "https://drive.test/2", label: null, position: 1 }] },
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/documents");
    // Nothing to look up for a household document about nothing else.
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
    expect(prisma.maintenanceItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.accountRecord.findFirst).not.toHaveBeenCalled();
  });

  it("a person's document must be a current member's, looked up in the session's household", async () => {
    expect(await createDocumentAction({ title: "Passport", typeKey: "passport", ownerContactId: "m1", links: fields.links })).toMatchObject({ ok: true });
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]!.where).toMatchObject({ ownerHouseholdId: "h1", householdId: "h1", deletedAt: null });
    expect(await createDocumentAction({ title: "Passport", typeKey: "passport", ownerContactId: "someone-elses", links: fields.links })).toEqual({
      ok: false, error: "Choose one of your household's members",
    });
    expect(prisma.document.create).toHaveBeenCalledTimes(1);
  });

  it("the item and account are looked up only in the session's household", async () => {
    await createDocumentAction({ title: "Loan", typeKey: "vehicle-loan-or-lease", maintenanceItemId: "v1", accountRecordId: "a1", links: fields.links });
    expect(prisma.maintenanceItem.findFirst).toHaveBeenCalledWith({ where: { id: "v1", householdId: "h1" }, select: { category: true } });
    expect(prisma.accountRecord.findFirst).toHaveBeenCalledWith({ where: { id: "a1", householdId: "h1" }, select: { id: true } });
    expect(prisma.document.create).toHaveBeenCalled();
  });

  it("refuses another household's item or account, writing nothing", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(null);
    expect(await createDocumentAction({ ...fields, maintenanceItemId: "theirs" })).toEqual({ ok: false, error: "That item isn't in your Maintenance list" });
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue(null);
    expect(await createDocumentAction({ ...fields, accountRecordId: "theirs" })).toEqual({ ok: false, error: "That account isn't in your Accounts list" });
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it("a vehicle's type must be about a vehicle; any other type can be about any item", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue({ category: "APPLIANCE" } as any);
    expect(await createDocumentAction({ title: "Title", typeKey: "vehicle-title", maintenanceItemId: "dishwasher", links: fields.links })).toEqual({
      ok: false, error: "Choose one of your vehicles",
    });
    expect(await createDocumentAction({ title: "Manual", typeKey: "manual", maintenanceItemId: "dishwasher", links: fields.links })).toMatchObject({ ok: true });
  });

  it("refuses what the form rules don't allow, writing nothing", async () => {
    expect(await createDocumentAction({ ...fields, links: [{ url: "javascript:alert(1)" }] })).toEqual({ ok: false, error: "A link must start with http:// or https://" });
    expect(await createDocumentAction({ ...fields, links: [] })).toEqual({ ok: false, error: "Add a link to where the document is" });
    expect(await createDocumentAction({ title: "Passport", typeKey: "passport", links: fields.links })).toEqual({ ok: false, error: "Choose whose it is" });
    expect(await createDocumentAction({ title: "Notes", links: fields.links })).toEqual({ ok: false, error: "Choose a category" });
    expect(prisma.document.create).not.toHaveBeenCalled();
  });
});

describe("updateDocumentAction", () => {
  it("finds the document only through the session's household, then replaces its fields and links together", async () => {
    expect(await updateDocumentAction("d1", { title: "Notes", category: "OTHER", links: [{ url: "https://x.test", label: "Scan" }] })).toEqual({ ok: true });
    expect(prisma.document.findFirst).toHaveBeenCalledWith({ where: { id: "d1", householdId: "h1" } });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        title: "Notes", category: "OTHER", typeKey: null, ownerContactId: null, maintenanceItemId: null, accountRecordId: null, originalLocation: null, notes: null,
        links: { deleteMany: {}, create: [{ url: "https://x.test", label: "Scan", position: 0 }] },
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/documents/d1");
  });

  it("keeps a member who has since left the household, but won't move it to someone outside it", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue({ id: "d1", householdId: "h1", ownerContactId: "gone" } as any);
    expect(await updateDocumentAction("d1", { title: "Passport", typeKey: "passport", ownerContactId: "gone", links: fields.links })).toEqual({ ok: true });
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
    expect(await updateDocumentAction("d1", { title: "Passport", typeKey: "passport", ownerContactId: "stranger", links: fields.links })).toMatchObject({ ok: false });
    expect(prisma.document.update).toHaveBeenCalledTimes(1);
  });

  it("is 'not found' for another household's document, and checks nothing else", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue(null);
    expect(await updateDocumentAction("theirs", fields)).toEqual({ ok: false, error: "That document isn't in your list any more" });
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it("refuses bad fields and another household's item", async () => {
    expect(await updateDocumentAction("d1", { ...fields, title: " " })).toEqual({ ok: false, error: "Give it a title" });
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(null);
    expect(await updateDocumentAction("d1", { ...fields, maintenanceItemId: "theirs" })).toMatchObject({ ok: false });
    expect(prisma.document.update).not.toHaveBeenCalled();
  });
});

describe("deleteDocumentAction", () => {
  it("deletes the household's document", async () => {
    expect(await deleteDocumentAction("d1")).toEqual({ ok: true });
    expect(prisma.document.findFirst).toHaveBeenCalledWith({ where: { id: "d1", householdId: "h1" } });
    expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
  });
  it("won't delete another household's", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue(null);
    expect(await deleteDocumentAction("theirs")).toMatchObject({ ok: false });
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });
});

describe("dismissSuggestionAction", () => {
  const key = (typeKey: string, subjectKey: string) => ({ householdId_typeKey_subjectKey: { householdId: "h1", typeKey, subjectKey } });

  it("marks a household slot as not applying, once", async () => {
    expect(await dismissSuggestionAction("lease", "household")).toEqual({ ok: true });
    expect(prisma.documentDismissal.upsert).toHaveBeenCalledWith({ where: key("lease", "household"), create: { householdId: "h1", typeKey: "lease", subjectKey: "household" }, update: {} });
    expect(revalidatePath).toHaveBeenCalledWith("/documents");
  });

  it("a person's slot, for a current member of the session's household", async () => {
    expect(await dismissSuggestionAction("drivers-license", "contact:m1")).toEqual({ ok: true });
    expect(prisma.documentDismissal.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: key("drivers-license", "contact:m1") }));
    expect(await dismissSuggestionAction("drivers-license", "contact:stranger")).toEqual({ ok: false, error: "That suggestion isn't one of yours" });
    expect(await dismissSuggestionAction("drivers-license", "household")).toMatchObject({ ok: false });
  });

  it("a vehicle's slot, for one of the session's household's vehicles", async () => {
    expect(await dismissSuggestionAction("vehicle-loan-or-lease", "item:v1")).toEqual({ ok: true });
    expect(prisma.maintenanceItem.findFirst).toHaveBeenCalledWith({ where: { id: "v1", householdId: "h1", category: "VEHICLE" }, select: { id: true } });
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(null);
    expect(await dismissSuggestionAction("vehicle-loan-or-lease", "item:theirs")).toMatchObject({ ok: false });
    expect(await dismissSuggestionAction("vehicle-loan-or-lease", "contact:m1")).toMatchObject({ ok: false });
    expect(prisma.documentDismissal.upsert).toHaveBeenCalledTimes(1);
  });

  it("refuses a type that isn't suggested, or isn't in the catalog", async () => {
    expect(await dismissSuggestionAction("passport-card", "contact:m1")).toEqual({ ok: false, error: "That isn't one of the suggested documents" });
    expect(await dismissSuggestionAction("nonsense", "household")).toMatchObject({ ok: false });
    expect(await dismissSuggestionAction("lease", "item:v1")).toMatchObject({ ok: false });
    expect(prisma.documentDismissal.upsert).not.toHaveBeenCalled();
  });
});

describe("restoreSuggestionAction", () => {
  it("removes the dismissal, only within the session's household", async () => {
    expect(await restoreSuggestionAction("lease", "household")).toEqual({ ok: true });
    expect(prisma.documentDismissal.deleteMany).toHaveBeenCalledWith({ where: { householdId: "h1", typeKey: "lease", subjectKey: "household" } });
    expect(revalidatePath).toHaveBeenCalledWith("/documents");
  });
});
