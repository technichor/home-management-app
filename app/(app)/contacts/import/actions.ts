"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getHouseholdId } from "@/lib/auth";
import { contactsOf, householdsOf } from "@/lib/scope";
import {
  parseHouseholdsCSV,
  parseContactsCSV,
  computeHouseholdDiff,
  computeContactDiff,
  ParseError,
  ImportDiff,
} from "@/lib/csv";
import { Prisma } from "@prisma/client";

export interface ValidateResult {
  ok: false;
  errors: ParseError[];
  householdsCSV?: string;
  contactsCSV?: string;
}

export interface ValidateSuccess {
  ok: true;
  diff: ImportDiff;
  householdsCSV: string;
  contactsCSV: string;
}

export type ValidateImportResult = ValidateResult | ValidateSuccess;

// Parse both files together; contacts are checked against the household ids in households.csv.
// Only ids of households in the caller's own directory count: an id from anywhere else is
// treated as unknown, so a file can never point a contact at another household's records.
function parseImportFiles(householdsCSV: string, contactsCSV: string, ownHouseholdIds: Set<string>) {
  const { households: parsedHouseholds, errors: householdErrors } =
    parseHouseholdsCSV(householdsCSV);

  const knownHouseholdIds = new Set(
    parsedHouseholds.filter((h) => h.id && ownHouseholdIds.has(h.id)).map((h) => h.id!)
  );

  const { contacts: parsedContacts, errors: contactErrors } =
    parseContactsCSV(contactsCSV, knownHouseholdIds);

  return {
    parsedHouseholds,
    parsedContacts,
    errors: [...householdErrors, ...contactErrors],
  };
}

export async function validateImportAction(
  formData: FormData
): Promise<ValidateImportResult> {
  const householdId = await getHouseholdId();
  if (!householdId) {
    return {
      ok: false,
      errors: [{ row: 0, column: "session", message: "Not authenticated." }],
    };
  }

  const householdsFile = formData.get("householdsFile") as File | null;
  const contactsFile = formData.get("contactsFile") as File | null;

  if (!householdsFile || !contactsFile) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          column: "file",
          message: "Both households.csv and contacts.csv are required.",
        },
      ],
    };
  }

  const [householdsCSV, contactsCSV] = await Promise.all([
    householdsFile.text(),
    contactsFile.text(),
  ]);

  // Load current state from DB: only this household's own directory is ever compared or changed.
  const [existingHouseholds, existingContacts] = await Promise.all([
    prisma.household.findMany({ where: { ...householdsOf(householdId), deletedAt: null } }),
    prisma.contact.findMany({ where: { ...contactsOf(householdId), deletedAt: null } }),
  ]);

  const { parsedHouseholds, parsedContacts, errors } = parseImportFiles(
    householdsCSV,
    contactsCSV,
    new Set(existingHouseholds.map((h) => h.id))
  );
  if (errors.length > 0) {
    return { ok: false, errors, householdsCSV, contactsCSV };
  }

  const householdDiff = computeHouseholdDiff(
    parsedHouseholds,
    existingHouseholds,
    existingContacts
  );
  const contactDiff = computeContactDiff(parsedContacts, existingContacts);

  return {
    ok: true,
    diff: { households: householdDiff, contacts: contactDiff },
    householdsCSV,
    contactsCSV,
  };
}

// Only the raw CSV text crosses the wire; it is re-parsed and re-validated here so the
// database is never written from client-supplied parsed objects.
export interface ApplyImportInput {
  householdsCSV: string;
  contactsCSV: string;
}

export async function applyImportAction(
  input: ApplyImportInput
): Promise<{ ok: boolean; error?: string }> {
  const myHouseholdId = await getHouseholdId();
  if (!myHouseholdId) {
    return { ok: false, error: "Not authenticated." };
  }

  // Reload current state so the apply is based on reality at commit time.
  const [existingHouseholds, existingContacts] = await Promise.all([
    prisma.household.findMany({ where: { ...householdsOf(myHouseholdId), deletedAt: null } }),
    prisma.contact.findMany({ where: { ...contactsOf(myHouseholdId), deletedAt: null } }),
  ]);

  const { parsedHouseholds, parsedContacts, errors } = parseImportFiles(
    input.householdsCSV,
    input.contactsCSV,
    new Set(existingHouseholds.map((h) => h.id))
  );
  if (errors.length > 0) {
    return {
      ok: false,
      error: `The files have ${errors.length} error${errors.length > 1 ? "s" : ""}. Upload them again to see the details.`,
    };
  }

  const householdDiff = computeHouseholdDiff(
    parsedHouseholds,
    existingHouseholds,
    existingContacts
  );
  const contactDiff = computeContactDiff(parsedContacts, existingContacts);

  const now = new Date();
  const activityEntries: Prisma.ActivityLogEntryCreateManyInput[] = [];

  await prisma.$transaction(async (tx) => {
    // ---- Households ----
    for (const h of householdDiff.added) {
      const created = await tx.household.create({
        data: {
          ownerHouseholdId: myHouseholdId,
          displayName: h.displayName,
          mailingAddress: h.mailingAddress,
          tags: h.tags,
          notes: h.notes,
        },
      });
      activityEntries.push({
        entityType: "HOUSEHOLD",
        entityId: created.id,
        action: "CREATED",
        source: "CSV_IMPORT",
        timestamp: now,
      });
    }

    for (const { after } of householdDiff.updated) {
      // Never overwrite account fields — only update data fields.
      await tx.household.update({
        where: { id: after.id as string },
        data: {
          displayName: after.displayName,
          mailingAddress: after.mailingAddress ?? null,
          tags: after.tags,
          notes: after.notes ?? null,
        },
      });
      activityEntries.push({
        entityType: "HOUSEHOLD",
        entityId: after.id as string,
        action: "UPDATED",
        source: "CSV_IMPORT",
        timestamp: now,
      });
    }

    for (const removed of householdDiff.removed) {
      // Protect our own household from being soft-deleted via import.
      if (removed.id === myHouseholdId) continue;
      await tx.household.update({
        where: { id: removed.id },
        data: { deletedAt: now },
      });
      activityEntries.push({
        entityType: "HOUSEHOLD",
        entityId: removed.id,
        action: "DELETED",
        source: "CSV_IMPORT",
        timestamp: now,
      });
    }

    // ---- Contacts ----
    for (const c of contactDiff.added) {
      const created = await tx.contact.create({
        data: {
          ownerHouseholdId: myHouseholdId,
          householdId: c.householdId,
          firstName: c.firstName,
          lastName: c.lastName,
          nickname: c.nickname,
          category: c.category,
          address: c.address,
          phoneMobile: c.phoneMobile,
          phoneHome: c.phoneHome,
          phoneWork: c.phoneWork,
          emailPrimary: c.emailPrimary,
          emailSecondary: c.emailSecondary,
          tags: c.tags,
          favorite: c.favorite,
          relationshipNotes: c.relationshipNotes,
          linkedFamilyMember: c.linkedFamilyMember,
          importantDate1: c.importantDate1,
          importantDate1Label: c.importantDate1Label,
          importantDate2: c.importantDate2,
          importantDate2Label: c.importantDate2Label,
          notes: c.notes,
        },
      });
      activityEntries.push({
        entityType: "CONTACT",
        entityId: created.id,
        action: "CREATED",
        source: "CSV_IMPORT",
        timestamp: now,
      });
    }

    for (const { before, after } of contactDiff.updated) {
      await tx.contact.update({
        where: { id: after.id as string },
        data: {
          householdId: after.householdId ?? null,
          firstName: after.firstName,
          lastName: after.lastName,
          nickname: after.nickname ?? null,
          category: after.category,
          address: after.address ?? null,
          phoneMobile: after.phoneMobile ?? null,
          phoneHome: after.phoneHome ?? null,
          phoneWork: after.phoneWork ?? null,
          emailPrimary: after.emailPrimary ?? null,
          emailSecondary: after.emailSecondary ?? null,
          tags: after.tags,
          favorite: after.favorite,
          relationshipNotes: after.relationshipNotes ?? null,
          linkedFamilyMember: after.linkedFamilyMember ?? null,
          importantDate1: after.importantDate1 ?? null,
          importantDate1Label: after.importantDate1Label ?? null,
          importantDate2: after.importantDate2 ?? null,
          importantDate2Label: after.importantDate2Label ?? null,
          notes: after.notes ?? null,
        },
      });
      activityEntries.push({
        entityType: "CONTACT",
        entityId: after.id as string,
        action: "UPDATED",
        source: "CSV_IMPORT",
        changedFields: { before, after } as unknown as Prisma.InputJsonValue,
        timestamp: now,
      });
    }

    for (const removed of contactDiff.removed) {
      await tx.contact.update({
        where: { id: removed.id },
        data: { deletedAt: now },
      });
      activityEntries.push({
        entityType: "CONTACT",
        entityId: removed.id,
        action: "DELETED",
        source: "CSV_IMPORT",
        timestamp: now,
      });
    }

    // ---- Activity log ----
    if (activityEntries.length > 0) {
      await tx.activityLogEntry.createMany({ data: activityEntries });
    }

    // ---- ImportVersion snapshot ----
    await tx.importVersion.create({
      data: {
        householdId: myHouseholdId,
        summary: {
          households: {
            added: householdDiff.added.length,
            updated: householdDiff.updated.length,
            removed: householdDiff.removed.length,
            unchanged: householdDiff.unchanged,
          },
          contacts: {
            added: contactDiff.added.length,
            updated: contactDiff.updated.length,
            removed: contactDiff.removed.length,
            unchanged: contactDiff.unchanged,
          },
        },
        contactsSnapshot: parsedContacts as unknown as Prisma.InputJsonValue,
        householdsSnapshot: parsedHouseholds as unknown as Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath("/contacts");
  revalidatePath("/contacts/households");
  revalidatePath("/contacts/removed");

  return { ok: true };
}
