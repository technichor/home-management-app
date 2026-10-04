"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { channelsFor } from "@/lib/messaging";
import { checkChannelMembers, leaveChannelTx } from "@/lib/channels";
import { conversationNameSchema, messageSchema } from "@/lib/validations";
import { requireMember } from "@/lib/auth";

// Server actions are public endpoints, so each one re-checks that the caller is a member of the channel
// (and, for changes, one of its managers). A channel the caller isn't in is reported as not found.
//
// Expected failures come back as { ok: false, error }, because production builds hide the message of an
// error thrown from a server action. Only a missing or invalid session throws.

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

class UserError extends Error {}

async function attempt<T extends object = object>(fn: () => Promise<T | void>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...((await fn()) ?? {}) } as ActionResult<T>;
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}

async function loadMemberChannel(userId: string, id: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, ...channelsFor(userId) },
    include: { members: { select: { userId: true, role: true, user: { select: { householdId: true } } } } },
  });
  if (!conversation) throw new UserError("Channel not found");
  return conversation;
}

/** A channel the caller manages. (General is automatic: it always holds the whole household.) */
async function loadManagedChannel(userId: string, id: string) {
  const conversation = await loadMemberChannel(userId, id);
  if (conversation.kind === "GENERAL") throw new UserError("General always includes everyone in your household.");
  if (!conversation.members.some((m) => m.userId === userId && m.role === "MANAGER")) {
    throw new UserError("Only a channel manager can do that.");
  }
  return conversation;
}

function refresh(id?: string) {
  revalidatePath("/messages");
  if (id) revalidatePath(`/messages/${id}`);
}

/**
 * A channel with the people the creator picked: anyone in their household, or in a household they're
 * synced with. The creator manages it.
 */
export async function createChannelAction(name: string, memberUserIds: string[]) {
  const user = await requireMember();
  return attempt(async () => {
    const parsed = conversationNameSchema.safeParse({ name });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);

    const check = await checkChannelMembers(user, memberUserIds);
    if (!check.ok) throw new UserError(check.error);
    if (check.userIds.length === 0) throw new UserError("Add at least one other person.");

    const created = await prisma.conversation.create({
      data: {
        name: parsed.data.name,
        createdById: user.id,
        members: {
          create: [
            { userId: user.id, role: "MANAGER" },
            ...check.userIds.map((userId) => ({ userId, addedById: user.id })),
          ],
        },
      },
    });
    refresh();
    return { id: created.id };
  });
}

/** Send a text message as the signed-in user. There is no sender choice. */
export async function sendMessageAction(conversationId: string, text: string) {
  const user = await requireMember();
  return attempt(async () => {
    const parsed = messageSchema.safeParse({ text });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);

    const conversation = await loadMemberChannel(user.id, conversationId);
    if (conversation.archivedAt) throw new UserError("Unarchive this channel to send messages");

    await prisma.$transaction(async (tx) => {
      await tx.message.create({ data: { conversationId: conversation.id, senderUserId: user.id, text: parsed.data.text } });
      // Recency in the channel list follows the latest activity.
      await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    });
    refresh(conversation.id);
  });
}

/** Add people to a channel (managers only), under the same rules as when it was created. */
export async function addChannelMembersAction(conversationId: string, memberUserIds: string[]) {
  const user = await requireMember();
  return attempt(async () => {
    const conversation = await loadManagedChannel(user.id, conversationId);

    const existing = new Set(conversation.members.map((m) => m.userId));
    const newcomers = memberUserIds.filter((id) => !existing.has(id));
    const check = await checkChannelMembers(
      user,
      newcomers,
      conversation.members.map((m) => m.user.householdId).filter((id): id is string => !!id)
    );
    if (!check.ok) throw new UserError(check.error);
    if (check.userIds.length === 0) throw new UserError("Choose at least one person who isn't already in the channel.");

    await prisma.conversationMember.createMany({
      data: check.userIds.map((userId) => ({ conversationId, userId, addedById: user.id })),
      skipDuplicates: true,
    });
    refresh(conversationId);
  });
}

/** Remove someone from a channel (managers only). To leave yourself, use leaveChannelAction. */
export async function removeChannelMemberAction(conversationId: string, userId: string) {
  const user = await requireMember();
  return attempt(async () => {
    const conversation = await loadManagedChannel(user.id, conversationId);
    if (userId === user.id) throw new UserError("Use Leave channel to remove yourself.");
    if (!conversation.members.some((m) => m.userId === userId)) throw new UserError("That person isn't in this channel.");

    await prisma.$transaction((tx) => leaveChannelTx(tx, conversationId, userId, "CHANNEL"));
    refresh(conversationId);
  });
}

/** Leave a channel. (Nobody leaves General: it always holds the whole household.) */
export async function leaveChannelAction(conversationId: string) {
  const user = await requireMember();
  return attempt(async () => {
    const conversation = await loadMemberChannel(user.id, conversationId);
    if (conversation.kind === "GENERAL") throw new UserError("You can't leave General. It always includes everyone in your household.");

    await prisma.$transaction((tx) => leaveChannelTx(tx, conversationId, user.id, "CHANNEL"));
    refresh(conversationId);
  });
}

export async function renameChannelAction(conversationId: string, name: string) {
  const user = await requireMember();
  return attempt(async () => {
    await loadManagedChannel(user.id, conversationId);
    const parsed = conversationNameSchema.safeParse({ name });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);

    await prisma.conversation.update({ where: { id: conversationId }, data: { name: parsed.data.name } });
    refresh(conversationId);
  });
}

/** Archiving is global: it hides the channel for everyone in it. Managers only. */
export async function archiveChannelAction(conversationId: string) {
  const user = await requireMember();
  return attempt(async () => {
    await loadManagedChannel(user.id, conversationId);
    await prisma.conversation.update({ where: { id: conversationId }, data: { archivedAt: new Date() } });
    refresh(conversationId);
  });
}

export async function unarchiveChannelAction(conversationId: string) {
  const user = await requireMember();
  return attempt(async () => {
    await loadManagedChannel(user.id, conversationId);
    await prisma.conversation.update({ where: { id: conversationId }, data: { archivedAt: null } });
    refresh(conversationId);
  });
}
