"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { findValidResetToken } from "@/lib/passwordReset";
import { clearFailedLogins } from "@/lib/rateLimit";
import { resetPasswordSchema } from "@/lib/validations";
import { hashInviteToken } from "@/lib/syncToken";
import type { AuthState } from "@/app/signup/actions";

const INVALID = "This reset link is not valid or has expired. Request a new one.";

/** Set a new password using an emailed link. The link works once; every older session is signed out. */
export async function resetPasswordAction(token: string, _prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetPasswordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };

  const row = await findValidResetToken(token);
  if (!row) return { error: INVALID };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const now = new Date();
  const used = await prisma.$transaction(async (tx) => {
    // The usedAt check in the WHERE makes two submissions of one link race safely.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash: hashInviteToken(token), usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) return false;
    await tx.user.update({ where: { id: row.user.id }, data: { passwordHash, passwordChangedAt: now } });
    await tx.passwordResetToken.updateMany({ where: { userId: row.user.id, usedAt: null }, data: { usedAt: now } });
    return true;
  });
  if (!used) return { error: INVALID };

  await clearFailedLogins(row.user.email);
  redirect("/login?reset=1");
}
