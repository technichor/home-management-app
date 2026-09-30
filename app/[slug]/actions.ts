"use server";

import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";

export async function loginAction(slug: string, formData: FormData) {
  const password = formData.get("password") as string;

  if (!password) {
    redirect(`/${slug}?error=Password+is+required`);
  }

  const household = await prisma.household.findUnique({
    where: { urlSlug: slug },
    select: { id: true, passwordHash: true, deletedAt: true },
  });

  if (!household || !household.passwordHash || household.deletedAt) {
    redirect(`/${slug}?error=Household+not+found`);
  }

  const valid = await bcrypt.compare(password, household.passwordHash);
  if (!valid) {
    redirect(`/${slug}?error=Incorrect+password`);
  }

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  session.householdId = household.id;
  session.householdSlug = slug;
  await session.save();

  redirect(`/${slug}/contacts`);
}

export async function logoutAction() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  const slug = session.householdSlug;
  session.destroy();
  redirect(slug ? `/${slug}` : "/");
}
