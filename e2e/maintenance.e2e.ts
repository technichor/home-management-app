import { expect } from "@playwright/test";
import { gotoMissing, newOwner, newSession, test } from "./helpers";

test("the maintenance inventory: add, see what to tell a repair person, record service, edit, delete", async ({ page }) => {
  await newOwner(page, "maint1", "The Maintainers");
  await page.goto("/maintenance");
  await expect(page.getByText(/Nothing here yet/)).toBeVisible();

  await page.getByRole("link", { name: "Add item" }).click();
  await page.getByLabel("Name").fill("Upstairs furnace");
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByTitle("Heating & cooling").click();
  await page.getByLabel("Location").fill("Attic");
  await page.getByLabel("Brand").fill("Carrier");
  await page.getByLabel("Model number").fill("59TP6");
  await page.getByLabel("Serial number").fill("SN-12345");
  await page.getByLabel("Year installed").fill("2004");
  await page.getByLabel("Service every (months)").fill("12");
  await page.getByLabel("Last serviced").fill("2020-01-01");
  await page.getByLabel("Manual link").fill("https://example.com/manual.pdf");
  await page.getByLabel("Notes").fill("Filter 16x25x1 <b>not bold</b>");
  await page.getByRole("button", { name: "Add item" }).click();

  // The detail page has what a repair person asks for.
  await expect(page.getByRole("heading", { name: "Upstairs furnace" })).toBeVisible();
  for (const text of ["Carrier", "59TP6", "SN-12345", "Attic"]) await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByText(/^2004 \(\d+ years old\)$/)).toBeVisible();
  await expect(page.getByText("Service was due Jan 1, 2021")).toBeVisible();
  const manual = page.getByRole("link", { name: "https://example.com/manual.pdf" });
  await expect(manual).toHaveAttribute("target", "_blank");
  // Notes are plain text, never HTML.
  await expect(page.getByText("<b>not bold</b>", { exact: false })).toBeVisible();
  expect(await page.locator("b").count()).toBe(0);

  // Recording service moves the next one on.
  await page.getByRole("button", { name: "Serviced today" }).click();
  await expect(page.getByText(/^Next service /)).toBeVisible();
  await expect(page.getByText(/Service was due/)).toHaveCount(0);

  // The list shows it, with its age and next service, and finds it by model.
  await page.goto("/maintenance");
  await expect(page.getByText(/Heating & cooling · Carrier 59TP6 · Attic · \d+ years old/)).toBeVisible();
  await page.getByLabel("Search maintenance items").fill("59tp6");
  await expect(page.getByRole("link", { name: /Upstairs furnace/ })).toBeVisible();
  await page.getByLabel("Search maintenance items").fill("nothing like it");
  await expect(page.getByText("Nothing matches.")).toBeVisible();
  await page.getByLabel("Search maintenance items").fill("");

  // Edit.
  await page.getByRole("link", { name: /Upstairs furnace/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Attic furnace");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Attic furnace" })).toBeVisible();

  // A link that isn't http(s) is refused.
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Manual link").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("The manual link must start with http:// or https://")).toBeVisible();

  // Delete.
  await page.getByRole("link", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("tooltip").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/maintenance$/);
  await expect(page.getByText(/Nothing here yet/)).toBeVisible();
});

test("another household can't see or open an inventory item", async ({ browser, page }) => {
  await newOwner(page, "maint2", "The Owners");
  await page.goto("/maintenance/new");
  await page.getByLabel("Name").fill("Secret safe");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByRole("heading", { name: "Secret safe" })).toBeVisible();
  const path = new URL(page.url()).pathname;

  const { context, page: other } = await newSession(browser);
  await newOwner(other, "maint3", "The Neighbours");
  await other.goto("/maintenance");
  await expect(other.getByText("Secret safe")).toHaveCount(0);
  const response = await gotoMissing(other, path);
  expect(response?.status()).toBe(404);
  await context.close();
});
