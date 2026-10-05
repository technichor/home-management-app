import { expect } from "@playwright/test";
import { PASSWORD, latestEmail, linkPath, logIn, newOwner, newSession, test, uniqueEmail } from "./helpers";
import type { Page } from "@playwright/test";

async function requestChange(page: Page, newEmail: string, password = PASSWORD) {
  await page.goto("/account");
  await page.locator('input[name="newEmail"]').fill(newEmail);
  await page.locator('form:has(input[name="newEmail"]) input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Send confirmation link" }).click();
}

test("change your login email: confirm from the new address, the old one is told, old login stops working", async ({ page, browser }) => {
  const { email: oldEmail } = await newOwner(page, "chg", "The Changers");
  const newEmail = uniqueEmail("chgnew");

  // Needs the right password.
  await requestChange(page, newEmail, "not-my-password");
  await expect(page.getByText("Your password is incorrect.")).toBeVisible();

  // The address you already have is refused.
  await requestChange(page, oldEmail);
  await expect(page.getByText("That is already your email address.")).toBeVisible();

  // Typed with capitals and spaces: stored lowercased.
  await requestChange(page, ` ${newEmail.toUpperCase()} `);
  await expect(page.getByText(`Check ${newEmail}`)).toBeVisible();

  // Nothing has changed yet: the old address still logs in, and the account still shows it.
  const other = await newSession(browser);
  await logIn(other.page, oldEmail);
  await expect(other.page).toHaveURL(/\/home(\?.*)?$/);
  await other.page.goto("/account");
  await expect(other.page.getByText(oldEmail).first()).toBeVisible();
  await other.page.getByRole("button", { name: "Log out" }).click();

  // The link goes to the NEW address. Open it signed out (as from a phone) and confirm.
  const mail = await latestEmail(newEmail, "Confirm your new email");
  const link = linkPath(mail, "/change-email/");
  await other.page.goto(link);
  await expect(other.page.getByText(newEmail).first()).toBeVisible();
  await other.page.getByRole("button", { name: "Confirm new email" }).click();
  await expect(other.page).toHaveURL(/\/login\?changed=1$/);
  await expect(other.page.getByText("Email address changed. Log in with your new address.")).toBeVisible();

  // The old address was told what happened.
  const notice = await latestEmail(oldEmail, "email address was changed");
  expect(notice.text).toContain(oldEmail);
  expect(notice.text).toContain(newEmail);

  // Old address no longer logs in; the new one does (and counts as verified: straight to the app).
  await logIn(other.page, oldEmail);
  await expect(other.page.getByText("Incorrect email or password.")).toBeVisible();
  await logIn(other.page, newEmail);
  await expect(other.page).toHaveURL(/\/home(\?.*)?$/);
  await other.page.goto("/account");
  await expect(other.page.getByText(newEmail).first()).toBeVisible();

  // The first browser session was not signed out by the change.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(newEmail).first()).toBeVisible();

  // The link works once.
  await other.page.goto(link);
  await expect(other.page.getByText("Link not valid")).toBeVisible();
  await other.context.close();
});

test("opening the confirmation link while signed in returns you to your account", async ({ page }) => {
  await newOwner(page, "chgin", "The Signedins");
  const newEmail = uniqueEmail("chgin2");
  await requestChange(page, newEmail);
  await expect(page.getByText(`Check ${newEmail}`)).toBeVisible();

  await page.goto(linkPath(await latestEmail(newEmail, "Confirm your new email"), "/change-email/"));
  await page.getByRole("button", { name: "Confirm new email" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(newEmail).first()).toBeVisible();
});

test("an address that another account uses is refused, and a newer request replaces an older link", async ({ page, browser }) => {
  const taken = await newSession(browser);
  const { email: takenEmail } = await newOwner(taken.page, "taken", "The Takens");
  await taken.context.close();

  await newOwner(page, "chgtwo", "The Twos");
  await requestChange(page, takenEmail);
  await expect(page.getByText("An account already uses that email address.")).toBeVisible();

  const first = uniqueEmail("chga");
  const second = uniqueEmail("chgb");
  await requestChange(page, first);
  await expect(page.getByText(`Check ${first}`)).toBeVisible();
  const firstLink = linkPath(await latestEmail(first, "Confirm your new email"), "/change-email/");
  await requestChange(page, second);
  await expect(page.getByText(`Check ${second}`)).toBeVisible();

  // The first link was replaced; the second one works.
  await page.goto(firstLink);
  await expect(page.getByText("Link not valid")).toBeVisible();
  await page.goto(linkPath(await latestEmail(second, "Confirm your new email"), "/change-email/"));
  await page.getByRole("button", { name: "Confirm new email" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(second).first()).toBeVisible();
});
