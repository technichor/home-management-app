import { readFileSync } from "node:fs";
import { expect, type Browser, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-1";

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

/** From /onboarding: create a household and land in the app. Returns the household's URL slug. */
export async function createHousehold(page: Page, name: string): Promise<string> {
  await page.getByPlaceholder("e.g. The Reynolds Family").fill(name);
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/(?!onboarding$)[a-z0-9-]+$/);
  return new URL(page.url()).pathname.split("/")[1];
}

/** A new user who has signed up, confirmed their email and created a household. */
export async function newOwner(page: Page, tag: string, householdName: string) {
  const email = uniqueEmail(tag);
  await signUp(page, { first: "Casey", last: tag, email });
  await confirmEmail(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  const slug = await createHousehold(page, householdName);
  return { email, slug };
}

/** A separate browser session (its own cookies), so two users can be signed in at once. */
export async function newSession(browser: Browser) {
  const context = await browser.newContext({ baseURL: `http://localhost:${process.env.E2E_APP_PORT ?? 3100}` });
  return { context, page: await context.newPage() };
}

/** Pick an option in an Ant Design Select by its field label and the option's text. */
export async function choose(page: Page, label: string | RegExp, optionText: string) {
  await page.getByLabel(label).click();
  await page.locator(`.ant-select-item-option[title="${optionText}"]`).click();
}

/** Fill the "Add contact" form for a Service Provider (no household needed) and save it. */
export async function addServiceProvider(page: Page, slug: string, first: string, last: string, extra: { address?: string } = {}) {
  await page.goto(`/${slug}/contacts/new`);
  await page.getByLabel("First name").fill(first);
  await page.getByLabel("Last name").fill(last);
  await choose(page, "Category", "Service Provider");
  if (extra.address) await page.getByLabel(/^Address/).fill(extra.address);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page).toHaveURL(/\/contacts\/(?!new$)[a-z0-9]+$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}
