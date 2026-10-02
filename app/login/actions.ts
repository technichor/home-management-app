"use server";

import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { homePathFor, startSession } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import { sessionOptions, SessionData } from "@/lib/session";
import { userLoginSchema } from "@/lib/validations";
import type { AuthState } from "@/app/signup/actions";

// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = "$2b$12$4EjNrFT5qfBOb4UW01//NOOBcXT2hxiu7YJfpubSi346C3nZ9sLHC";

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = userLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { household: { select: { id: true, urlSlug: true, deletedAt: true } } },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    return { error: "Incorrect email or password." };
  }

  await startSession(user);
  redirect(safeNext(formData.get("next")) ?? homePathFor(user));
}

export async function logoutAction() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.destroy();
  redirect("/login");
}
