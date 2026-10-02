"use server";

import { contactIsIn, householdIsIn } from "@/lib/scope";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";

export async function restoreContactAction(id: string, slug: string) {
  const householdId = await requireHouseholdId();
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact || !contactIsIn(contact, householdId)) throw new Error("Contact not found");
  await prisma.contact.update({
    where: { id },
    data: { deletedAt: null },
  });

  await prisma.activityLogEntry.create({
    data: {
      entityType: "CONTACT",
      entityId: id,
      action: "RESTORED",
      source: "MANUAL",
    },
  });

  revalidatePath(`/${slug}/contacts/removed`);
  revalidatePath(`/${slug}/contacts`);
}

export async function restoreHouseholdAction(id: string, slug: string) {
  const householdId = await requireHouseholdId();
  const household = await prisma.household.findUnique({ where: { id } });
  if (!household || !householdIsIn(household, householdId)) throw new Error("Household not found");
  await prisma.household.update({
    where: { id },
    data: { deletedAt: null },
  });

  await prisma.activityLogEntry.create({
    data: {
      entityType: "HOUSEHOLD",
      entityId: id,
      action: "RESTORED",
      source: "MANUAL",
    },
  });

  revalidatePath(`/${slug}/contacts/removed`);
  revalidatePath(`/${slug}/contacts/households`);
}
