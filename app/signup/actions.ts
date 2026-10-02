"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { homePathFor, startSession } from "@/lib/auth";
import { signupSchema } from "@/lib/validations";

export type AuthState = { error: string } | null;

const EMAIL_TAKEN = "An account with that email already exists.";

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const { firstName, lastName, email, password } = parsed.data;

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return { error: EMAIL_TAKEN };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName },
      include: { household: { select: { id: true, urlSlug: true, deletedAt: true } } },
    });
  } catch (e) {
    // Lost a race with another signup for the same email.
    if ((e as { code?: string }).code === "P2002") return { error: EMAIL_TAKEN };
    throw e;
  }

  await startSession(user);
  redirect(homePathFor(user));
}
