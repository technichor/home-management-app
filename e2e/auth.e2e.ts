import { expect } from "@playwright/test";
import {
  PASSWORD,
  confirmEmail,
  createHousehold,
  latestEmail,
  linkPath,
  logIn,
  newOwner,
  newSession,
  signUp,
  test,
  uniqueEmail,
} from "./helpers";

test("sign up, confirm the email, create a household and land in the app", async ({ page }) => {
  const email = uniqueEmail("signup");
  await signUp(page, { first: "Sam", last: "Signup", email });
  await expect(page.getByText(`We sent a confirmation link to ${email}`)).toBeVisible();

  // Until the email is confirmed nothing else is reachable.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/verify-email$/);

  await confirmEmail(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await createHousehold(page, "The Signups");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing is planned this week yet, Sam.");
  await expect(page.getByText("The Signups").first()).toBeVisible();
});

test("a confirmation link works once", async ({ page, browser }) => {
  const email = uniqueEmail("once");
  await signUp(page, { first: "Olive", last: "Once", email });
  const link = linkPath(await latestEmail(email, "Confirm your email"), "/verify-email/");
  await confirmEmail(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);

  const other = await newSession(browser);
  await other.page.goto(link);
  await expect(other.page.getByText("Link not valid")).toBeVisible();
  await other.context.close();
});

test("log in, log out, and a wrong password gets a plain error", async ({ page }) => {
  const { email } = await newOwner(page, "login", "The Logins");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await logIn(page, email, "not-the-password");
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();

  await logIn(page, email);
  await expect(page).toHaveURL(/\/home(\?.*)?$/);
});

test("signed-out visitors are sent to log in", async ({ page }) => {
  await page.goto("/contacts");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login$/);
});

test("forgot password: emailed link sets a new password and signs out other sessions", async ({ page, browser }) => {
  const { email } = await newOwner(page, "forgot", "The Forgetfuls");

  // A second device that stays signed in on the old password.
  const device = await newSession(browser);
  await logIn(device.page, email);
  await expect(device.page).toHaveURL(/\/home(\?.*)?$/);

  const fresh = await newSession(browser);
  await fresh.page.goto("/forgot-password");
  await fresh.page.locator('input[name="email"]').fill(email);
  await fresh.page.getByRole("button", { name: "Send reset link" }).click();
  await expect(fresh.page.getByText("Check your email")).toBeVisible();

  const mail = await latestEmail(email, "Reset your");
  await fresh.page.goto(linkPath(mail, "/reset-password/"));
  await fresh.page.locator('input[name="newPassword"]').fill("a-brand-new-password");
  await fresh.page.locator('input[name="confirmPassword"]').fill("a-brand-new-password");
  await fresh.page.getByRole("button", { name: "Change password" }).click();
  await expect(fresh.page).toHaveURL(/\/login\?reset=1$/);
  await expect(fresh.page.getByText("Password changed. Log in with your new password.")).toBeVisible();

  await logIn(fresh.page, email, PASSWORD);
  await expect(fresh.page.getByText("Incorrect email or password.")).toBeVisible();
  await logIn(fresh.page, email, "a-brand-new-password");
  await expect(fresh.page).toHaveURL(/\/home(\?.*)?$/);

  // The old device was signed out by the reset.
  await device.page.goto("/contacts");
  await expect(device.page).toHaveURL(/\/login$/);

  // A reset link can't be reused.
  await fresh.page.goto(linkPath(mail, "/reset-password/"));
  await expect(fresh.page.getByText("Link not valid")).toBeVisible();
  await fresh.context.close();
  await device.context.close();
});

test("change password on the account page signs out other sessions but not this one", async ({ page, browser }) => {
  const { email } = await newOwner(page, "change", "The Changers");
  const device = await newSession(browser);
  await logIn(device.page, email);
  await expect(device.page).toHaveURL(/\/home(\?.*)?$/);

  await page.goto(`/account`);
  await page.locator('input[name="currentPassword"]').fill(PASSWORD);
  await page.locator('input[name="newPassword"]').fill("changed-password-9");
  await page.locator('input[name="confirmPassword"]').fill("changed-password-9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  await page.goto(`/contacts`);
  await expect(page).toHaveURL(new RegExp(`/contacts$`)); // this session survived
  await device.page.goto(`/contacts`);
  await expect(device.page).toHaveURL(/\/login$/); // the other one did not
  await device.context.close();
});

test("five wrong passwords lock the account out for a while", async ({ page }) => {
  const { email } = await newOwner(page, "lock", "The Lockouts");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  for (let i = 0; i < 5; i++) {
    await logIn(page, email, `wrong-password-${i}`);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
  await logIn(page, email); // even the right password is refused now
  await expect(page.getByText(/Too many failed attempts\. Try again in \d+ minutes?\./)).toBeVisible();
});
