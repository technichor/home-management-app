"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMember, requireOwner } from "@/lib/auth";
import { generateInviteToken } from "@/lib/syncToken";
import { generateJoinCode } from "@/lib/joinCode";
import { detachUser, INVITE_TTL_MS, joinHouseholdTx, MembershipError } from "@/lib/membership";

export type HouseholdActionResult = { ok: true } | { ok: false; error: string };

function refresh(slug: string | null) {
  revalidatePath(`/${slug}/household`);
}

/** A single-use link for one new member. The link is shown once; only its hash is stored. */
export async function createInviteAction(): Promise<
  { ok: true; invitePath: string } | { ok: false; error: string }
> {
  const owner = await requireOwner();
  const { token, hash } = generateInviteToken();
  await prisma.householdInvite.create({
    data: {
      householdId: owner.householdId,
      createdById: owner.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  refresh(owner.household.urlSlug);
  return { ok: true, invitePath: `/join/${token}` };
}

export async function revokeInviteAction(inviteId: string): Promise<HouseholdActionResult> {
  const owner = await requireOwner();
  const revoked = await prisma.householdInvite.updateMany({
    where: { id: inviteId, householdId: owner.householdId, status: "PENDING" },
    data: { status: "REVOKED", respondedAt: new Date() },
  });
  if (revoked.count === 0) return { ok: false, error: "That invite is no longer pending." };
  refresh(owner.household.urlSlug);
  return { ok: true };
}

/** Turn join requests on (new code, replacing any old one) or off. */
export async function setJoinCodeAction(
  enable: boolean
): Promise<{ ok: true; joinCode: string | null } | { ok: false; error: string }> {
  const owner = await requireOwner();
  const joinCode = enable ? generateJoinCode() : null;
  try {
    await prisma.household.update({ where: { id: owner.householdId }, data: { joinCode } });
  } catch (e) {
    // The new code collided with another household's; the caller can just try again.
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Could not make a code. Try again." };
    throw e;
  }
  refresh(owner.household.urlSlug);
  return { ok: true, joinCode };
}

export async function decideJoinRequestAction(
  requestId: string,
  decision: "approve" | "decline"
): Promise<HouseholdActionResult> {
  const owner = await requireOwner();
  const request = await prisma.joinRequest.findFirst({
    where: { id: requestId, householdId: owner.householdId, status: "PENDING" },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!request) return { ok: false, error: "That request is no longer pending." };

  const respondedAt = new Date();
  if (decision === "decline") {
    await prisma.joinRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "DECLINED", respondedAt },
    });
  } else {
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.joinRequest.updateMany({
          where: { id: request.id, status: "PENDING" },
          data: { status: "APPROVED", respondedAt },
        });
        if (claimed.count === 0) throw new MembershipError("That request is no longer pending.");
        await joinHouseholdTx(tx, request.user, owner.householdId);
        await tx.joinRequest.updateMany({
          where: { userId: request.userId, status: "PENDING" },
          data: { status: "CANCELLED", respondedAt },
        });
      });
    } catch (e) {
      if (!(e instanceof MembershipError)) throw e;
      return { ok: false, error: e.message };
    }
  }
  refresh(owner.household.urlSlug);
  return { ok: true };
}

export async function promoteMemberAction(userId: string): Promise<HouseholdActionResult> {
  const owner = await requireOwner();
  const promoted = await prisma.user.updateMany({
    where: { id: userId, householdId: owner.householdId },
    data: { role: "OWNER" },
  });
  if (promoted.count === 0) return { ok: false, error: "That person is not in your household." };
  refresh(owner.household.urlSlug);
  return { ok: true };
}

export async function removeMemberAction(userId: string): Promise<HouseholdActionResult> {
  const owner = await requireOwner();
  if (userId === owner.id) return { ok: false, error: "Use Leave household to remove yourself." };
  const member = await prisma.user.findFirst({ where: { id: userId, householdId: owner.householdId } });
  if (!member) return { ok: false, error: "That person is not in your household." };
  await detachUser(prisma, member.id);
  refresh(owner.household.urlSlug);
  return { ok: true };
}

export async function leaveHouseholdAction(): Promise<HouseholdActionResult> {
  const user = await requireMember();
  if (user.role === "OWNER") {
    const otherOwners = await prisma.user.count({
      where: { householdId: user.householdId, role: "OWNER", id: { not: user.id } },
    });
    if (otherOwners === 0) {
      return { ok: false, error: "You are the only owner. Make someone else an owner before you leave." };
    }
  }
  await detachUser(prisma, user.id);

  redirect("/onboarding");
}
