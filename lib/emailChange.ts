import { prisma } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { generateInviteToken, hashInviteToken } from "@/lib/syncToken";

export const CHANGE_TTL_MS = 60 * 60 * 1000;

/** The token's row if the link is still usable (exists, unused, unexpired), else null. */
export async function findValidChangeToken(token: string) {
  const row = await prisma.emailChangeToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { user: { select: { id: true, email: true, firstName: true } } },
  });
  return row && !row.usedAt && row.expiresAt > new Date() ? row : null;
}

/**
 * Make a fresh link (replacing any unused one for this user) and email it to the NEW address.
 * The login email only changes when that link is opened. Throws if the email can't be sent.
 */
export async function sendChangeEmailLink(user: { id: string; firstName: string }, newEmail: string): Promise<void> {
  const { token, hash } = generateInviteToken();
  await prisma.emailChangeToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.emailChangeToken.create({
    data: { userId: user.id, newEmail, tokenHash: hash, expiresAt: new Date(Date.now() + CHANGE_TTL_MS) },
  });
  await sendEmail({
    to: newEmail,
    subject: "Confirm your new email for Home Management",
    text:
      `Hi ${user.firstName},\n\n` +
      `You asked to use this address to log in to Home Management. To confirm the change, open this link within an hour:\n\n` +
      `${appUrl()}/change-email/${token}\n\n` +
      `If you didn't ask for this, ignore this email. Nothing changes until the link is opened.`,
  });
}

/** Tell the OLD address its login email was changed, so someone who didn't do it can react. */
export async function sendEmailChangedNotice(user: { firstName: string }, oldEmail: string, newEmail: string): Promise<void> {
  await sendEmail({
    to: oldEmail,
    subject: "Your Home Management email address was changed",
    text:
      `Hi ${user.firstName},\n\n` +
      `The email address you use to log in to Home Management was just changed from ${oldEmail} to ${newEmail}.\n\n` +
      `If that was you, there's nothing more to do. If it wasn't, someone else has access to your account: ` +
      `use "Forgot your password?" at ${appUrl()}/forgot-password with the new address, and change your password.`,
  });
}
