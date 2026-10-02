// One-off: create the first user (an OWNER) for a household that existed before user accounts.
//
//   ADOPT_PASSWORD='choose-a-password' node --env-file=.env.local scripts/adopt-household.mjs \
//     you@example.com "<household name>" "First" "Last"
//
// The user is linked to the household's existing Family & Friend contact with the same name when
// there is one (and nobody else is linked to it), otherwise to a new contact. The password
// comes from the environment so it stays out of shell history.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, householdName, firstName, lastName] = process.argv.slice(2);
const password = process.env.ADOPT_PASSWORD;
if (!email || !householdName || !firstName || !lastName || !password || password.length < 8) {
  console.error("Usage: ADOPT_PASSWORD='(8+ chars)' node --env-file=.env.local scripts/adopt-household.mjs <email> <household name> <first> <last>");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const normalized = email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: normalized } })) throw new Error(`A user with ${normalized} already exists.`);
  const household = await prisma.household.findFirst({ where: { displayName: householdName, deletedAt: null } });
  if (!household) throw new Error(`No household named "${householdName}".`);

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const match = await tx.contact.findFirst({
      where: { householdId: household.id, category: "FAMILY_FRIEND", deletedAt: null, firstName, lastName, user: null },
    });
    let contactId = match?.id;
    if (!contactId) {
      const contact = await tx.contact.create({
        data: { householdId: household.id, ownerHouseholdId: household.id, firstName, lastName, category: "FAMILY_FRIEND" },
      });
      contactId = contact.id;
    }
    return tx.user.create({
      data: { email: normalized, passwordHash, firstName, lastName, role: "OWNER", householdId: household.id, contactId, emailVerifiedAt: new Date() },
    });
  });
  console.log(`Created owner ${user.email} for "${household.displayName}". Log in at /login.`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
