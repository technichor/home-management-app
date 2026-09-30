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

const ONE_HOUSEHOLD_CSV = `id,*display_name,mailing_address,tags,notes\nhh1,The Smiths,,, \n`;
const ONE_SERVICE_CONTACT_CSV = `id,household_id,first_name,last_name,*category\nc1,,Joe,Plumber,SERVICE_PROVIDER\n`;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// validateImportAction
// ---------------------------------------------------------------------------

describe("validateImportAction", () => {
  it("returns error when householdsFile is missing", async () => {
    const fd = new FormData();
    fd.append("contactsFile", makeFile(EMPTY_CONTACTS_CSV, "contacts.csv"));
    const result = await validateImportAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].column).toBe("file");
    }
  });

  it("returns error when contactsFile is missing", async () => {
    const fd = new FormData();
    fd.append("householdsFile", makeFile(EMPTY_HOUSEHOLDS_CSV, "households.csv"));
    const result = await validateImportAction(fd);
    expect(result.ok).toBe(false);
  });

  it("returns parse errors for invalid CSV data", async () => {
    const badContacts = `id,household_id,first_name,last_name,*category\n,,Jane,Smith,FAMILY_FRIEND\n`;
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    const fd = makeFormData(EMPTY_HOUSEHOLDS_CSV, badContacts);
    const result = await validateImportAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("returns successful diff for valid empty CSVs", async () => {
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    const fd = makeFormData(EMPTY_HOUSEHOLDS_CSV, EMPTY_CONTACTS_CSV);
    const result = await validateImportAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diff.households.added).toHaveLength(0);
      expect(result.diff.contacts.added).toHaveLength(0);
    }
  });

  it("detects new contacts as added in diff", async () => {
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    const fd = makeFormData(EMPTY_HOUSEHOLDS_CSV, ONE_SERVICE_CONTACT_CSV);
    const result = await validateImportAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diff.contacts.added).toHaveLength(1);
      expect(result.diff.contacts.added[0].firstName).toBe("Joe");
    }
  });

  it("detects existing contacts not in import as removed", async () => {
    const existingContact = {
      id: "old-c",
      firstName: "Old",
      lastName: "Contact",
      category: "SERVICE_PROVIDER",
      householdId: null,
      nickname: null, address: null, phoneMobile: null, phoneHome: null, phoneWork: null,
      emailPrimary: null, emailSecondary: null, tags: [], favorite: false,
      relationshipNotes: null, linkedFamilyMember: null,
      importantDate1: null, importantDate1Label: null,
      importantDate2: null, importantDate2Label: null,
      notes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    } as any;
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([existingContact]);
    const fd = makeFormData(EMPTY_HOUSEHOLDS_CSV, EMPTY_CONTACTS_CSV);
    const result = await validateImportAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diff.contacts.removed).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// applyImportAction
// ---------------------------------------------------------------------------

describe("applyImportAction", () => {
  function setupAuthMock(householdId = "hh1") {
    vi.mocked(getIronSession).mockResolvedValue({ householdId } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: householdId } as any);
  }

  it("returns error when not authenticated (session mismatch)", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "other" } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: "hh1" } as any);

    const result = await applyImportAction("reynolds-family", {
      parsedHouseholds: [],
      parsedContacts: [],
      householdsCSV: "",
      contactsCSV: "",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/authenticated/i);
  });

  it("returns error when household not found", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "hh1" } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);

    const result = await applyImportAction("reynolds-family", {
      parsedHouseholds: [],
      parsedContacts: [],
      householdsCSV: "",
      contactsCSV: "",
    });
    expect(result.ok).toBe(false);
  });

  it("runs transaction and returns ok:true on success", async () => {
    setupAuthMock();
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
    vi.mocked(prisma.activityLogEntry.createMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(prisma.importVersion.create).mockResolvedValue({} as any);

    const result = await applyImportAction("reynolds-family", {
      parsedHouseholds: [],
      parsedContacts: [],
      householdsCSV: "",
      contactsCSV: "",
    });
    expect(result.ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.importVersion.create).toHaveBeenCalled();
  });

  it("creates contact records for added contacts", async () => {
    setupAuthMock();
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: "new-c" } as any);
    vi.mocked(prisma.activityLogEntry.createMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.importVersion.create).mockResolvedValue({} as any);

    const result = await applyImportAction("reynolds-family", {
      parsedHouseholds: [],
      parsedContacts: [
        { firstName: "Joe", lastName: "Plumber", category: "SERVICE_PROVIDER", tags: [], favorite: false },
      ],
      householdsCSV: "",
      contactsCSV: "",
    });
    expect(result.ok).toBe(true);
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ firstName: "Joe", lastName: "Plumber" }),
      })
    );
  });

  it("soft-deletes contacts not in import (removed from CSV)", async () => {
    setupAuthMock();
    const existingContact = {
      id: "old-c", firstName: "Old", lastName: "Contact",
      category: "SERVICE_PROVIDER", householdId: null,
      nickname: null, address: null, phoneMobile: null, phoneHome: null, phoneWork: null,
      emailPrimary: null, emailSecondary: null, tags: [], favorite: false,
      relationshipNotes: null, linkedFamilyMember: null,
      importantDate1: null, importantDate1Label: null,
      importantDate2: null, importantDate2Label: null,
      notes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    } as any;
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([existingContact]);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
    vi.mocked(prisma.contact.update).mockResolvedValue({} as any);
    vi.mocked(prisma.activityLogEntry.createMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.importVersion.create).mockResolvedValue({} as any);

    await applyImportAction("reynolds-family", {
      parsedHouseholds: [],
      parsedContacts: [],
      householdsCSV: "",
      contactsCSV: "",
    });
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "old-c" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });

  it("never soft-deletes the authenticated household", async () => {
    setupAuthMock("my-hh");
    const myHousehold = {
      id: "my-hh", displayName: "My Household", mailingAddress: null,
      tags: [], notes: null, urlSlug: "me", passwordHash: "hash",
      headOfHousehold: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    } as any;
    vi.mocked(prisma.household.findMany).mockResolvedValue([myHousehold]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
    vi.mocked(prisma.activityLogEntry.createMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(prisma.importVersion.create).mockResolvedValue({} as any);

    // Import with no households — "my-hh" would normally be soft-deleted but shouldn't be.
    await applyImportAction("me", {
      parsedHouseholds: [],
      parsedContacts: [],
      householdsCSV: "",
      contactsCSV: "",
    });
    expect(prisma.household.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "my-hh" } })
    );
  });

  it("revalidates contacts paths after apply", async () => {
    setupAuthMock();
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
    vi.mocked(prisma.activityLogEntry.createMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(prisma.importVersion.create).mockResolvedValue({} as any);

    await applyImportAction("reynolds-family", {
      parsedHouseholds: [],
      parsedContacts: [],
      householdsCSV: "",
      contactsCSV: "",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts");
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts/households");
    expect(revalidatePath).toHaveBeenCalledWith("/reynolds-family/contacts/removed");
  });
});
