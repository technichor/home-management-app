import type { Prisma } from "@prisma/client";

export const MAX_MESSAGE_LENGTH = 4000;

/**
 * The conversations a household may read and write: its own household-scope ones, plus synced
 * ones whose Sync is ACTIVE and names it on either side. This is the single place that decides
 * who can see a conversation; every messaging query goes through it.
 */
export function conversationsVisibleTo(householdId: string): Prisma.ConversationWhereInput {
  return {
    OR: [
      { scope: "HOUSEHOLD", householdId },
      {
        scope: "SYNCED",
        sync: {
          status: "ACTIVE",
          OR: [{ initiatingHouseholdId: householdId }, { counterpartHouseholdId: householdId }],
        },
      },
    ],
  };
}

/** One-line preview of a message for the conversation list. */
export function previewText(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
