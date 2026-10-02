"use server";

import { prisma } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { RESET_TTL_MS } from "@/lib/passwordReset";
import { getClientIp, recordResetRequest, resetRetryAfterMinutes } from "@/lib/rateLimit";
import { generateInviteToken } from "@/lib/syncToken";
import { forgotPasswordSchema } from "@/lib/validations";

export type ForgotState = { error: string } | { sent: true } | null;

/**
 * Email a password reset link. The answer is the same whether or not the address has an
 * account (and whether or not the request was throttled), so it can't be used to find out
 * who is registered.
 */
export async function requestPasswordResetAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  const { email } = parsed.data;

  const ip = await getClientIp();
  if ((await resetRetryAfterMinutes(email, ip)) > 0) return { sent: true };
  await recordResetRequest(email, ip);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, firstName: true } });
  if (!user) return { sent: true };

  const { token, hash } = generateInviteToken();
  // Only the newest link works.
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });

  try {
    await sendEmail({
      to: email,
      subject: "Reset your Home Management password",
      text:
        `Hi ${user.firstName},\n\n` +
        `Someone asked to reset the password for this account. To choose a new one, open this link within an hour:\n\n` +
        `${appUrl()}/reset-password/${token}\n\n` +
        `If you didn't ask for this, ignore this email. Your password has not changed.`,
    });
  } catch (e) {
    // The caller still sees the generic answer; the failure belongs in the server log.
    console.error("Password reset email failed", e);
  }
  return { sent: true };
}
