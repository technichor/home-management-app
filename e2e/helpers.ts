import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { test as base, expect, type Browser, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-1";

// Every page.goto fails the test if it lands on the app's 404 page, so a test can't quietly pass
// against a URL that no longer exists. A test that is *meant* to see a 404 uses gotoMissing().
function guardNotFound(page: Page): Page {
  const raw = page.goto.bind(page);
  (page as unknown as { __rawGoto: typeof raw }).__rawGoto = raw;
  page.goto = (async (url: string, options?: Parameters<typeof raw>[1]) => {
    const response = await raw(url, options);
    await expect(
      page.getByRole("heading", { name: "This page could not be found." }),
      `${url} unexpectedly shows the 404 page`
    ).toHaveCount(0);
    return response;
  }) as typeof page.goto;
  return page;
}

/** Playwright's `test`, with the 404 guard on the default `page`. */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await provide(guardNotFound(page));
  },
});

/** Visit a URL that is supposed to be missing (no 404 guard). */
export async function gotoMissing(page: Page, url: string) {
  return (page as unknown as { __rawGoto: Page["goto"] }).__rawGoto(url);
}

let counter = 0;
/** An address no other test uses (they all share one database). */
export function uniqueEmail(tag: string): string {
  counter += 1;
  return `${tag}-${Date.now().toString(36)}-${counter}@example.test`;
}

type Mail = { to: string; subject: string; text: string };

function outbox(): Mail[] {
  try {
    return readFileSync(process.env.EMAIL_OUTBOX_FILE!, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return []; // nothing sent yet
  }
}

/** The newest email sent to this address whose subject contains the text (waits for it to arrive). */
export async function latestEmail(to: string, subjectPart: string): Promise<Mail> {
  let found: Mail | undefined;
  await expect
    .poll(
      () => {
        found = outbox()
          .filter((m) => m.to === to && m.subject.includes(subjectPart))
          .at(-1);
        return found !== undefined;
      },
      { message: `an email "${subjectPart}" to ${to}`, timeout: 15_000 }
    )
    .toBe(true);
  return found!;
}

/** The path (e.g. /verify-email/abc) of the first link in an email that starts with the given prefix. */
export function linkPath(mail: Mail, prefix: string): string {
  const match = mail.text.match(new RegExp(`https?://[^/\\s]+(${prefix}[^\\s]*)`));
  if (!match) throw new Error(`No ${prefix} link in the email:\n${mail.text}`);
  return match[1];
}

export async function signUp(page: Page, who: { first: string; last: string; email: string; password?: string }) {
  await page.goto("/signup");
  await page.locator('input[name="firstName"]').fill(who.first);
  await page.locator('input[name="lastName"]').fill(who.last);
  await page.locator('input[name="email"]').fill(who.email);
  await page.locator('input[name="password"]').fill(who.password ?? PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
}

/** Open the emailed link and confirm. Leaves the page on /onboarding when the user is logged in. */
export async function confirmEmail(page: Page, email: string) {
  const mail = await latestEmail(email, "Confirm your email");
  await page.goto(linkPath(mail, "/verify-email/"));
  await page.getByRole("button", { name: "Confirm email" }).click();
  // Wait for the confirmation to finish (it redirects) before the caller moves on.
  await expect(page).toHaveURL(/\/(onboarding|login)/);
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** From /onboarding: create a household and land on the home page. */
export async function createHousehold(page: Page, name: string) {
  await page.getByPlaceholder("e.g. The Reynolds Family").fill(name);
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/** A new user who has signed up, confirmed their email and created a household. */
export async function newOwner(page: Page, tag: string, householdName: string) {
  const email = uniqueEmail(tag);
  await signUp(page, { first: "Casey", last: tag, email });
  await confirmEmail(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await createHousehold(page, householdName);
  return { email };
}

/** A separate browser session (its own cookies), so two users can be signed in at once. */
export async function newSession(browser: Browser) {
  const context = await browser.newContext({ baseURL: `http://localhost:${process.env.E2E_APP_PORT ?? 3100}` });
  return { context, page: guardNotFound(await context.newPage()) };
}

/** Pick an option in an Ant Design Select by its field label and the option's text. */
export async function choose(page: Page, label: string | RegExp, optionText: string) {
  await page.getByLabel(label).click();
  await page.locator(`.ant-select-item-option[title="${optionText}"]`).click();
}

/** Fill the "Add contact" form for a Service Provider (no household needed) and save it. */
export async function addServiceProvider(page: Page, first: string, last: string, extra: { address?: string } = {}) {
  await page.goto(`/contacts/new`);
  await page.getByLabel("First name").fill(first);
  await page.getByLabel("Last name").fill(last);
  await choose(page, "Category", "Service Provider");
  if (extra.address) await page.getByLabel(/^Address/).fill(extra.address);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page).toHaveURL(/\/contacts\/(?!new$)[a-z0-9]+$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/**
 * Make an existing user a superuser by writing to the test database directly (the only other way
 * is through /admin itself, and the first superuser has to come from somewhere).
 */
export async function makeSuperuser(email: string) {
  const prisma = new PrismaClient();
  try {
    await prisma.user.update({ where: { email }, data: { isSuperuser: true } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Set exactly this set of users as the only superusers (so "the last superuser" can be tested). */
export async function onlySuperusers(emails: string[]) {
  const prisma = new PrismaClient();
  try {
    await prisma.user.updateMany({ data: { isSuperuser: false } });
    await prisma.user.updateMany({ where: { email: { in: emails } }, data: { isSuperuser: true } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Put a failed-send entry in the email log (a real failure can't happen against the test outbox). */
export async function seedFailedEmail(to: string, error: string) {
  const prisma = new PrismaClient();
  try {
    await prisma.emailLogEntry.create({ data: { toAddress: to, subject: "Reset your Domata password", status: "FAILED", error } });
  } finally {
    await prisma.$disconnect();
  }
}

/** A second person who joins the owner's household by invite link. Returns their session and full name. */
export async function addMember(browser: Browser, ownerPage: Page, tag: string) {
  await ownerPage.goto(`/household`);
  await ownerPage.getByRole("button", { name: "Create invite link" }).click();
  const link = await ownerPage.locator("input[readonly]").inputValue();
  const session = await newSession(browser);
  const email = uniqueEmail(tag);
  await signUp(session.page, { first: "Joiner", last: tag, email });
  await confirmEmail(session.page, email);
  await session.page.goto(new URL(link).pathname);
  await session.page.getByRole("button", { name: "Join this household" }).click();
  await expect(session.page).toHaveURL(/\/home$/);
  return { ...session, email, name: `Joiner ${tag}` };
}

/** Two households become synced: A records B's owner as a contact and invites them, B accepts. */
export async function syncHouseholds(a: Page, b: Page, bEmail: string, tag: string) {
  const contactId = await addServiceProvider(a, "Bea", tag);
  await a.goto(`/contacts/${contactId}`);
  await a.getByLabel("Email address").fill(bEmail);
  await a.getByRole("button", { name: "Request sync" }).click();
  const link = await a.getByLabel("Invite link").inputValue();
  await b.goto(new URL(link).pathname);
  await b.getByRole("button", { name: "Accept" }).click();
  await expect(b.getByText(/You are synced with|Open messages/).first()).toBeVisible();
}

/** Start a channel from /messages with the named people (from the picker's option titles). */
export async function newChannel(page: Page, name: string, people: string[]) {
  await page.goto(`/messages`);
  await page.getByRole("button", { name: "New channel" }).click();
  await page.getByPlaceholder("Name, e.g. Weekend plans").fill(name);
  // The dropdown of a multiple select stays open between picks.
  await page.getByRole("dialog").getByRole("combobox").click();
  for (const person of people) await page.locator(`.ant-select-item-option[title="${person}"]`).click();
  await page.locator(".ant-modal-title").click(); // close the dropdown
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/messages\/[a-z0-9]+$/);
}

/** Put a library meal on the plan by writing to the test database directly (the planner itself is tested separately). */
export async function seedPlanEntry(email: string, mealName: string, date: string, slot: "BREAKFAST" | "LUNCH" | "DINNER" = "DINNER") {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const meal = await prisma.meal.findFirstOrThrow({ where: { householdId: user.householdId!, name: mealName } });
    await prisma.mealPlanEntry.create({
      data: { householdId: user.householdId!, mealId: meal.id, date: new Date(`${date}T00:00:00Z`), slot },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** The household's plan entries as stored, for checking what a delete left behind. */
export async function planEntries(email: string) {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const rows = await prisma.mealPlanEntry.findMany({ where: { householdId: user.householdId! }, orderBy: { date: "asc" } });
    return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), slot: r.slot, mealId: r.mealId, text: r.text }));
  } finally {
    await prisma.$disconnect();
  }
}
