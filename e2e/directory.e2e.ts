import { test, expect } from "@playwright/test";
import { choose, newOwner } from "./helpers";

test("households and contacts: add, edit, remove and restore", async ({ page }) => {
  const { slug } = await newOwner(page, "dir", "The Directors");

  // --- Add a household ---
  await page.goto(`/${slug}/contacts/households`);
  await page.getByRole("link", { name: "Add household" }).click();
  await page.getByLabel("Household name").fill("The Joneses");
  await page.getByLabel(/^Mailing address/).fill("1 Main St");
  await page.getByRole("button", { name: "Add household" }).click();
  await expect(page.getByRole("heading", { name: "The Joneses" })).toBeVisible();
  await expect(page.getByText("1 Main St")).toBeVisible();

  // --- Add a Family & Friend contact into it; the address is the household's ---
  await page.goto(`/${slug}/contacts/new`);
  await page.getByLabel("First name").fill("Jo");
  await page.getByLabel("Last name").fill("Jones");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Choose the household this person belongs to")).toBeVisible();
  await choose(page, "Household", "The Joneses");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: "Jo Jones" })).toBeVisible();
  await expect(page.getByText("Address (from household)")).toBeVisible();
  await expect(page.getByText("1 Main St")).toBeVisible();

  // --- Edit it; the change shows and is logged ---
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel(/^Nickname/).fill("Jojo");
  await page.getByLabel(/^Mobile phone/).fill("555-0100");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: /Jo Jones/ })).toContainText("(Jojo)");
  await expect(page.getByText("555-0100")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Updated" })).toBeVisible();

  // An invalid email is rejected with a message on the field.
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel(/^Primary email/).fill("a@b");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter a valid email address").first()).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // --- The people list finds it by search ---
  await page.goto(`/${slug}/contacts`);
  await expect(page.getByRole("link", { name: /Jo Jones/ })).toBeVisible();

  // --- Remove it, see it in Removed, restore it ---
  await page.getByRole("link", { name: /Jo Jones/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/contacts$`));
  await expect(page.getByRole("link", { name: /Jo Jones/ })).toHaveCount(0);

  await page.goto(`/${slug}/contacts/removed`);
  await expect(page.getByText("Jo Jones")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();
  await page.goto(`/${slug}/contacts`);
  await expect(page.getByRole("link", { name: /Jo Jones/ })).toBeVisible();

  // --- Removing the household warns about its contacts ---
  await page.goto(`/${slug}/contacts/households`);
  await page.getByRole("link", { name: /The Joneses/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText(/1 Family & Friend contact will lose their inherited address/)).toBeVisible();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/contacts/households$`));
  await expect(page.getByRole("link", { name: /The Joneses/ })).toHaveCount(0);
});

test("your own household can be edited but not removed", async ({ page }) => {
  const { slug } = await newOwner(page, "own", "The Owners");
  await page.goto(`/${slug}/contacts/households`);
  await expect(page.getByText("Our household")).toBeVisible();
  await page.getByRole("link", { name: /The Owners/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await page.getByLabel(/^Mailing address/).fill("9 Home Rd");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("9 Home Rd")).toBeVisible();
});

test("a household member's own profile can't be removed as a contact", async ({ page }) => {
  const { slug } = await newOwner(page, "self", "The Selves");
  await page.goto(`/${slug}/contacts`);
  await page.getByRole("link", { name: /Casey self/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(page.getByText(/household member's own profile/)).toBeVisible();
});

test("CSV export and re-import round-trips through the real app", async ({ page }) => {
  const { slug } = await newOwner(page, "csv", "The Csvs");
  await page.goto(`/${slug}/contacts/new`);
  await page.getByLabel("First name").fill("Roundtrip");
  await page.getByLabel("Last name").fill("Contact");
  await choose(page, "Category", "Service Provider");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: "Roundtrip Contact" })).toBeVisible();

  const households = await (await page.request.get(`/${slug}/contacts/api/export?file=households`)).text();
  const contacts = await (await page.request.get(`/${slug}/contacts/api/export?file=contacts`)).text();
  expect(contacts).toContain("Roundtrip");
  expect(households + contacts).not.toMatch(/passwordHash|url_slug|\bcsv\b-?slug/i);

  // Re-importing the unchanged export shows no changes.
  await page.goto(`/${slug}/contacts/import`);
  await page.locator('input[name="householdsFile"]').setInputFiles({ name: "households.csv", mimeType: "text/csv", buffer: Buffer.from(households) });
  await page.locator('input[name="contactsFile"]').setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(contacts) });
  await page.getByRole("button", { name: /Validate|Upload|Review|Check/i }).first().click();
  await expect(page.getByText(/No changes detected/)).toBeVisible();
});
