"use server";

import { contactIsIn } from "@/lib/scope";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requestSyncSchema } from "@/lib/validations";
import { generateInviteToken } from "@/lib/syncToken";
import { requireHouseholdId } from "@/lib/auth";

export type SyncActionResult = { ok: true; invitePath: string } | { ok: false; error: string };

/**
 * Start a sync from an existing contact. No email is sent: the caller gets a one-time link
 * to pass along themselves. Only the link's hash is stored.
 */
export async function requestSyncAction(
  slug: string,
  contactId: string,
  email: string
): Promise<SyncActionResult> {
  const householdId = await requireHouseholdId();

  const parsed = requestSyncSchema.safeParse({ contactId, email });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const contact = await prisma.contact.findUnique({ where: { id: parsed.data.contactId } });
  if (!contact || contact.deletedAt || !contactIsIn(contact, householdId)) {
    return { ok: false, error: "Contact not found." };
  }
  if (contact.householdId === householdId) {
    return { ok: false, error: "People in your own household can already message each other." };
  }

  const open = await prisma.sync.findFirst({
    where: {
      initiatingHouseholdId: householdId,
      relatedContactId: contact.id,
      status: { in: ["PENDING", "ACTIVE"] },
    },
  });
  if (open) {
    return {
      ok: false,
      error:
        open.status === "ACTIVE"
          ? "You are already synced with this contact."
          : "An invite to this contact is already pending.",
    };
  }

  const { token, hash } = generateInviteToken();
  await prisma.sync.create({
    data: {
      initiatingHouseholdId: householdId,
      relatedContactId: contact.id,
      counterpartEmail: parsed.data.email,
      inviteTokenHash: hash,
    },
  });

  revalidatePath(`/${slug}/contacts/${contact.id}`);
  return { ok: true, invitePath: `/invite/${token}` };
}

/** Replace a pending invite's link (the old one stops working). The link is only ever shown once. */
export async function regenerateInviteAction(slug: string, syncId: string): Promise<SyncActionResult> {
  const householdId = await requireHouseholdId();

  const sync = await prisma.sync.findUnique({ where: { id: syncId } });
  if (!sync || sync.initiatingHouseholdId !== householdId) {
    return { ok: false, error: "Invite not found." };
  }

  const { token, hash } = generateInviteToken();
  const updated = await prisma.sync.updateMany({
    where: { id: sync.id, status: "PENDING" },
    data: { inviteTokenHash: hash },
  });
  if (updated.count === 0) return { ok: false, error: "Only a pending invite can get a new link." };

  revalidatePath(`/${slug}/contacts/${sync.relatedContactId}`);
  return { ok: true, invitePath: `/invite/${token}` };
}
