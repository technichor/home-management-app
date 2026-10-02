// One-off: create the first user (an OWNER) for a household that existed before user accounts.
//
//   ADOPT_PASSWORD='choose-a-password' node --env-file=.env.local scripts/adopt-household.mjs \
//     you@example.com <household-slug> "First" "Last"
//
// The user is linked to the household's existing account contact when it has one, otherwise to a
// new contact. The password comes from the environment so it stays out of shell history.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, slug, firstName, lastName] = process.argv.slice(2);
const password = process.env.ADOPT_PASSWORD;
if (!email || !slug || !firstName || !lastName || !password || password.length < 8) {
  console.error("Usage: ADOPT_PASSWORD='(8+ chars)' node --env-file=.env.local scripts/adopt-household.mjs <email> <slug> <first> <last>");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const normalized = email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: normalized } })) throw new Error(`A user with ${normalized} already exists.`);
  const household = await prisma.household.findUnique({ where: { urlSlug: slug } });
  if (!household) throw new Error(`No household with slug "${slug}".`);

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    let contactId = household.accountContactId;
    if (contactId && (await tx.user.findUnique({ where: { contactId } }))) contactId = null;
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
