import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    household: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    activityLogEntry: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
    importVersion: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { validateImportAction, applyImportAction } from "@/app/[slug]/(app)/contacts/import/actions";
import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(content: string, name: string) {
  return new File([content], name, { type: "text/csv" });
}

function makeFormData(householdsCSV: string, contactsCSV: string) {
  const fd = new FormData();
  fd.append("householdsFile", makeFile(householdsCSV, "households.csv"));
  fd.append("contactsFile", makeFile(contactsCSV, "contacts.csv"));
  return fd;
}

const EMPTY_HOUSEHOLDS_CSV = `id,*display_name,mailing_address,tags,notes\n`;
const EMPTY_CONTACTS_CSV = `id,household_id,first_name,last_name,*category\n`;

const ONE_SERVICE_CONTACT_CSV = `id,household_id,first_name,last_name,*category\nc1,,Joe,Plumber,SERVICE_PROVIDER\n`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "hh1" } as any);
  vi.mocked(prisma.household.findMany).mockResolvedValue([]);
  vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
});

const dbHousehold = (over: object = {}) =>
  ({
    id: "h1", displayName: "The Smiths", mailingAddress: null, tags: [], notes: null,
    urlSlug: null, passwordHash: null, headOfHousehold: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  }) as any;

const dbContact = (over: object = {}) =>
  ({
    id: "c1", firstName: "Old", lastName: "Contact", category: "SERVICE_PROVIDER", householdId: null,
    nickname: null, address: null, phoneMobile: null, phoneHome: null, phoneWork: null,
    emailPrimary: null, emailSecondary: null, tags: [], favorite: false,
    relationshipNotes: null, linkedFamilyMember: null,
    importantDate1: null, importantDate1Label: null, importantDate2: null, importantDate2Label: null,
    notes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  }) as any;

// ---------------------------------------------------------------------------
// validateImportAction
// ---------------------------------------------------------------------------

describe("validateImportAction", () => {
  it("refuses an unauthenticated caller without reading any data", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    const result = await validateImportAction(makeFormData(EMPTY_HOUSEHOLDS_CSV, EMPTY_CONTACTS_CSV));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ column: "session", message: "Not authenticated." });
    expect(prisma.household.findMany).not.toHaveBeenCalled();
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("returns error when householdsFile is missing", async () => {
    const fd = new FormData();
    fd.append("contactsFile", makeFile(EMPTY_CONTACTS_CSV, "contacts.csv"));
    const result = await validateImportAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].column).toBe("file");
  });

  it("returns error when contactsFile is missing", async () => {
    const fd = new FormData();
    fd.append("householdsFile", makeFile(EMPTY_HOUSEHOLDS_CSV, "households.csv"));
    const result = await validateImportAction(fd);
    expect(result.ok).toBe(false);
  });

  it("returns row-level parse errors and echoes the CSVs back", async () => {
    const badContacts = `id,household_id,first_name,last_name,*category\n,,Jane,Smith,FAMILY_FRIEND\n`;
    const result = await validateImportAction(makeFormData(EMPTY_HOUSEHOLDS_CSV, badContacts));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.contactsCSV).toBe(badContacts);
    }
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("combines household and contact errors", async () => {
    const badHouseholds = `id,*display_name\nh1,\n`;
    const badContacts = `id,household_id,first_name,last_name,*category\n,,,Smith,SERVICE_PROVIDER\n`;
    const result = await validateImportAction(makeFormData(badHouseholds, badContacts));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.column).sort()).toEqual(["displayName", "firstName"]);
  });

  it("returns a successful diff and the CSV text for valid empty files", async () => {
    const result = await validateImportAction(makeFormData(EMPTY_HOUSEHOLDS_CSV, EMPTY_CONTACTS_CSV));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diff.households.added).toHaveLength(0);
      expect(result.diff.contacts.added).toHaveLength(0);
      expect(result.householdsCSV).toBe(EMPTY_HOUSEHOLDS_CSV);
      expect(result.contactsCSV).toBe(EMPTY_CONTACTS_CSV);
      expect(result).not.toHaveProperty("parsedContacts");
    }
  });

  it("detects new contacts as added", async () => {
    const result = await validateImportAction(makeFormData(EMPTY_HOUSEHOLDS_CSV, ONE_SERVICE_CONTACT_CSV));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diff.contacts.added).toHaveLength(1);
      expect(result.diff.contacts.added[0].firstName).toBe("Joe");
    }
  });

  it("detects existing contacts not in the import as removed", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([dbContact()]);
    const result = await validateImportAction(makeFormData(EMPTY_HOUSEHOLDS_CSV, EMPTY_CONTACTS_CSV));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.contacts.removed).toHaveLength(1);
  });

  it("lets contacts reference households that are in households.csv", async () => {
    const households = `id,*display_name\nh1,The Smiths\n`;
    const contacts = `id,household_id,first_name,last_name,*category\n,h1,Sam,Smith,FAMILY_FRIEND\n`;
    const result = await validateImportAction(makeFormData(households, contacts));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyImportAction
// ---------------------------------------------------------------------------

describe("applyImportAction", () => {
  const empty = { householdsCSV: EMPTY_HOUSEHOLDS_CSV, contactsCSV: EMPTY_CONTACTS_CSV };

  function allowTransaction(myId = "hh1") {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: myId } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: myId } as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
    vi.mocked(prisma.household.create).mockResolvedValue({ id: "new-h" } as any);
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: "new-c" } as any);
    vi.mocked(prisma.household.update).mockResolvedValue({} as any);
    vi.mocked(prisma.contact.update).mockResolvedValue({} as any);
    vi.mocked(prisma.activityLogEntry.createMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(prisma.importVersion.create).mockResolvedValue({} as any);
  }

  it("rejects a session for a different household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "other" } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "hh1" } as any);
    const result = await applyImportAction("reynolds-family", empty);
    expect(result).toEqual({ ok: false, error: "Not authenticated." });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an unknown household slug", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    const result = await applyImportAction("nope", empty);
    expect(result.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("re-validates the CSVs and writes nothing when they are invalid", async () => {
    allowTransaction();
    const bad = `id,household_id,first_name,last_name,*category\n,,,,\n`;
    const result = await applyImportAction("reynolds-family", { householdsCSV: EMPTY_HOUSEHOLDS_CSV, contactsCSV: bad });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/\d+ errors?/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("uses the singular for a single error", async () => {
    allowTransaction();
    const bad = `id,*display_name\nh1,\n`;
    const result = await applyImportAction("reynolds-family", { householdsCSV: bad, contactsCSV: EMPTY_CONTACTS_CSV });
    expect(result.error).toContain("1 error.");
  });

  it("commits an empty import with only a version snapshot", async () => {
    allowTransaction();
    const result = await applyImportAction("reynolds-family", empty);
    expect(result).toEqual({ ok: true });
    expect(prisma.activityLogEntry.createMany).not.toHaveBeenCalled();
    expect(prisma.importVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: "hh1",
        summary: {
          households: { added: 0, updated: 0, removed: 0, unchanged: 0 },
          contacts: { added: 0, updated: 0, removed: 0, unchanged: 0 },
        },
      }),
    });
  });

  it("applies adds, updates and removals to households and contacts", async () => {
    allowTransaction("my-hh");
    vi.mocked(prisma.household.findMany).mockResolvedValue([
      dbHousehold({ id: "my-hh", displayName: "Mine", urlSlug: "me", passwordHash: "secret" }),
      dbHousehold({ id: "h-edit", displayName: "Old Name" }),
      dbHousehold({ id: "h-gone", displayName: "Gone Family" }),
    ]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      dbContact({ id: "c-edit", lastName: "Before" }),
      dbContact({ id: "c-gone", firstName: "Gone" }),
    ]);
    const households = [
      "id,*display_name,mailing_address,tags,notes",
      "h-edit,New Name,1 Main St,a;b,hello",
      ",Newbies,,,",
    ].join("\n");
    const contacts = [
      "id,household_id,first_name,last_name,*category,favorite,tags",
      "c-edit,,Old,After,SERVICE_PROVIDER,,",
      ",h-edit,Sam,Smith,FAMILY_FRIEND,true,pal",
    ].join("\n");

    const result = await applyImportAction("me", { householdsCSV: households, contactsCSV: contacts });
    expect(result).toEqual({ ok: true });

    // households
    expect(prisma.household.create).toHaveBeenCalledWith({
      data: { displayName: "Newbies", mailingAddress: undefined, tags: [], notes: undefined },
    });
    expect(prisma.household.update).toHaveBeenCalledWith({
      where: { id: "h-edit" },
      data: { displayName: "New Name", mailingAddress: "1 Main St", tags: ["a", "b"], notes: "hello" },
    });
    expect(prisma.household.update).toHaveBeenCalledWith({
      where: { id: "h-gone" },
      data: { deletedAt: expect.any(Date) },
    });
    // our own household is never soft-deleted and its account fields are never written
    expect(prisma.household.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "my-hh" } }));
    for (const [arg] of vi.mocked(prisma.household.update).mock.calls) {
      expect(arg?.data).not.toHaveProperty("passwordHash");
      expect(arg?.data).not.toHaveProperty("urlSlug");
    }
    // contacts
    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: "h-edit", firstName: "Sam", lastName: "Smith",
        category: "FAMILY_FRIEND", favorite: true, tags: ["pal"],
      }),
    });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: "c-edit" },
      data: expect.objectContaining({ lastName: "After", householdId: null, tags: [], favorite: false }),
    });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: "c-gone" },
      data: { deletedAt: expect.any(Date) },
    });

    // activity log: one entry per change, all from the CSV import
    const entries = vi.mocked(prisma.activityLogEntry.createMany).mock.calls[0]?.[0]?.data as any[];
    expect(entries.map((e) => `${e.entityType}:${e.action}`).sort()).toEqual([
      "CONTACT:CREATED", "CONTACT:DELETED", "CONTACT:UPDATED",
      "HOUSEHOLD:CREATED", "HOUSEHOLD:DELETED", "HOUSEHOLD:UPDATED",
    ]);
    expect(entries.every((e) => e.source === "CSV_IMPORT")).toBe(true);
    const contactUpdate = entries.find((e) => e.entityType === "CONTACT" && e.action === "UPDATED");
    expect(contactUpdate.changedFields.after.lastName).toBe("After");
    expect(contactUpdate.changedFields.before.lastName).toBe("Before");

    // version snapshot
    const version = vi.mocked(prisma.importVersion.create).mock.calls[0]?.[0]?.data as any;
    expect(version.householdId).toBe("my-hh");
    expect(version.summary.households).toMatchObject({ added: 1, updated: 1, removed: 2 });
    expect(version.summary.contacts).toMatchObject({ added: 1, updated: 1, removed: 1 });
    expect(version.contactsSnapshot).toHaveLength(2);
    expect(version.householdsSnapshot).toHaveLength(2);
  });

  it("revalidates the contacts pages after applying", async () => {
    allowTransaction();
    await applyImportAction("reynolds-family", empty);
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts");
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts/households");
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts/removed");
  });
});
