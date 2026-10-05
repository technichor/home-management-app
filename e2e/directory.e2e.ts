import { expect } from "@playwright/test";
import { choose, newOwner, test } from "./helpers";

test("households and contacts: add, edit, remove and restore", async ({ page }) => {
  await newOwner(page, "dir", "The Directors");

  // --- Add a household ---
  await page.goto(`/contacts/households`);
  await page.getByRole("link", { name: "Add household" }).click();
  await page.getByLabel("Household name").fill("The Joneses");
  await page.getByLabel(/^Mailing address/).fill("1 Main St");
  await page.getByRole("button", { name: "Add household" }).click();
  await expect(page.getByRole("heading", { name: "The Joneses" })).toBeVisible();
  await expect(page.getByText("1 Main St")).toBeVisible();

  // --- Add a Family & Friend contact into it; the address is the household's ---
  await page.goto(`/contacts/new`);
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
  await page.goto(`/contacts`);
  await expect(page.getByRole("link", { name: /Jo Jones/ })).toBeVisible();

  // --- Remove it, see it in Removed, restore it ---
  await page.getByRole("link", { name: /Jo Jones/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(page).toHaveURL(new RegExp(`/contacts$`));
  await expect(page.getByRole("link", { name: /Jo Jones/ })).toHaveCount(0);

  await page.goto(`/contacts/removed`);
  await expect(page.getByText("Jo Jones")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();
  // Wait for the restore to finish (the row leaves the Removed list) before moving on.
  await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(0);
  await page.goto(`/contacts`);
  await expect(page.getByRole("link", { name: /Jo Jones/ })).toBeVisible();

  // --- Removing the household warns about its contacts ---
  await page.goto(`/contacts/households`);
  await page.getByRole("link", { name: /The Joneses/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText(/1 Family & Friend contact will lose their inherited address/)).toBeVisible();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(page).toHaveURL(new RegExp(`/contacts/households$`));
  await expect(page.getByRole("link", { name: /The Joneses/ })).toHaveCount(0);
});

test("your own household can be edited but not removed", async ({ page }) => {
  await newOwner(page, "own", "The Owners");
  await page.goto(`/contacts/households`);
  await expect(page.getByText("Our household")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: /The Owners/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await page.getByLabel(/^Mailing address/).fill("9 Home Rd");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("9 Home Rd")).toBeVisible();
});

test("a household member's own profile can't be removed as a contact", async ({ page }) => {
  await newOwner(page, "self", "The Selves");
  await page.goto(`/contacts`);
  await page.getByRole("link", { name: /Casey self/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.locator(".ant-popconfirm .ant-btn-primary").click();
  await expect(page.getByText(/household member's own profile/)).toBeVisible();
});

test("CSV export and re-import round-trips through the real app", async ({ page }) => {
  await newOwner(page, "csv", "The Csvs");
  await page.goto(`/contacts/new`);
  await page.getByLabel("First name").fill("Roundtrip");
  await page.getByLabel("Last name").fill("Contact");
  await choose(page, "Category", "Service Provider");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: "Roundtrip Contact" })).toBeVisible();

  const households = await (await page.request.get(`/contacts/api/export?file=households`)).text();
  const contacts = await (await page.request.get(`/contacts/api/export?file=contacts`)).text();
  expect(contacts).toContain("Roundtrip");
  expect(households + contacts).not.toMatch(/passwordHash|url_slug|\bcsv\b-?slug/i);

  // Re-importing the unchanged export shows no changes.
  await page.goto(`/contacts/import`);
  await page.locator('input[name="householdsFile"]').setInputFiles({ name: "households.csv", mimeType: "text/csv", buffer: Buffer.from(households) });
  await page.locator('input[name="contactsFile"]').setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(contacts) });
  await page.getByRole("button", { name: /Validate|Upload|Review|Check/i }).first().click();
  await expect(page.getByText(/No changes detected/)).toBeVisible();
});

test("a contact's birthday: in the form, on the detail page, and through CSV export and import", async ({ page }) => {
  await newOwner(page, "bday", "The Birthdays");

  // Add with a birthday and year, then without a year.
  async function add(first: string, month: string, day: string, year?: string) {
    await page.goto(`/contacts/new`);
    await page.getByLabel("First name").fill(first);
    await page.getByLabel("Last name").fill("Person");
    await choose(page, "Category", "Service Provider");
    await choose(page, "Birthday month", month);
    await page.getByLabel("Birthday day").fill(day);
    if (year) await page.getByLabel("Birthday year").fill(year);
    await page.getByRole("button", { name: "Add contact" }).click();
  }
  await add("Withyear", "March", "4", "1985");
  await expect(page.getByText("March 4, 1985")).toBeVisible();
  await add("Noyear", "February", "29");
  await expect(page.getByText("February 29", { exact: true })).toBeVisible();

  // A bad one is explained on the form and nothing is saved.
  await add("Bad", "February", "30");
  await expect(page.getByText("February doesn't have 30 days").first()).toBeVisible();

  // Export writes the two formats.
  const households = await (await page.request.get(`/contacts/api/export?file=households`)).text();
  const contacts = await (await page.request.get(`/contacts/api/export?file=contacts`)).text();
  expect(contacts.split("\n")[0]).toContain(",birthday,");
  expect(contacts).toContain("1985-03-04");
  expect(contacts).toContain("02-29");

  const upload = async (h: string, c: string) => {
    await page.goto(`/contacts/import`);
    await page.locator('input[name="householdsFile"]').setInputFiles({ name: "households.csv", mimeType: "text/csv", buffer: Buffer.from(h) });
    await page.locator('input[name="contactsFile"]').setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(c) });
    await page.getByRole("button", { name: /Validate|Upload|Review|Check/i }).first().click();
  };

  // The unchanged export imports as no changes.
  await upload(households, contacts);
  await expect(page.getByText(/No changes detected/)).toBeVisible();

  // An older export (no birthday column) leaves birthdays alone, even with other edits.
  const rows = contacts.trim().split("\n");
  const headers = rows[0].split(",");
  const drop = headers.indexOf("birthday");
  const old = rows.map((r) => {
    const cells = r.split(",");
    cells.splice(drop, 1);
    return cells.join(",");
  });
  await upload(households, old.join("\n") + "\n");
  await expect(page.getByText(/No changes detected/)).toBeVisible();

  // A bad birthday is reported against its row and column.
  const bad = rows.map((r) => r.replace("1985-03-04", "March 4")).join("\n");
  await upload(households, bad);
  await expect(page.getByText(/birthday.*isn't in a recognised format/).first()).toBeVisible();

  // Changing and clearing birthdays is shown in plain language, and applied.
  const edited = rows
    .map((r) => r.replace("1985-03-04", "1985-03-09"))
    .map((r) => r.replace(/,02-29(,|$)/, ",$1"))
    .join("\n");
  await upload(households, edited);
  await expect(page.getByText(/birthday changed from March 4, 1985 to March 9, 1985/)).toBeVisible();
  await expect(page.getByText(/birthday removed \(was February 29\)/)).toBeVisible();
  await page.getByRole("button", { name: /Apply/ }).click();
  await expect(page.getByText(/import|applied|success/i).first()).toBeVisible();
  await page.goto(`/contacts`);
  await page.getByRole("link", { name: /Withyear/ }).click();
  await expect(page.getByText("March 9, 1985")).toBeVisible();
});
