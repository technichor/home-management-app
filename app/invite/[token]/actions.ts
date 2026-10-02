"use server";

import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import { hashInviteToken } from "@/lib/syncToken";

export type RespondResult = { ok: true; status: "ACTIVE" | "DECLINED" } | { ok: false; error: string };

/**
 * Accept or decline a sync invite as the logged-in household. Everyone sharing the household
 * login acts as the account's one linked contact, so any logged-in member can answer.
 * Accepting records both households, activates the sync, and opens a brand-new SYNCED
 * conversation (earlier private threads about the contact are left untouched).
 */
export async function respondToInviteAction(
  token: string,
  decision: "accept" | "decline"
): Promise<RespondResult> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.householdId) throw new Error("Not authenticated");
  const householdId = session.householdId;

  if (decision !== "accept" && decision !== "decline") {
    return { ok: false, error: "Invalid response." };
  }

  const sync = await prisma.sync.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    include: { initiatingHousehold: { select: { displayName: true } } },
  });
  if (!sync) return { ok: false, error: "This invite link is not valid." };
  if (sync.initiatingHouseholdId === householdId) {
    return { ok: false, error: "You cannot answer your own invite." };
  }
  if (sync.status !== "PENDING") return { ok: false, error: "This invite was already answered." };

  const me = await prisma.household.findUnique({
    where: { id: householdId },
    select: { displayName: true },
  });
  if (!me) throw new Error("Not authenticated");

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

    await tx.conversation.create({
      data: {
        scope: "SYNCED",
        syncId: sync.id,
        name: `${sync.initiatingHousehold.displayName} & ${me.displayName}`,
      },
    });
    return { ok: true, status: "ACTIVE" };
  });
}
