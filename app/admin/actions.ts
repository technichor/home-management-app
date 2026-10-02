"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireSuperuser } from "@/lib/auth";
import { ADMIN_RESET_TTL_MS, createPasswordResetToken, sendPasswordResetEmail } from "@/lib/passwordReset";
import { getClientIp, loginRetryAfterMinutes, recordFailedLogin } from "@/lib/rateLimit";

export type AdminLinkResult = { ok: true; path: string } | { ok: false; error: string };
export type AdminResult = { ok: true } | { ok: false; error: string };

// Every action here is a public endpoint, so each one starts by requiring a superuser; to anyone
// else it behaves as if it doesn't exist. Everything done is written to the audit log.

function audit(actorId: string, targetUserId: string, action: string, detail?: string) {
  return prisma.adminAuditEntry.create({ data: { actorId, targetUserId, action, detail } });
}

function refresh(userId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${userId}`);
}

/**
 * Start a password reset for someone and hand back the link, to pass on by hand. It is shown once,
 * works once for 24 hours, and replaces any earlier unused link. The admin never sees or sets the
 * password itself.
 */
export async function createResetLinkAction(userId: string): Promise<AdminLinkResult> {
  const admin = await requireSuperuser();
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return { ok: false, error: "User not found." };

  const token = await createPasswordResetToken(target.id, ADMIN_RESET_TTL_MS);
  await audit(admin.id, target.id, "PASSWORD_RESET_LINK_CREATED");
  refresh(target.id);
  return { ok: true, path: `/reset-password/${token}` };
}

/** The same, but the link is emailed to the user's own address instead of shown. */
export async function emailResetLinkAction(userId: string): Promise<AdminResult> {
  const admin = await requireSuperuser();
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true },
  });
  if (!target) return { ok: false, error: "User not found." };

  const token = await createPasswordResetToken(target.id, ADMIN_RESET_TTL_MS);
  try {
    await sendPasswordResetEmail(target, token, { byAdmin: true });
  } catch (e) {
    console.error("Admin password reset email failed", e);
    return { ok: false, error: "The email couldn't be sent. Create a link to copy instead." };
  }
  await audit(admin.id, target.id, "PASSWORD_RESET_EMAIL_SENT", target.email);
  refresh(target.id);
  return { ok: true };
}

/**
 * Grant or take away superuser access. Rare, so it asks for your own password again, counts wrong
 * guesses against the login limiter, and never leaves the app without a superuser.
 */
export async function setSuperuserAction(userId: string, makeSuperuser: boolean, password: string): Promise<AdminResult> {
  const admin = await requireSuperuser();

  const ip = await getClientIp();
  const wait = await loginRetryAfterMinutes(admin.email, ip);
  if (wait > 0) return { ok: false, error: `Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` };
  if (!password || !(await bcrypt.compare(password, admin.passwordHash))) {
    await recordFailedLogin(admin.email, ip);
    return { ok: false, error: "Your password is incorrect." };
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, isSuperuser: true } });
  if (!target) return { ok: false, error: "User not found." };
  if (target.isSuperuser === makeSuperuser) {
    return { ok: false, error: makeSuperuser ? "They are already a superuser." : "They are not a superuser." };
  }
  if (!makeSuperuser && (await prisma.user.count({ where: { isSuperuser: true } })) <= 1) {
    return { ok: false, error: "There must always be at least one superuser." };
  }

  await prisma.user.update({ where: { id: target.id }, data: { isSuperuser: makeSuperuser } });
  await audit(admin.id, target.id, makeSuperuser ? "SUPERUSER_GRANTED" : "SUPERUSER_REVOKED", target.email);
  refresh(target.id);
  return { ok: true };
}
