"use server";

import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import { createHouseholdSchema } from "@/lib/validations";

export type SetupState = { error: string } | null;

// Contacts and households are shared across every account, so who may create an account
// is the only thing keeping strangers out of the data. Signup needs the SETUP_CODE the
// owner configured; with no SETUP_CODE set, signup is closed.
function setupCodeMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createHouseholdAction(
  _prev: SetupState,
  formData: FormData
): Promise<SetupState> {
  const expectedCode = process.env.SETUP_CODE;
  if (!expectedCode) {
    return { error: "Account setup is turned off on this site." };
  }
  if (!setupCodeMatches((formData.get("setupCode") as string | null) ?? "", expectedCode)) {
    return { error: "Incorrect setup code." };
  }

  const raw = {
    firstName: formData.get("firstName") as string,
    lastName: formData.get("lastName") as string,
    displayName: formData.get("displayName") as string,
    urlSlug: formData.get("urlSlug") as string,
    password: formData.get("password") as string,
  };

  const parsed = createHouseholdSchema.safeParse(raw);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message).join(", ");
    return { error: messages };
  }

  const { firstName, lastName, displayName, urlSlug, password } = parsed.data;

  const existing = await prisma.household.findUnique({ where: { urlSlug } });
  if (existing) {
    return {
      error: `The slug "${urlSlug}" is already taken. Choose a different one.`,
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // The account acts as one Contact (its message sender, and the head who answers sync
  // invites), so the household, that contact, and the link between them are created together.
  const household = await prisma.$transaction(async (tx) => {
    const created = await tx.household.create({
      data: {
        displayName,
        urlSlug,
        passwordHash,
        headOfHousehold: `${firstName} ${lastName}`,
      },
    });
    const owner = await tx.contact.create({
      data: { householdId: created.id, firstName, lastName, category: "FAMILY_FRIEND" },
    });
    await tx.household.update({ where: { id: created.id }, data: { accountContactId: owner.id } });
    await tx.activityLogEntry.createMany({
      data: [
        { entityType: "HOUSEHOLD", entityId: created.id, action: "CREATED", source: "MANUAL" },
        { entityType: "CONTACT", entityId: owner.id, action: "CREATED", source: "MANUAL" },
      ],
    });
    return created;
  });

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  session.householdId = household.id;
  session.householdSlug = urlSlug;
  await session.save();

  redirect(`/${urlSlug}/contacts`);
}
