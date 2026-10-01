"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";

// Server actions are public endpoints, so every one checks for a logged-in household itself.
async function requireSession() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.householdId) throw new Error("Not authenticated");
}

export async function restoreContactAction(id: string, slug: string) {
  await requireSession();
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
  await requireSession();
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
