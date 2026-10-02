"use server";

import { contactIsIn } from "@/lib/scope";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { conversationsVisibleTo } from "@/lib/messaging";
import { conversationNameSchema, messageSchema } from "@/lib/validations";
import { requireHouseholdId } from "@/lib/auth";

// Server actions are public endpoints, so each one re-checks that the caller's household may
// see the conversation. A conversation the caller cannot see is reported as not found.
async function loadVisibleConversation(householdId: string, id: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, ...conversationsVisibleTo(householdId) },
  });
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

function revalidateMessages(slug: string) {
  revalidatePath(`/${slug}/messages`);
}

/** A named group chat for this household. Any number can exist at once. */
export async function createGroupConversationAction(slug: string, name: string) {
  const householdId = await requireHouseholdId();
  const parsed = conversationNameSchema.safeParse({ name });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const created = await prisma.conversation.create({
    data: { scope: "HOUSEHOLD", householdId, name: parsed.data.name },
  });
  revalidateMessages(slug);
  return { id: created.id };
}

/**
 * A private, one-sided note thread about a contact we are not synced with. If one is already
 * open for that contact it is reused. Once synced, a separate SYNCED conversation is created at
 * accept time; this thread stays private.
 */
export async function startContactThreadAction(slug: string, contactId: string) {
  const householdId = await requireHouseholdId();

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.deletedAt || !contactIsIn(contact, householdId)) throw new Error("Contact not found");
  if (contact.householdId === householdId) {
    throw new Error("People in your own household are already part of your household conversations");
  }

  const synced = await prisma.sync.findFirst({
    where: { initiatingHouseholdId: householdId, relatedContactId: contact.id, status: "ACTIVE" },
  });
  if (synced) throw new Error("You are synced with this contact. Use your shared conversation instead");

  const existing = await prisma.conversation.findFirst({
    where: { scope: "HOUSEHOLD", householdId, relatedContactId: contact.id, archivedAt: null },
  });
  if (existing) return { id: existing.id };

  const created = await prisma.conversation.create({
    data: {
      scope: "HOUSEHOLD",
      householdId,
      relatedContactId: contact.id,
      name: `${contact.firstName} ${contact.lastName}`,
    },
  });
  revalidateMessages(slug);
  return { id: created.id };
}

/** Send a text message as the account's linked contact. There is no sender choice. */
export async function sendMessageAction(slug: string, conversationId: string, text: string) {
  const householdId = await requireHouseholdId();
  const parsed = messageSchema.safeParse({ text });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const conversation = await loadVisibleConversation(householdId, conversationId);
  if (conversation.archivedAt) throw new Error("Unarchive this conversation to send messages");

  const me = await prisma.household.findUnique({
    where: { id: householdId },
    select: { accountContactId: true },
  });
  if (!me?.accountContactId) {
    throw new Error("Link your account to a contact on the Account page before sending messages");
  }
  const senderContactId = me.accountContactId;

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: { conversationId: conversation.id, senderContactId, text: parsed.data.text },
    });
    // Recency in the conversation list follows the latest activity.
    await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  });

  revalidatePath(`/${slug}/messages/${conversation.id}`);
  revalidateMessages(slug);
}

/** Archiving is global: it applies to every household in a synced conversation. */
export async function archiveConversationAction(slug: string, conversationId: string) {
  const householdId = await requireHouseholdId();
  await loadVisibleConversation(householdId, conversationId);
  await prisma.conversation.update({ where: { id: conversationId }, data: { archivedAt: new Date() } });
  revalidatePath(`/${slug}/messages/${conversationId}`);
  revalidateMessages(slug);
}

export async function unarchiveConversationAction(slug: string, conversationId: string) {
  const householdId = await requireHouseholdId();
  await loadVisibleConversation(householdId, conversationId);
  await prisma.conversation.update({ where: { id: conversationId }, data: { archivedAt: null } });
  revalidatePath(`/${slug}/messages/${conversationId}`);
  revalidateMessages(slug);
}
