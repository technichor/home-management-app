"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser, startSession } from "@/lib/auth";
import { pickSlug, slugify } from "@/lib/slug";
import { normalizeJoinCode } from "@/lib/joinCode";
import { newHouseholdSchema } from "@/lib/validations";
import type { AuthState } from "@/app/signup/actions";

export async function createHouseholdForUserAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.household && !user.household.deletedAt) {
    return { error: "You already belong to a household." };
  }

  const parsed = newHouseholdSchema.safeParse({
    displayName: formData.get("displayName"),
    mailingAddress: formData.get("mailingAddress") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const { displayName, mailingAddress } = parsed.data;

  const base = slugify(displayName);
  const existing = await prisma.household.findMany({
    where: { urlSlug: { startsWith: base } },
    select: { urlSlug: true },
  });
  const urlSlug = pickSlug(base, existing.map((h) => h.urlSlug as string));

  // The founder becomes the household's owner and acts as their own Contact.
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.household.create({
        data: { displayName, mailingAddress, urlSlug },
      });
      const contact = await tx.contact.create({
        data: { householdId: created.id, ownerHouseholdId: created.id, firstName: user.firstName, lastName: user.lastName, category: "FAMILY_FRIEND" },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { householdId: created.id, role: "OWNER", contactId: contact.id },
      });
      await tx.activityLogEntry.createMany({
        data: [
          { entityType: "HOUSEHOLD", entityId: created.id, action: "CREATED", source: "MANUAL" },
          { entityType: "CONTACT", entityId: contact.id, action: "CREATED", source: "MANUAL" },
        ],
      });
    });
  } catch (e) {
    // Someone took the same slug between the lookup and the insert.
    if ((e as { code?: string }).code === "P2002") return { error: "That name was just taken. Try again." };
    throw e;
  }

  await startSession(user);
  redirect(`/${urlSlug}/contacts`);
}

/** Ask to join the household that owns this code. An owner there has to approve. */
export async function requestJoinAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.household && !user.household.deletedAt) return { error: "You already belong to a household." };

  const code = normalizeJoinCode(String(formData.get("joinCode") ?? ""));
  const household = code
    ? await prisma.household.findUnique({
        where: { joinCode: code },
        select: { id: true, displayName: true, deletedAt: true },
      })
    : null;
  if (!household || household.deletedAt) return { error: "No household uses that code." };

  const open = await prisma.joinRequest.findFirst({
    where: { userId: user.id, householdId: household.id, status: "PENDING" },
  });
  if (open) return { error: `You already asked to join ${household.displayName}.` };

  await prisma.joinRequest.create({ data: { userId: user.id, householdId: household.id } });
  revalidatePath("/onboarding");
  return null;
}

export async function cancelJoinRequestAction(requestId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await prisma.joinRequest.updateMany({
    where: { id: requestId, userId: user.id, status: "PENDING" },
    data: { status: "CANCELLED", respondedAt: new Date() },
  });
  revalidatePath("/onboarding");
}
