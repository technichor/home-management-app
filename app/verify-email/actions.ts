"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/emailVerification";
import { getClientIp, recordVerifyRequest, verifyRetryAfterMinutes } from "@/lib/rateLimit";

export type ResendState = { error: string } | { sent: true } | null;

/** Email a fresh confirmation link to the signed-in, still-unverified user. */
export async function resendVerificationAction(): Promise<ResendState> {
  const user = await getSessionUser();
  if (!user) return { error: "Log in first." };
  if (user.emailVerifiedAt) return { error: "Your email is already confirmed." };

  const ip = await getClientIp();
  const retryAfter = await verifyRetryAfterMinutes(user.email, ip);
  if (retryAfter > 0) {
    return { error: `Too many requests. Try again in ${retryAfter} minute${retryAfter === 1 ? "" : "s"}.` };
  }
  await recordVerifyRequest(user.email, ip);

  try {
    await sendVerificationEmail(user);
  } catch (e) {
    console.error("Verification email failed", e);
    return { error: "We couldn't send the email. Try again in a few minutes." };
  }
  revalidatePath("/verify-email");
  return { sent: true };
}
