import { prisma } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { generateInviteToken, hashInviteToken } from "@/lib/syncToken";

export const RESET_TTL_MS = 60 * 60 * 1000;
// A link a superuser starts for someone gets longer, since it may be passed on by hand.
export const ADMIN_RESET_TTL_MS = 24 * 60 * 60 * 1000;

/** The reset token's row if the link is still usable (exists, unused, unexpired), else null. */
export async function findValidResetToken(token: string) {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
  });
  return row && !row.usedAt && row.expiresAt > new Date() ? row : null;
}

/** Make a new single-use reset link for a user (replacing any unused one). Returns the raw token. */
export async function createPasswordResetToken(userId: string, ttlMs: number = RESET_TTL_MS): Promise<string> {
  const { token, hash } = generateInviteToken();
  // Only the newest link works.
  await prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/** Email the link. `byAdmin` changes the wording to say a superuser started it (and for how long it works). */
export async function sendPasswordResetEmail(
  user: { email: string; firstName: string },
  token: string,
  options: { byAdmin?: boolean } = {}
): Promise<void> {
  const link = `${appUrl()}/reset-password/${token}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your Domata password",
    text: options.byAdmin
      ? `Hi ${user.firstName},\n\n` +
        `An administrator started a password reset for your account. To choose a new password, open this link within 24 hours:\n\n` +
        `${link}\n\n` +
        `If you weren't expecting this, you can ignore this email. Your password has not changed.`
      : `Hi ${user.firstName},\n\n` +
        `Someone asked to reset the password for this account. To choose a new one, open this link within an hour:\n\n` +
        `${link}\n\n` +
        `If you didn't ask for this, ignore this email. Your password has not changed.`,
  });
}
