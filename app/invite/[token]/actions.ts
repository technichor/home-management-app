"use server";

import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { hashInviteToken } from "@/lib/syncToken";

export type RespondResult = { ok: true; status: "ACTIVE" | "DECLINED" } | { ok: false; error: string };

/**
 * Accept or decline a sync invite as the logged-in household. Everyone sharing the household
 * login acts as the account's one linked contact, so any logged-in member can answer.
 * Accepting records both households and activates the sync. That is all: the two households can now
 * put each other's members in channels, but no channel is created automatically.
 */
export async function respondToInviteAction(
  token: string,
  decision: "accept" | "decline"
): Promise<RespondResult> {
  const householdId = await requireHouseholdId();

  if (decision !== "accept" && decision !== "decline") {
    return { ok: false, error: "Invalid response." };
  }

  const sync = await prisma.sync.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
  });
  if (!sync) return { ok: false, error: "This invite link is not valid." };
  if (sync.initiatingHouseholdId === householdId) {
    return { ok: false, error: "You cannot answer your own invite." };
  }
  if (sync.status === "REVOKED") return { ok: false, error: "This invite was revoked by the sender." };
  if (sync.status !== "PENDING") return { ok: false, error: "This invite was already answered." };

  return prisma.$transaction(async (tx): Promise<RespondResult> => {
    const respondedAt = new Date();
    // The status check in the WHERE makes a double-click or two answers at once harmless.
    const claimed = await tx.sync.updateMany({
      where: { id: sync.id, status: "PENDING" },
      data:
        decision === "accept"
          ? { status: "ACTIVE", counterpartHouseholdId: householdId, respondedAt }
          : { status: "DECLINED", respondedAt },
    });
    if (claimed.count === 0) return { ok: false, error: "This invite was already answered." };

    if (decision === "decline") return { ok: true, status: "DECLINED" };

    return { ok: true, status: "ACTIVE" };
  });
}
