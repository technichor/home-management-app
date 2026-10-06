"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { findValidChangeToken, sendEmailChangedNotice } from "@/lib/emailChange";
import { hashInviteToken } from "@/lib/syncToken";
import type { AuthState } from "@/app/signup/actions";
import { isUniqueViolation } from "@/lib/prismaErrors";

const INVALID = "This confirmation link is not valid or has expired. Request the change again from your account page.";

/**
 * Switch the login email to the address the link was sent to. Opening the link proves the new
 * mailbox is theirs, so no login is needed. The old address is told afterwards.
 */
export async function confirmEmailChangeAction(token: string): Promise<AuthState> {
  const row = await findValidChangeToken(token);
  if (!row) return { error: INVALID };

  const now = new Date();
  let done: boolean;
  try {
    done = await prisma.$transaction(async (tx) => {
      // The usedAt check in the WHERE makes two clicks of one link race safely.
      const claimed = await tx.emailChangeToken.updateMany({
        where: { tokenHash: hashInviteToken(token), usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) return false;
      await tx.user.update({ where: { id: row.user.id }, data: { email: row.newEmail, emailVerifiedAt: now } });
      await tx.emailChangeToken.updateMany({ where: { userId: row.user.id, usedAt: null }, data: { usedAt: now } });
      return true;
    });
  } catch (e) {
    // Someone registered that address after the link was sent.
    if (isUniqueViolation(e)) return { error: "An account already uses that email address." };
    throw e;
  }
  if (!done) return { error: INVALID };

  try {
    await sendEmailChangedNotice(row.user, row.user.email, row.newEmail);
  } catch (e) {
    console.error("Email-changed notice failed to send", e);
  }

  const current = await getSessionUser();
  redirect(current ? "/account" : "/login?changed=1");
}
