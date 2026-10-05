import Papa from "papaparse";
import { contactSchema, householdSchema, ContactInput, HouseholdInput } from "./validations";
import { Contact, Household } from "@prisma/client";
import { birthdayToCell, birthdayWouldChange, parseBirthdayCell } from "./birthday";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

// Leading * marks required columns (visual hint in the template).
export const HOUSEHOLD_COLUMNS = [
  "id",
  "*display_name",
  "mailing_address",
  "tags",
  "notes",
] as const;

export const CONTACT_COLUMNS = [
  "id",
  "household_id",
  "first_name",
  "last_name",
  "nickname",
  "*category",
  "address",
  "phone_mobile",
  "phone_home",
  "phone_work",
  "email_primary",
  "email_secondary",
  "tags",
  "favorite",
  "relationship_notes",
  "linked_family_member",
  "birthday",
  "important_date_1",
  "important_date_1_label",
  "important_date_2",
  "important_date_2_label",
  "notes",
] as const;

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

export function householdsToCSV(
  households: Pick<
    Household,
    "id" | "displayName" | "mailingAddress" | "tags" | "notes"
  >[]
): string {
  const rows = households.map((h) => ({
    id: h.id,
    "*display_name": h.displayName,
    mailing_address: h.mailingAddress ?? "",
    tags: h.tags.join(";"),
    notes: h.notes ?? "",
  }));
  return Papa.unparse(rows, { columns: [...HOUSEHOLD_COLUMNS] });
}

export function contactsToCSV(
  contacts: Pick<
    Contact,
    | "id"
    | "householdId"
    | "firstName"
    | "lastName"
    | "nickname"
    | "category"
    | "address"
    | "phoneMobile"
    | "phoneHome"
    | "phoneWork"
    | "emailPrimary"
    | "emailSecondary"
    | "tags"
    | "favorite"
    | "relationshipNotes"
    | "linkedFamilyMember"
    | "birthdayMonth"
    | "birthdayDay"
    | "birthdayYear"
    | "importantDate1"
    | "importantDate1Label"
    | "importantDate2"
    | "importantDate2Label"
    | "notes"
  >[]
): string {
  const rows = contacts.map((c) => ({
    id: c.id,
    household_id: c.householdId ?? "",
    first_name: c.firstName,
    last_name: c.lastName,
    nickname: c.nickname ?? "",
    "*category": c.category,
    address: c.address ?? "",
    phone_mobile: c.phoneMobile ?? "",
    phone_home: c.phoneHome ?? "",
    phone_work: c.phoneWork ?? "",
    email_primary: c.emailPrimary ?? "",
    email_secondary: c.emailSecondary ?? "",
    tags: c.tags.join(";"),
    favorite: c.favorite ? "true" : "false",
    relationship_notes: c.relationshipNotes ?? "",
    linked_family_member: c.linkedFamilyMember ?? "",
    birthday: birthdayToCell(c),
    important_date_1: c.importantDate1 ?? "",
    important_date_1_label: c.importantDate1Label ?? "",
    important_date_2: c.importantDate2 ?? "",
    important_date_2_label: c.importantDate2Label ?? "",
    notes: c.notes ?? "",
  }));
  return Papa.unparse(rows, { columns: [...CONTACT_COLUMNS] });
}

// ---------------------------------------------------------------------------
// Parse and validate
// ---------------------------------------------------------------------------

export interface ParseError {
  row: number;
  column: string;
  message: string;
}

export interface ParsedHousehold extends HouseholdInput {
  id?: string;
}

export interface ParsedContact extends ContactInput {
  id?: string;
}

function parseTagsField(raw: string): string[] {
  return raw
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseHouseholdsCSV(csvText: string): {
  households: ParsedHousehold[];
  errors: ParseError[];
} {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const households: ParsedHousehold[] = [];
  const errors: ParseError[] = [];

  result.data.forEach((row, i) => {
    const rowNum = i + 2; // 1-indexed, +1 for header
    const raw: HouseholdInput & { id?: string } = {
      id: row["id"]?.trim() || undefined,
      displayName: (row["*display_name"] ?? row["display_name"] ?? "").trim(),
      mailingAddress: row["mailing_address"]?.trim() || undefined,
      tags: parseTagsField(row["tags"] ?? ""),
      notes: row["notes"]?.trim() || undefined,
    };

    const parsed = householdSchema.safeParse(raw);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        errors.push({
          row: rowNum,
          column: String(issue.path[0]),
          message: issue.message,
        });
      });
    } else {
      households.push({ ...parsed.data, id: raw.id });
    }
  });

  return { households, errors };
}

export function parseContactsCSV(
  csvText: string,
  knownHouseholdIds: Set<string>
): {
  contacts: ParsedContact[];
  errors: ParseError[];
} {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const contacts: ParsedContact[] = [];
  const errors: ParseError[] = [];

  // An export made before birthdays existed has no birthday column. That means "leave birthdays alone", which is
  // different from a blank cell under the column, which means "clear it".
  const hasBirthdayColumn = result.meta.fields!.includes("birthday");

  result.data.forEach((row, i) => {
    const rowNum = i + 2;

    let birthday: Pick<ContactInput, "birthdayMonth" | "birthdayDay" | "birthdayYear"> = {};
    let birthdayInvalid = false;
    if (hasBirthdayColumn) {
      const cell = parseBirthdayCell(row["birthday"] ?? "");
      if (cell.ok) {
        birthday = {
          birthdayMonth: cell.value?.month ?? null,
          birthdayDay: cell.value?.day ?? null,
          birthdayYear: cell.value?.year ?? null,
        };
      } else {
        birthdayInvalid = true;
        errors.push({ row: rowNum, column: "birthday", message: cell.error });
      }
    }

    const categoryRaw = (row["*category"] ?? row["category"] ?? "").trim();
    const householdIdRaw = row["household_id"]?.trim() || undefined;

    const raw: ContactInput & { id?: string } = {
      id: row["id"]?.trim() || undefined,
      householdId: householdIdRaw || undefined,
      firstName: (row["first_name"] ?? "").trim(),
      lastName: (row["last_name"] ?? "").trim(),
      nickname: row["nickname"]?.trim() || undefined,
      category: categoryRaw as ContactInput["category"],
      address: row["address"]?.trim() || undefined,
      phoneMobile: row["phone_mobile"]?.trim() || undefined,
      phoneHome: row["phone_home"]?.trim() || undefined,
      phoneWork: row["phone_work"]?.trim() || undefined,
      emailPrimary: row["email_primary"]?.trim() || undefined,
      emailSecondary: row["email_secondary"]?.trim() || undefined,
      tags: parseTagsField(row["tags"] ?? ""),
      favorite: row["favorite"]?.trim().toLowerCase() === "true",
      relationshipNotes: row["relationship_notes"]?.trim() || undefined,
      linkedFamilyMember: row["linked_family_member"]?.trim() || undefined,
      importantDate1: row["important_date_1"]?.trim() || undefined,
      importantDate1Label: row["important_date_1_label"]?.trim() || undefined,
      importantDate2: row["important_date_2"]?.trim() || undefined,
      importantDate2Label: row["important_date_2_label"]?.trim() || undefined,
      ...birthday,
      notes: row["notes"]?.trim() || undefined,
    };

    const parsed = contactSchema.safeParse(raw);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        errors.push({
          row: rowNum,
          column: String(issue.path[0]),
          message: issue.message,
        });
      });
      return;
    }
    if (birthdayInvalid) return;

    // Referential integrity: household_id in contacts must exist in households.csv
    if (parsed.data.householdId && !knownHouseholdIds.has(parsed.data.householdId)) {
      errors.push({
        row: rowNum,
        column: "household_id",
        message: `household_id "${parsed.data.householdId}" does not exist in households.csv`,
      });
      return;
    }

    contacts.push({ ...parsed.data, id: raw.id });
  });

  return { contacts, errors };
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

export interface HouseholdDiff {
  added: ParsedHousehold[];
  updated: Array<{ before: ParsedHousehold; after: ParsedHousehold }>;
  removed: Array<{
    id: string;
    displayName: string;
    hasFamilyFriendContacts: boolean;
  }>;
  unchanged: number;
}

export interface ContactDiff {
  added: ParsedContact[];
  updated: Array<{ before: ParsedContact; after: ParsedContact }>;
  removed: Array<{ id: string; name: string }>;
  unchanged: number;
}

export interface ImportDiff {
  households: HouseholdDiff;
  contacts: ContactDiff;
}

export function computeHouseholdDiff(
  incoming: ParsedHousehold[],
  existing: Household[],
  existingContacts: Contact[]
): HouseholdDiff {
  const incomingById = new Map(
    incoming.filter((h) => h.id).map((h) => [h.id!, h])
  );
  const existingById = new Map(existing.map((h) => [h.id, h]));

  const added: ParsedHousehold[] = [];
  const updated: HouseholdDiff["updated"] = [];
  const removed: HouseholdDiff["removed"] = [];
  let unchanged = 0;

  // New records (no id, or id not in DB)
  for (const h of incoming) {
    if (!h.id || !existingById.has(h.id)) {
      added.push(h);
    }
  }

  // Updated or unchanged
  for (const [id, existingH] of existingById) {
    if (existingH.deletedAt) continue; // already soft-deleted
    const incomingH = incomingById.get(id);
    if (!incomingH) {
      // In DB but not in import → will be soft-deleted
      const hasFamilyFriendContacts = existingContacts.some(
        (c) => c.householdId === id && c.category === "FAMILY_FRIEND" && !c.deletedAt
      );
      removed.push({
        id,
        displayName: existingH.displayName,
        hasFamilyFriendContacts,
      });
    } else {
      // Compare fields
      const changed =
        existingH.displayName !== incomingH.displayName ||
        (existingH.mailingAddress ?? "") !== (incomingH.mailingAddress ?? "") ||
        existingH.tags.join(";") !== incomingH.tags.join(";") ||
        (existingH.notes ?? "") !== (incomingH.notes ?? "");
      if (changed) {
        updated.push({
          before: {
            id: existingH.id,
            displayName: existingH.displayName,
            mailingAddress: existingH.mailingAddress ?? undefined,
            tags: existingH.tags,
            notes: existingH.notes ?? undefined,
          },
          after: incomingH,
        });
      } else {
        unchanged++;
      }
    }
  }

  return { added, updated, removed, unchanged };
}

export function computeContactDiff(
  incoming: ParsedContact[],
  existing: Contact[]
): ContactDiff {
  const incomingById = new Map(
    incoming.filter((c) => c.id).map((c) => [c.id!, c])
  );
  const existingById = new Map(existing.map((c) => [c.id, c]));

  const added: ParsedContact[] = [];
  const updated: ContactDiff["updated"] = [];
  const removed: ContactDiff["removed"] = [];
  let unchanged = 0;

  for (const c of incoming) {
    if (!c.id || !existingById.has(c.id)) {
      added.push(c);
    }
  }

  for (const [id, existingC] of existingById) {
    if (existingC.deletedAt) continue;
    const incomingC = incomingById.get(id);
    if (!incomingC) {
      removed.push({
        id,
        name: `${existingC.firstName} ${existingC.lastName}`,
      });
    } else {
      const changed =
        existingC.firstName !== incomingC.firstName ||
        existingC.lastName !== incomingC.lastName ||
        existingC.category !== incomingC.category ||
        (existingC.householdId ?? "") !== (incomingC.householdId ?? "") ||
        (existingC.nickname ?? "") !== (incomingC.nickname ?? "") ||
        (existingC.address ?? "") !== (incomingC.address ?? "") ||
        (existingC.phoneMobile ?? "") !== (incomingC.phoneMobile ?? "") ||
        (existingC.phoneHome ?? "") !== (incomingC.phoneHome ?? "") ||
        (existingC.phoneWork ?? "") !== (incomingC.phoneWork ?? "") ||
        (existingC.emailPrimary ?? "") !== (incomingC.emailPrimary ?? "") ||
        (existingC.emailSecondary ?? "") !== (incomingC.emailSecondary ?? "") ||
        existingC.tags.join(";") !== incomingC.tags.join(";") ||
        existingC.favorite !== incomingC.favorite ||
        (existingC.notes ?? "") !== (incomingC.notes ?? "") ||
        birthdayWouldChange(existingC, incomingC);
      if (changed) {
        updated.push({
          before: {
            id: existingC.id,
            householdId: existingC.householdId ?? undefined,
            firstName: existingC.firstName,
            lastName: existingC.lastName,
            nickname: existingC.nickname ?? undefined,
            category: existingC.category,
            address: existingC.address ?? undefined,
            phoneMobile: existingC.phoneMobile ?? undefined,
            phoneHome: existingC.phoneHome ?? undefined,
            phoneWork: existingC.phoneWork ?? undefined,
            emailPrimary: existingC.emailPrimary ?? undefined,
            emailSecondary: existingC.emailSecondary ?? undefined,
            tags: existingC.tags,
            favorite: existingC.favorite,
            relationshipNotes: existingC.relationshipNotes ?? undefined,
            linkedFamilyMember: existingC.linkedFamilyMember ?? undefined,
            birthdayMonth: existingC.birthdayMonth,
            birthdayDay: existingC.birthdayDay,
            birthdayYear: existingC.birthdayYear,
            importantDate1: existingC.importantDate1 ?? undefined,
            importantDate1Label: existingC.importantDate1Label ?? undefined,
            importantDate2: existingC.importantDate2 ?? undefined,
            importantDate2Label: existingC.importantDate2Label ?? undefined,
            notes: existingC.notes ?? undefined,
          },
          after: incomingC,
        });
      } else {
        unchanged++;
      }
    }
  }

  return { added, updated, removed, unchanged };
}
