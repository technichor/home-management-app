import { expect } from "@playwright/test";
import { addServiceProvider, newOwner, newSession, gotoMissing, test } from "./helpers";

test("two households sync and message each other", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  await newOwner(a.page, "synca", "The Syncas");
  const ownerB = await newOwner(b.page, "syncb", "The Syncbs");

  // A records B's person as a contact, then asks to sync with them.
  const contactId = await addServiceProvider(a.page, "Bea", "Syncb");
  await a.page.goto(`/contacts/${contactId}`);
  await a.page.getByLabel("Email address").fill(ownerB.email);
  await a.page.getByRole("button", { name: "Request sync" }).click();
  const link = await a.page.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);

  // A can't answer their own invite.
  await a.page.goto(new URL(link).pathname);
  await expect(a.page.getByText("This is your own invite")).toBeVisible();

  // B opens it and accepts.
  await b.page.goto(new URL(link).pathname);
  await expect(b.page.getByText("The Syncas wants to sync with your household")).toBeVisible();
  await b.page.getByRole("button", { name: "Accept" }).click();
  await expect(b.page.getByText(/You are synced with The Syncas|Open messages/).first()).toBeVisible();

  // Both now see a shared conversation.
  await b.page.goto(`/messages`);
  await b.page.getByText("The Syncas & The Syncbs").click();
  await expect(b.page).toHaveURL(new RegExp(`/messages/[a-z0-9]+`));
  await b.page.getByPlaceholder(/Write a message/).fill("Hello from the Syncbs");
  await b.page.getByRole("button", { name: "Send" }).click();
  await expect(b.page.getByText("Hello from the Syncbs")).toBeVisible();

  // It arrives for A (the page polls, so a reload is enough here), labelled with B's household.
  await a.page.goto(`/messages`);
  await a.page.getByText("The Syncas & The Syncbs").click();
  await expect(a.page.getByText("Hello from the Syncbs")).toBeVisible();
  await expect(a.page.getByText("The Syncbs").first()).toBeVisible();

  // The invite can't be answered a second time.
  await b.page.goto(new URL(link).pathname);
  await expect(b.page.getByText(/You are synced with The Syncas/)).toBeVisible();

  // An outsider can't open the shared conversation by guessing its URL.
  const conversationPath = new URL(a.page.url()).pathname;
  const outsider = await newSession(browser);
  await newOwner(outsider.page, "syncc", "The Syncc Outsiders");
  await gotoMissing(outsider.page, conversationPath);
  await expect(outsider.page.getByText(/could not be found/i)).toBeVisible();
  await expect(outsider.page.getByText("Hello from the Syncbs")).toHaveCount(0);

  for (const s of [a, b, outsider]) await s.context.close();
});

test("a pending sync invite can be revoked, and the contact invited again", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  await newOwner(a.page, "revoka", "The Revokas");
  const ownerB = await newOwner(b.page, "revokb", "The Revokbs");

  const contactId = await addServiceProvider(a.page, "Rae", "Revokb");
  await a.page.goto(`/contacts/${contactId}`);
  await a.page.getByLabel("Email address").fill(ownerB.email);
  await a.page.getByRole("button", { name: "Request sync" }).click();
  const firstLink = new URL(await a.page.getByLabel("Invite link").inputValue()).pathname;

  // The sender sees it's pending and revokes it (after confirming).
  await expect(a.page.getByText("is waiting for their household to accept")).toBeVisible();
  await a.page.getByRole("button", { name: "Revoke invite" }).click();
  await a.page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(a.page.getByText("The last sync was revoked.")).toBeVisible();
  await expect(a.page.getByLabel("Invite link")).toHaveCount(0);

  // The recipient's link is dead: they're told so and can't accept.
  await b.page.goto(firstLink);
  await expect(b.page.getByText("This invite was revoked.")).toBeVisible();
  await expect(b.page.getByRole("button", { name: "Accept" })).toHaveCount(0);

  // The sender can invite them again; the new link works, the old one still doesn't.
  await a.page.getByRole("button", { name: "Request sync" }).click();
  const secondLink = new URL(await a.page.getByLabel("Invite link").inputValue()).pathname;
  expect(secondLink).not.toBe(firstLink);
  await b.page.goto(firstLink);
  await expect(b.page.getByText("This invite was revoked.")).toBeVisible();
  await b.page.goto(secondLink);
  await b.page.getByRole("button", { name: "Accept" }).click();
  await expect(b.page.getByText(/You are synced with The Revokas|Open messages/).first()).toBeVisible();

  // Once accepted there is nothing left to revoke.
  await a.page.reload();
  await expect(a.page.getByText(/Synced with The Revokbs/)).toBeVisible();
  await expect(a.page.getByRole("button", { name: "Revoke invite" })).toHaveCount(0);

  for (const s of [a, b]) await s.context.close();
});
