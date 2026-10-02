import { prisma } from "@/lib/db";
import { hashInviteToken } from "@/lib/syncToken";

export const RESET_TTL_MS = 60 * 60 * 1000;

/** The reset token's row if the link is still usable (exists, unused, unexpired), else null. */
export async function findValidResetToken(token: string) {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { user: { select: { id: true, email: true } } },
  });
  return row && !row.usedAt && row.expiresAt > new Date() ? row : null;
}
