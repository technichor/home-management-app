import { prisma } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { generateInviteToken, hashInviteToken } from "@/lib/syncToken";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** The token's row if the link is still usable (exists, unused, unexpired), else null. */
export async function findValidVerificationToken(token: string) {
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { user: { select: { id: true, emailVerifiedAt: true } } },
  });
  return row && !row.usedAt && row.expiresAt > new Date() ? row : null;
}

/** Make a fresh link (replacing any unused one) and email it. Throws if the email can't be sent. */
export async function sendVerificationEmail(user: { id: string; email: string; firstName: string }): Promise<void> {
  const { token, hash } = generateInviteToken();
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  await sendEmail({
    to: user.email,
    subject: "Confirm your email for Domata",
    text:
      `Hi ${user.firstName},\n\n` +
      `To finish setting up your account, confirm this email address by opening this link within 24 hours:\n\n` +
      `${appUrl()}/verify-email/${token}\n\n` +
      `If you didn't create an account, you can ignore this email.`,
  });
}
