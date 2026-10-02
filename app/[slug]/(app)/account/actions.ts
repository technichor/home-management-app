"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { personNameSchema } from "@/lib/validations";
import { requireHouseholdId } from "@/lib/auth";

/** Make an existing member of this household the contact the account acts as. */
export async function linkAccountContactAction(slug: string, contactId: string) {
  const householdId = await requireHouseholdId();
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (
    !contact ||
    contact.deletedAt ||
    contact.householdId !== householdId ||
    contact.category !== "FAMILY_FRIEND"
  ) {
    throw new Error("Choose a Family & Friend contact from your own household");
  }
  await prisma.household.update({ where: { id: householdId }, data: { accountContactId: contactId } });
  revalidatePath(`/${slug}/account`);
}

/** Create a new member of this household and make it the contact the account acts as. */
export async function createAccountContactAction(slug: string, firstName: string, lastName: string) {
  const householdId = await requireHouseholdId();
  const parsed = personNameSchema.safeParse({ firstName, lastName });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: { householdId, ...parsed.data, category: "FAMILY_FRIEND" },
    });
    await tx.household.update({ where: { id: householdId }, data: { accountContactId: created.id } });
    await tx.activityLogEntry.create({
      data: { entityType: "CONTACT", entityId: created.id, action: "CREATED", source: "MANUAL" },
    });
  });
  revalidatePath(`/${slug}/account`);
  revalidatePath(`/${slug}/contacts`);
}
