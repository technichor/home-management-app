import { expect, type Page } from "@playwright/test";
import {
  PASSWORD,
  gotoMissing,
  latestEmail,
  linkPath,
  logIn,
  makeSuperuser,
  newOwner,
  newSession,
  onlySuperusers,
  signUp,
  test,
  uniqueEmail,
} from "./helpers";

/** A signed-in owner who has been made a superuser (they log out and in again so nothing is cached). */
async function newSuperuser(page: Page, tag: string) {
  const { email } = await newOwner(page, tag, `The ${tag} Admins`);
  await makeSuperuser(email);
  return email;
}

const today = () => new Date().toISOString().slice(0, 10);

test("the admin area does not exist for anyone who isn't a superuser", async ({ page, browser }) => {
  // Signed out: the plain 404 page. Not a redirect to log in, which would give the address away.
  for (const path of ["/admin", "/admin/users/anything"]) {
    await gotoMissing(page, path);
    await expect(page.getByText(/could not be found/i), path).toBeVisible();
    expect(new URL(page.url()).pathname, "no redirect").toBe(path);
    expect(await page.content()).not.toContain("Recent admin activity");
  }

  // A signed-in ordinary user: the same, and no Admin link anywhere.
  const { email } = await newOwner(page, "ordinary", "The Ordinaries");
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0);
  for (const path of ["/admin", "/admin/users/anything"]) {
    await gotoMissing(page, path);
    await expect(page.getByText(/could not be found/i), path).toBeVisible();
    expect(await page.content()).not.toContain("Recent admin activity");
    expect(await page.content()).not.toContain("Grant superuser access");
  }
  await page.goto("/home");
  expect(await page.content()).not.toMatch(/href="\/admin/);

  // Raw requests (as a script or the app's own data fetches would make them) learn nothing either.
  const variants: Record<string, string>[] = [{}, { RSC: "1" }, { RSC: "1", "Next-Router-Prefetch": "1" }];
  for (const headers of variants) {
    for (const path of ["/admin", "/admin/users/anything"]) {
      const res = await page.request.get(path, { headers });
      const body = await res.text();
      // A plain request gets a real 404. Next's data requests stream the not-found page with a 200,
      // and its router *prefetch* returns only the route skeleton (segment names, no page data), so
      // for those the point is that no admin content, user or address ever comes back.
      if (!headers.RSC) expect(res.status(), path).toBe(404);
      if (headers.RSC && !headers["Next-Router-Prefetch"]) expect(body).toMatch(/NEXT_NOT_FOUND|could not be found/);
      expect(body).not.toContain("Recent admin activity");
      expect(body).not.toContain("Grant superuser access");
      expect(body).not.toContain(email);
    }
  }
  const signedOut = await newSession(browser);
  for (const path of ["/admin", "/admin/users/anything"]) {
    const res = await signedOut.page.request.get(path);
    expect(res.status(), path).toBe(404);
  }
  await signedOut.context.close();

  // The moment they're made a superuser it appears (the check is against the database every time).
  await makeSuperuser(email);
  await page.goto("/home");
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  // Someone else, in another browser, still can't see it.
  const other = await newSession(browser);
  await newOwner(other.page, "stillordinary", "The Stillordinaries");
  await gotoMissing(other.page, "/admin");
  await expect(other.page.getByText(/could not be found/i)).toBeVisible();
  await other.context.close();
});

test("a superuser sees every account with when it was created and last used", async ({ page, browser }) => {
  const admin = await newSuperuser(page, "seeall");

  // A second, ordinary user who has logged in, and a third who signed up but never confirmed.
  const member = await newSession(browser);
  const { email: memberEmail } = await newOwner(member.page, "seen", "The Seens");
  const unconfirmed = await newSession(browser);
  const unconfirmedEmail = uniqueEmail("unconf");
  await signUp(unconfirmed.page, { first: "Una", last: "Confirmed", email: unconfirmedEmail });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  for (const label of ["Users", "Email confirmed", "Active households", "Seen in the last 7 days", "Superusers"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }

  // Each account is listed with its flags and today's dates.
  const memberRow = page.locator("tr", { hasText: memberEmail });
  await expect(memberRow).toContainText("The Seens");
  await expect(memberRow).toContainText(today());
  await expect(page.locator("tr", { hasText: admin })).toContainText("Superuser");
  const unconfirmedRow = page.locator("tr", { hasText: unconfirmedEmail });
  await expect(unconfirmedRow).toContainText("Unconfirmed");
  await expect(unconfirmedRow).toContainText("no household");

  // Search narrows the list.
  await page.getByPlaceholder("Search by email, name or household").fill(unconfirmedEmail);
  await expect(page.locator("tr", { hasText: memberEmail })).toHaveCount(0);
  await expect(unconfirmedRow).toBeVisible();
  await page.getByPlaceholder("Search by email, name or household").fill("zzz-no-such-user");
  await expect(page.getByText("No users match.")).toBeVisible();
  await page.getByPlaceholder("Search by email, name or household").clear();

  // The detail page has the full picture.
  await page.getByRole("link", { name: memberEmail }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: /Casey seen/ })).toBeVisible();
  for (const label of ["Account created", "Last login", "Last seen", "Password last changed", "Household", "Role in household", "Pending reset link"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("The Seens · 1 member")).toBeVisible();
  await expect(page.getByText("Owner", { exact: true })).toBeVisible();
  await expect(page.getByText(`${today()}`).first()).toBeVisible();

  // An id that doesn't exist is a 404 even for a superuser.
  await gotoMissing(page, "/admin/users/not-a-real-id");
  await expect(page.getByText(/could not be found/i)).toBeVisible();

  for (const s of [member, unconfirmed]) await s.context.close();
});

test("a superuser can reset someone's password with a link they pass on (and it is logged)", async ({ page, browser }) => {
  await newSuperuser(page, "resetter");
  const victim = await newSession(browser);
  const { email } = await newOwner(victim.page, "locked", "The Lockeds");
  const other = await newSession(browser);
  await logIn(other.page, email); // another device that is signed in

  await page.goto("/admin");
  await page.getByRole("link", { name: email }).click();
  await page.getByRole("button", { name: "Create a link to copy" }).click();
  const link = await page.getByLabel("Reset link").inputValue();
  expect(link).toMatch(/\/reset-password\/[A-Za-z0-9_-]+$/);
  await expect(page.getByText(/shown only once, works once, and expires in 24 hours/)).toBeVisible();
  // The user's page now says a link is pending.
  await page.reload();
  await expect(page.getByText(/^Yes, expires /)).toBeVisible();

  // The user opens it and chooses a new password; the admin never saw one.
  const fresh = await newSession(browser);
  await fresh.page.goto(new URL(link).pathname);
  await fresh.page.locator('input[name="newPassword"]').fill("chosen-by-the-user-1");
  await fresh.page.locator('input[name="confirmPassword"]').fill("chosen-by-the-user-1");
  await fresh.page.getByRole("button", { name: "Change password" }).click();
  await expect(fresh.page).toHaveURL(/\/login\?reset=1$/);

  // Old password is dead, new one works, and the other device was signed out.
  await logIn(fresh.page, email, PASSWORD);
  await expect(fresh.page.getByText("Incorrect email or password.")).toBeVisible();
  await logIn(fresh.page, email, "chosen-by-the-user-1");
  await expect(fresh.page).toHaveURL(/\/home$/);
  await other.page.goto("/home");
  await expect(other.page).toHaveURL(/\/login$/);

  // The link works once; the pending-link line is gone; the action is in the audit log.
  await fresh.page.goto(new URL(link).pathname);
  await expect(fresh.page.getByText("Link not valid")).toBeVisible();
  await page.reload();
  await expect(page.getByText("None", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/created a password reset link for/)).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText(/created a password reset link for/)).toBeVisible();

  for (const s of [victim, other, fresh]) await s.context.close();
});

test("a superuser can email someone a reset link, worded as coming from an administrator", async ({ page, browser }) => {
  await newSuperuser(page, "emailer");
  const target = await newSession(browser);
  const { email } = await newOwner(target.page, "mailed", "The Maileds");

  await page.goto("/admin");
  await page.getByRole("link", { name: email }).click();
  await page.getByRole("button", { name: "Email them a reset link" }).click();
  await expect(page.getByText(`Reset link emailed to ${email}`)).toBeVisible();

  const mail = await latestEmail(email, "Reset your");
  expect(mail.text).toContain("An administrator started a password reset");
  expect(mail.text).toContain("24 hours");
  await target.page.goto(linkPath(mail, "/reset-password/"));
  await target.page.locator('input[name="newPassword"]').fill("emailed-password-1");
  await target.page.locator('input[name="confirmPassword"]').fill("emailed-password-1");
  await target.page.getByRole("button", { name: "Change password" }).click();
  await expect(target.page).toHaveURL(/\/login\?reset=1$/);
  await page.reload();
  await expect(page.getByText(/emailed a password reset link to/)).toBeVisible();
  await target.context.close();
});

test("granting and revoking superuser access: needs your password, and never removes the last superuser", async ({ page, browser }) => {
  const adminEmail = await newSuperuser(page, "granter");
  const target = await newSession(browser);
  const { email: targetEmail } = await newOwner(target.page, "grantee", "The Grantees");
  await onlySuperusers([adminEmail]); // exactly one, so "the last superuser" is testable

  // The target can't see /admin yet.
  await gotoMissing(target.page, "/admin");
  await expect(target.page.getByText(/could not be found/i)).toBeVisible();

  // The only superuser can't remove themself.
  await page.goto("/admin");
  await page.getByRole("link", { name: adminEmail }).click();
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Revoke superuser access" }).click();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(page.getByText("There must always be at least one superuser.")).toBeVisible();

  // Granting needs the right password...
  await page.goto("/admin");
  await page.getByRole("link", { name: targetEmail }).click();
  await page.getByLabel("Your password").fill("not-my-password");
  await page.getByRole("button", { name: "Grant superuser access" }).click();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(page.getByText("Your password is incorrect.")).toBeVisible();
  await gotoMissing(target.page, "/admin");
  await expect(target.page.getByText(/could not be found/i)).toBeVisible();

  // ...and with it, the target can see the admin area straight away.
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Grant superuser access" }).click();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(page.getByRole("button", { name: "Revoke superuser access" })).toBeVisible();
  await target.page.goto("/admin");
  await expect(target.page.getByRole("heading", { name: "Users" })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText(/granted superuser access to/)).toBeVisible();

  // Now there are two, the original can step down, and loses access at once.
  await page.getByRole("link", { name: adminEmail }).click();
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Revoke superuser access" }).click();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect.poll(async () => {
    await gotoMissing(page, "/admin");
    return page.getByText(/could not be found/i).count();
  }).toBeGreaterThan(0);

  // The other superuser can see who did what.
  await target.page.goto("/admin");
  await expect(target.page.getByText(/revoked superuser access from/)).toBeVisible();
  await target.context.close();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("the admin pages fit a 375px screen", async ({ page }) => {
    const admin = await newSuperuser(page, "phoneadmin");
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("link", { name: admin })).toBeVisible();
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await fits(), "/admin fits").toBe(true);
    await page.getByRole("link", { name: admin }).click();
    await expect(page.getByRole("heading", { name: /Casey/ })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await fits(), "user page fits").toBe(true);
    // The row summary shows when they were last around even though the wider columns are hidden.
    await page.goto("/admin");
    await expect(page.getByText(/^Last seen \d{4}-\d{2}-\d{2}/).first()).toBeVisible();
  });
});
