"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";

export async function restoreContactAction(id: string, slug: string) {
  await requireHouseholdId();
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
  await requireHouseholdId();
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
