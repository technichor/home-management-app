"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { personNameSchema } from "@/lib/validations";
import { requireMember } from "@/lib/auth";
import { contactIsIn } from "@/lib/scope";

const TAKEN = "Someone else already acts as that contact";

/** Make an existing member of this household the contact the signed-in user acts as. */
export async function linkAccountContactAction(slug: string, contactId: string) {
  const user = await requireMember();
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (
    !contact ||
    contact.deletedAt ||
    !contactIsIn(contact, user.householdId) ||
    contact.householdId !== user.householdId ||
    contact.category !== "FAMILY_FRIEND"
  ) {
    throw new Error("Choose a Family & Friend contact from your own household");
  }
  try {
    await prisma.user.update({ where: { id: user.id }, data: { contactId } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error(TAKEN);
    throw e;
  }
  revalidatePath(`/${slug}/account`);
}

/** Create a new member of this household and make it the contact the signed-in user acts as. */
export async function createAccountContactAction(slug: string, firstName: string, lastName: string) {
  const user = await requireMember();
  const { householdId } = user;
  const parsed = personNameSchema.safeParse({ firstName, lastName });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: { householdId, ownerHouseholdId: householdId, ...parsed.data, category: "FAMILY_FRIEND" },
    });
    await tx.user.update({ where: { id: user.id }, data: { contactId: created.id } });
    await tx.activityLogEntry.create({
      data: { entityType: "CONTACT", entityId: created.id, action: "CREATED", source: "MANUAL" },
    });
  });
  revalidatePath(`/${slug}/account`);
  revalidatePath(`/${slug}/contacts`);
}
