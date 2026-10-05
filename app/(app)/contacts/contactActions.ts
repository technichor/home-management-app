"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { contactIsIn, householdIsIn } from "@/lib/scope";
import { contactFormSchema, type ContactFormInput } from "@/lib/validations";

export type ContactResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type ContactData = Omit<Prisma.ContactUncheckedCreateInput, "ownerHouseholdId">;

// Validate the form and turn it into the row's columns. A chosen household must be one in the
// caller's own directory; a Family & Friend contact has no address of its own (it shows its
// household's).
async function buildContactData(
  householdId: string,
  input: ContactFormInput
): Promise<{ ok: true; data: ContactData } | { ok: false; error: string; fieldErrors: Record<string, string> }> {
  const parsed = contactFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: Object.values(fieldErrors).join(", "), fieldErrors };
  }
  const f = parsed.data;

  if (f.householdId) {
    const household = await prisma.household.findUnique({ where: { id: f.householdId } });
    if (!household || household.deletedAt || !householdIsIn(household, householdId)) {
      const message = "Choose one of your households";
      return { ok: false, error: message, fieldErrors: { householdId: message } };
    }
  }

  return {
    ok: true,
    data: {
      householdId: f.householdId ?? null,
      firstName: f.firstName,
      lastName: f.lastName,
      nickname: f.nickname ?? null,
      category: f.category,
      address: f.category === "FAMILY_FRIEND" ? null : (f.address ?? null),
      phoneMobile: f.phoneMobile ?? null,
      phoneHome: f.phoneHome ?? null,
      phoneWork: f.phoneWork ?? null,
      emailPrimary: f.emailPrimary ?? null,
      emailSecondary: f.emailSecondary ?? null,
      tags: [...new Set(f.tags)],
      favorite: f.favorite,
      relationshipNotes: f.relationshipNotes ?? null,
      linkedFamilyMember: f.linkedFamilyMember ?? null,
      importantDate1: f.importantDate1 ?? null,
      importantDate1Label: f.importantDate1Label ?? null,
      importantDate2: f.importantDate2 ?? null,
      importantDate2Label: f.importantDate2Label ?? null,
      birthdayMonth: f.birthdayMonth,
      birthdayDay: f.birthdayDay,
      birthdayYear: f.birthdayYear,
      notes: f.notes ?? null,
    },
  };
}

function revalidateContacts(id?: string) {
  revalidatePath("/contacts");
  if (id) revalidatePath(`/contacts/${id}`);
}

export async function createContactAction(input: ContactFormInput): Promise<ContactResult> {
  const householdId = await requireHouseholdId();
  const built = await buildContactData(householdId, input);
  if (!built.ok) return built;

  const created = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({ data: { ...built.data, ownerHouseholdId: householdId } });
    await tx.activityLogEntry.create({
      data: { entityType: "CONTACT", entityId: contact.id, action: "CREATED", source: "MANUAL" },
    });
    return contact;
  });
  revalidateContacts();
  return { ok: true, id: created.id };
}

export async function updateContactAction(id: string, input: ContactFormInput): Promise<ContactResult> {
  const householdId = await requireHouseholdId();
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing || !contactIsIn(existing, householdId)) return { ok: false, error: "Contact not found." };
  if (existing.deletedAt) return { ok: false, error: "Restore this contact before editing it." };

  const built = await buildContactData(householdId, input);
  if (!built.ok) return built;

  // Record only what actually changed, before and after.
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(built.data)) {
    const old = (existing as Record<string, unknown>)[key];
    if (JSON.stringify(old) !== JSON.stringify(value)) {
      before[key] = old;
      after[key] = value;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id }, data: built.data });
    await tx.activityLogEntry.create({
      data: {
        entityType: "CONTACT",
        entityId: id,
        action: "UPDATED",
        source: "MANUAL",
        changedFields: { before, after } as unknown as Prisma.InputJsonValue,
      },
    });
  });
  revalidateContacts(id);
  return { ok: true, id };
}

/** Soft delete: the contact moves to Removed, where it can be restored. */
export async function deleteContactAction(id: string): Promise<ContactResult> {
  const householdId = await requireHouseholdId();
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing || !contactIsIn(existing, householdId) || existing.deletedAt) {
    return { ok: false, error: "Contact not found." };
  }
  // A household member's own profile is what their messages are sent as.
  if (await prisma.user.findFirst({ where: { contactId: id }, select: { id: true } })) {
    return { ok: false, error: "This contact is a household member's own profile. Remove the member on the Household page instead." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.activityLogEntry.create({
      data: { entityType: "CONTACT", entityId: id, action: "DELETED", source: "MANUAL" },
    });
  });
  revalidateContacts(id);
  revalidatePath("/contacts/removed");
  return { ok: true, id };
}
