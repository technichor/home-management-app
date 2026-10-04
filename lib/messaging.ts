import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Where a channel is visible: exactly when you are one of its members (nobody else, household owners
 * included). This is the single place that decides who can see a channel; every messaging query and
 * server action goes through it, and a channel you aren't in is reported as not found.
 */
export function channelsFor(userId: string): Prisma.ConversationWhereInput {
  return { members: { some: { userId } } };
}

/** One-line preview of a message for the conversation list. */
export function previewText(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/**
 * Unread messages per channel for a user: messages from other people (or from a deleted account) newer
 * than the user's read marker, in channels that aren't archived. Channels with none are left out.
 */
export async function unreadCounts(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ conversationId: string; unread: number }[]>`
    SELECT cm."conversationId", COUNT(m."id")::int AS unread
    FROM "ConversationMember" cm
    JOIN "Conversation" c ON c."id" = cm."conversationId" AND c."archivedAt" IS NULL
    JOIN "Message" m ON m."conversationId" = cm."conversationId"
      AND m."deletedAt" IS NULL
      AND m."createdAt" > cm."lastReadAt"
      AND m."senderUserId" IS DISTINCT FROM cm."userId"
    WHERE cm."userId" = ${userId}
    GROUP BY cm."conversationId"`;
  return new Map(rows.map((r) => [r.conversationId, r.unread]));
}

/** The total across all channels (for the Messages tab). */
export async function totalUnread(userId: string): Promise<number> {
  let total = 0;
  for (const n of (await unreadCounts(userId)).values()) total += n;
  return total;
}
