"use server";

import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import {
  parseHouseholdsCSV,
  parseContactsCSV,
  computeHouseholdDiff,
  computeContactDiff,
  ParsedHousehold,
  ParsedContact,
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
  parsedHouseholds: ParsedHousehold[];
  parsedContacts: ParsedContact[];
  householdsCSV: string;
  contactsCSV: string;
}

export type ValidateImportResult = ValidateResult | ValidateSuccess;

export async function validateImportAction(
  formData: FormData
): Promise<ValidateImportResult> {
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

  // Parse households first so we can build the set of IDs for referential integrity check.
  const { households: parsedHouseholds, errors: householdErrors } =
    parseHouseholdsCSV(householdsCSV);

  const knownHouseholdIds = new Set(
    parsedHouseholds.filter((h) => h.id).map((h) => h.id!)
  );

  const { contacts: parsedContacts, errors: contactErrors } =
    parseContactsCSV(contactsCSV, knownHouseholdIds);

  const allErrors = [...householdErrors, ...contactErrors];
  if (allErrors.length > 0) {
    return { ok: false, errors: allErrors, householdsCSV, contactsCSV };
  }

  // Load current state from DB
  const [existingHouseholds, existingContacts] = await Promise.all([
    prisma.household.findMany({ where: { deletedAt: null } }),
    prisma.contact.findMany({ where: { deletedAt: null } }),
  ]);

  const householdDiff = computeHouseholdDiff(
    parsedHouseholds,
    existingHouseholds,
    existingContacts
  );
  const contactDiff = computeContactDiff(parsedContacts, existingContacts);

  return {
    ok: true,
    diff: { households: householdDiff, contacts: contactDiff },
    parsedHouseholds,
    parsedContacts,
    householdsCSV,
    contactsCSV,
  };
}

export interface ApplyImportInput {
  parsedHouseholds: ParsedHousehold[];
  parsedContacts: ParsedContact[];
  householdsCSV: string;
  contactsCSV: string;
}

export async function applyImportAction(
  slug: string,
  input: ApplyImportInput
): Promise<{ ok: boolean; error?: string }> {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  const myHousehold = await prisma.household.findUnique({
    where: { urlSlug: slug },
    select: { id: true },
  });

  if (!myHousehold || session.householdId !== myHousehold.id) {
    return { ok: false, error: "Not authenticated." };
  }

  const myHouseholdId = myHousehold.id;

  const { parsedHouseholds, parsedContacts, householdsCSV, contactsCSV } =
    input;

  // Reload current state so the apply is based on reality at commit time.
  const [existingHouseholds, existingContacts] = await Promise.all([
    prisma.household.findMany({ where: { deletedAt: null } }),
    prisma.contact.findMany({ where: { deletedAt: null } }),
  ]);

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
          displayName: h.displayName,
          mailingAddress: h.mailingAddress,
          tags: h.tags ?? [],
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
      if (!after.id) continue;
      // Never overwrite account fields — only update data fields.
      await tx.household.update({
        where: { id: after.id },
        data: {
          displayName: after.displayName,
          mailingAddress: after.mailingAddress ?? null,
          tags: after.tags ?? [],
          notes: after.notes ?? null,
        },
      });
      activityEntries.push({
        entityType: "HOUSEHOLD",
        entityId: after.id,
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
          tags: c.tags ?? [],
          favorite: c.favorite ?? false,
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
      if (!after.id) continue;
      await tx.contact.update({
        where: { id: after.id },
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
          tags: after.tags ?? [],
          favorite: after.favorite ?? false,
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
        entityId: after.id,
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

  revalidatePath(`/${slug}/contacts`);
  revalidatePath(`/${slug}/households`);
  revalidatePath(`/${slug}/removed`);

  return { ok: true };
}
