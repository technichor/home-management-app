import { expect } from "@playwright/test";
import { gotoMissing, newOwner, newSession, test } from "./helpers";

test("the accounts directory: add, flag one to review, find it, edit, close, delete", async ({ page }) => {
  await newOwner(page, "acct1", "The Accountants");
  await page.goto("/accounts");
  await expect(page.getByText(/No accounts yet/)).toBeVisible();

  const add = async (name: string, kindTitle: string, extra: Record<string, string> = {}) => {
    await page.goto("/accounts/new");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("combobox", { name: "Kind" }).click();
    await page.getByTitle(kindTitle).click();
    for (const [label, value] of Object.entries(extra)) await page.getByLabel(label).fill(value);
  };

  await add("Fidelity HSA", "HSA or FSA", { Institution: "Fidelity", "Last 4": "1234" });
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("heading", { name: "Fidelity HSA" })).toBeVisible();
  await expect(page.getByText("····1234")).toBeVisible();

  await add("Old 401k", "Retirement", { Institution: "Acme Corp" });
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByTitle("To review or consolidate").click();
  await page.getByLabel("Notes").fill("Roll into the IRA <b>soon</b>");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("heading", { name: "Old 401k" })).toBeVisible();
  await expect(page.getByText("Roll into the IRA <b>soon</b>")).toBeVisible();
  expect(await page.locator("b").count()).toBe(0);

  // The list flags what needs review, and searches.
  await page.goto("/accounts");
  await expect(page.getByText("1 account to review")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accounts (2)" })).toBeVisible();
  await page.getByLabel("Search accounts").fill("acme");
  await expect(page.getByRole("link", { name: /Old 401k/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Fidelity HSA/ })).toHaveCount(0);
  await page.getByLabel("Search accounts").fill("");

  // A whole account number is refused; only the last 4 are kept.
  await page.getByRole("link", { name: /Old 401k/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Last 4").fill("12345678");
  await expect(page.getByLabel("Last 4")).toHaveValue("1234");

  // Closing it hides it from the default list, but it can still be found.
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByTitle("Closed").click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".ant-tag", { hasText: "Closed" })).toBeVisible();
  await page.goto("/accounts");
  await expect(page.getByRole("link", { name: /Old 401k/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByTitle("All, including closed").click();
  await expect(page.getByRole("link", { name: /Old 401k/ })).toBeVisible();

  // Delete.
  await page.getByRole("link", { name: /Old 401k/ }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("tooltip").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("link", { name: /Old 401k/ })).toHaveCount(0);
});

test("another household can't see or open an account record", async ({ browser, page }) => {
  await newOwner(page, "acct2", "The Owners");
  await page.goto("/accounts/new");
  await page.getByLabel("Name").fill("Secret savings");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("heading", { name: "Secret savings" })).toBeVisible();
  const path = new URL(page.url()).pathname;

  const { context, page: other } = await newSession(browser);
  await newOwner(other, "acct3", "The Neighbours");
  await other.goto("/accounts");
  await expect(other.getByText("Secret savings")).toHaveCount(0);
  const response = await gotoMissing(other, path);
  expect(response?.status()).toBe(404);
  await context.close();
});
