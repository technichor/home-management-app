"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { changeEmailSchema, changePasswordSchema, personNameSchema } from "@/lib/validations";
import { sendChangeEmailLink } from "@/lib/emailChange";
import {
  changeEmailRetryAfterMinutes,
  getClientIp,
  loginRetryAfterMinutes,
  recordChangeEmailRequest,
  recordFailedLogin,
} from "@/lib/rateLimit";
import { requireMember, startSession } from "@/lib/auth";
import { contactIsIn } from "@/lib/scope";

const TAKEN = "Someone else already acts as that contact";

/** Make an existing member of this household the contact the signed-in user acts as. */
export async function linkAccountContactAction(contactId: string) {
  const user = await requireMember();
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (
    !contact ||
    contact.deletedAt ||
    !contactIsIn(contact, user.householdId) ||
    contact.householdId !== user.householdId ||
    contact.category !== "FAMILY_FRIEND"
  ) {
    throw new Error("Choose a Family & Friend contact from your own household");
  }
  try {
    await prisma.user.update({ where: { id: user.id }, data: { contactId } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error(TAKEN);
    throw e;
  }
  revalidatePath("/account");
}

/** Create a new member of this household and make it the contact the signed-in user acts as. */
export async function createAccountContactAction(firstName: string, lastName: string) {
  const user = await requireMember();
  const { householdId } = user;
  const parsed = personNameSchema.safeParse({ firstName, lastName });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: { householdId, ownerHouseholdId: householdId, ...parsed.data, category: "FAMILY_FRIEND" },
    });
    await tx.user.update({ where: { id: user.id }, data: { contactId: created.id } });
    await tx.activityLogEntry.create({
      data: { entityType: "CONTACT", entityId: created.id, action: "CREATED", source: "MANUAL" },
    });
  });
  revalidatePath("/account");
  revalidatePath("/contacts");
}

export type ChangePasswordState = { error: string } | { ok: true } | null;

/** Change the signed-in user's own password; it needs the current one, and wrong guesses count against the login limiter. */
export async function changePasswordAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await requireMember();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  const { currentPassword, newPassword } = parsed.data;

  const ip = await getClientIp();
  const retryAfter = await loginRetryAfterMinutes(user.email, ip);
  if (retryAfter > 0) {
    return { error: `Too many failed attempts. Try again in ${retryAfter} minute${retryAfter === 1 ? "" : "s"}.` };
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    await recordFailedLogin(user.email, ip);
    return { error: "Your current password is incorrect." };
  }

  // Signs out every other session; this one is re-issued so the user stays signed in.
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), passwordChangedAt: new Date() },
  });
  await startSession(user);
  return { ok: true };
}

export type ChangeEmailState = { error: string } | { sentTo: string } | null;

/**
 * Start changing the login email. Needs the current password (wrong guesses count against the login
 * limiter). A link goes to the NEW address; nothing changes until it is opened.
 */
export async function requestEmailChangeAction(_prev: ChangeEmailState, formData: FormData): Promise<ChangeEmailState> {
  const user = await requireMember();
  const parsed = changeEmailSchema.safeParse({
    newEmail: formData.get("newEmail"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  const { newEmail, password } = parsed.data;
  if (newEmail === user.email) return { error: "That is already your email address." };

  const ip = await getClientIp();
  const loginWait = await loginRetryAfterMinutes(user.email, ip);
  if (loginWait > 0) {
    return { error: `Too many failed attempts. Try again in ${loginWait} minute${loginWait === 1 ? "" : "s"}.` };
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    await recordFailedLogin(user.email, ip);
    return { error: "Your password is incorrect." };
  }

  const wait = await changeEmailRetryAfterMinutes(user.email, ip);
  if (wait > 0) return { error: `Too many requests. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` };
  if (await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } })) {
    return { error: "An account already uses that email address." };
  }

  await recordChangeEmailRequest(user.email, ip);
  try {
    await sendChangeEmailLink(user, newEmail);
  } catch (e) {
    console.error("Email change link failed to send", e);
    return { error: "We couldn't send the email. Try again in a few minutes." };
  }
  return { sentTo: newEmail };
}
