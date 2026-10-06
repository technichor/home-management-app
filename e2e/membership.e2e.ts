import { expect } from "@playwright/test";
import { confirmEmail, newOwner, newSession, signUp, uniqueEmail, test } from "./helpers";

async function newVerifiedUser(page: import("@playwright/test").Page, tag: string) {
  const email = uniqueEmail(tag);
  await signUp(page, { first: "Joiner", last: tag, email });
  await confirmEmail(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  return email;
}

test("an owner invites someone by link; they join, then the owner removes them", async ({ browser }) => {
  const owner = await newSession(browser);
  const guest = await newSession(browser);
  await newOwner(owner.page, "host", "The Hosts");

  // Owner makes a one-time link.
  await owner.page.goto(`/household`);
  await owner.page.getByRole("button", { name: "Create invite link" }).click();
  const link = await owner.page.locator('input[readonly]').inputValue();
  expect(link).toMatch(/\/join\/[A-Za-z0-9_-]+$/);

  // A signed-out visitor is asked to log in, and comes back to the invite after signing up.
  const path = new URL(link).pathname;
  await guest.page.goto(path);
  await expect(guest.page.getByText("Join The Hosts")).toBeVisible();
  await guest.page.getByRole("link", { name: "Create an account" }).click();
  await expect(guest.page).toHaveURL(/\/signup\?next=/);
  const email = uniqueEmail("guest");
  await guest.page.locator('input[name="firstName"]').fill("Gus");
  await guest.page.locator('input[name="lastName"]').fill("Guest");
  await guest.page.locator('input[name="email"]').fill(email);
  await guest.page.locator('input[name="password"]').fill("e2e-password-1");
  await guest.page.getByRole("button", { name: "Create account" }).click();

  // Unconfirmed: the invite page makes them confirm first.
  await expect(guest.page.getByText(/Confirm your email address first/)).toBeVisible();
  await confirmEmail(guest.page, email);
  await guest.page.goto(path);
  await guest.page.getByRole("button", { name: "Join this household" }).click();
  await expect(guest.page).toHaveURL(/\/home(\?.*)?$/);

  // The link was single-use.
  const third = await newSession(browser);
  await newVerifiedUser(third.page, "third");
  await third.page.goto(path);
  await expect(third.page.getByText(/already used or withdrawn/)).toBeVisible();

  // Both are members now.
  await owner.page.goto(`/household`);
  await expect(owner.page.getByText("Gus Guest")).toBeVisible();

  // Removing the guest cuts off their access straight away.
  await owner.page.getByRole("button", { name: "Remove" }).click();
  await owner.page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(owner.page.getByText("Gus Guest")).toHaveCount(0);
  await guest.page.goto(`/contacts`);
  await expect(guest.page).toHaveURL(/\/onboarding$/);

  for (const s of [owner, guest, third]) await s.context.close();
});

test("someone with a join code asks to join and an owner approves", async ({ browser }) => {
  const owner = await newSession(browser);
  const asker = await newSession(browser);
  await newOwner(owner.page, "coder", "The Coders");

  await owner.page.goto(`/household`);
  await owner.page.getByRole("button", { name: "Turn on join requests" }).click();
  const code = await owner.page.locator(".ant-typography code").first().innerText();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  await newVerifiedUser(asker.page, "asker");
  await asker.page.getByPlaceholder("Household code").fill(code);
  await asker.page.getByRole("button", { name: "Ask to join" }).click();
  await expect(asker.page.getByText("Waiting for approval from The Coders")).toBeVisible();

  await owner.page.reload();
  await owner.page.getByRole("button", { name: "Approve" }).click();
  await expect(owner.page.getByText("Asker")).toBeVisible();

  // Once the approval is saved, the asker is in.
  await expect(async () => {
    await asker.page.goto("/onboarding");
    await expect(asker.page).toHaveURL(/\/home(\?.*)?$/, { timeout: 2_000 });
  }).toPass();

  for (const s of [owner, asker]) await s.context.close();
});
