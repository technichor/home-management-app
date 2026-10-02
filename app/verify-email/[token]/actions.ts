"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { findValidVerificationToken } from "@/lib/emailVerification";
import { hashInviteToken } from "@/lib/syncToken";
import type { AuthState } from "@/app/signup/actions";

const INVALID = "This confirmation link is not valid or has expired. Log in to request a new one.";

/** Confirm the address the link was sent to. The link is proof of access to the mailbox, so no login is needed. */
export async function verifyEmailAction(token: string): Promise<AuthState> {
  const row = await findValidVerificationToken(token);
  if (!row) return { error: INVALID };

  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    // The usedAt check in the WHERE makes two clicks of one link race safely.
    const claimed = await tx.emailVerificationToken.updateMany({
      where: { tokenHash: hashInviteToken(token), usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) return false;
    await tx.user.update({ where: { id: row.user.id }, data: { emailVerifiedAt: now } });
    return true;
  });
  if (!done) return { error: INVALID };

  const current = await getSessionUser();
  redirect(current ? "/onboarding" : "/login?verified=1");
}
