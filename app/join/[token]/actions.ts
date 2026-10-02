"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser, isUnverified, startSession } from "@/lib/auth";
import { joinHouseholdTx, MembershipError } from "@/lib/membership";
import { hashInviteToken } from "@/lib/syncToken";
import type { AuthState } from "@/app/signup/actions";

/** Accept a household invite as the signed-in user, becoming a member of the inviting household. */
export async function acceptHouseholdInviteAction(token: string): Promise<AuthState> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  if (isUnverified(user)) return { error: "Confirm your email address first." };
  if (user.household && !user.household.deletedAt) return { error: "You already belong to a household." };

  const invite = await prisma.householdInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { household: { select: { id: true, deletedAt: true } } },
  });
  if (!invite || invite.household.deletedAt) return { error: "This invite link is not valid." };
  if (invite.status !== "PENDING") return { error: "This invite was already used or withdrawn." };
  if (invite.expiresAt <= new Date()) return { error: "This invite has expired. Ask for a new one." };

  try {
    await prisma.$transaction(async (tx) => {
      // The status check in the WHERE makes two people opening one link at once harmless.
      const claimed = await tx.householdInvite.updateMany({
        where: { id: invite.id, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedById: user.id, respondedAt: new Date() },
      });
      if (claimed.count === 0) throw new MembershipError("This invite was already used or withdrawn.");
      await joinHouseholdTx(tx, user, invite.householdId);
      await tx.joinRequest.updateMany({
        where: { userId: user.id, status: "PENDING" },
        data: { status: "CANCELLED", respondedAt: new Date() },
      });
    });
  } catch (e) {
    if (!(e instanceof MembershipError)) throw e;
    return { error: e.message };
  }

  await startSession(user);
  redirect("/home");
}
