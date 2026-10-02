"use server";

import { prisma } from "@/lib/db";
import { createPasswordResetToken, sendPasswordResetEmail } from "@/lib/passwordReset";
import { getClientIp, recordResetRequest, resetRetryAfterMinutes } from "@/lib/rateLimit";
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

  const token = await createPasswordResetToken(user.id);
  try {
    await sendPasswordResetEmail({ email, firstName: user.firstName }, token);
  } catch (e) {
    // The caller still sees the generic answer; the failure belongs in the server log.
    console.error("Password reset email failed", e);
  }
  return { sent: true };
}
