import type { Prisma } from "@prisma/client";

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
