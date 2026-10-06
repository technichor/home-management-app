import { expect, type Page } from "@playwright/test";
import { addMember, gotoMissing, newOwner, newSession, shoppingListId, test } from "./helpers";

const base = `http://localhost:${process.env.E2E_APP_PORT ?? 3100}`;

const sections = (page: Page) => page.locator(".shop-section-name");
const names = (page: Page, section: string) =>
  page.locator(".shop-group", { has: page.locator(".shop-section-name", { hasText: section }) }).locator(".shop-name");

async function quickAdd(page: Page, text: string, section?: string) {
  if (section) {
    await page.getByRole("combobox", { name: "Section" }).click();
    await page.locator(`.ant-select-item-option[title="${section}"]`).click();
  }
  await page.getByLabel("Add an item").fill(text);
  await page.getByLabel("Add an item").press("Enter");
}

test("the shopping list: quick add into sections, check off, edit, move, remove checked", async ({ page }) => {
  await newOwner(page, "shop1", "The Shoppers");
  await page.goto("/meals/shopping");
  await expect(page.getByText(/Nothing on the list/)).toBeVisible();

  // Many items in a row, with focus staying in the box; they start in Other unless a section is chosen.
  await quickAdd(page, "Batteries");
  await quickAdd(page, "Bananas", "Produce");
  await quickAdd(page, "Apples");
  await quickAdd(page, "Milk", "Dairy & Eggs");
  await expect(page.getByLabel("Add an item")).toBeFocused();
  await expect(sections(page)).toHaveText(["Produce", "Dairy & Eggs", "Other"]);
  await expect(names(page, "Produce")).toHaveText(["Bananas", "Apples"]);
  await expect(page.getByRole("heading", { level: 4 })).toHaveText("Shopping list (4)");

  // Checked items go to the bottom of their section.
  await page.getByRole("checkbox", { name: "Bananas" }).check();
  await expect(names(page, "Produce")).toHaveText(["Apples", "Bananas"]);
  await expect(page.getByRole("checkbox", { name: "Bananas" })).toBeChecked();
  await expect(page.getByRole("heading", { level: 4 })).toHaveText("Shopping list (3)");
  await page.reload();
  await expect(names(page, "Produce")).toHaveText(["Apples", "Bananas"]);
  await expect(page.getByRole("checkbox", { name: "Bananas" })).toBeChecked();

  // Edit quantity and notes.
  await page.getByRole("button", { name: /^Milk/ }).click();
  await page.getByRole("dialog").getByLabel("Quantity").fill("2 gallons");
  await page.getByRole("dialog").getByLabel("Notes").fill("whole");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("2 gallons")).toBeVisible();

  // Change an item's section by tapping it.
  await page.getByRole("button", { name: "Section for Batteries: Other" }).click();
  await page.locator(".ant-dropdown-menu-item", { hasText: "Household & Personal Care" }).click();
  await expect(sections(page)).toHaveText(["Produce", "Dairy & Eggs", "Household & Personal Care"]);
  await page.reload();
  await expect(sections(page)).toHaveText(["Produce", "Dairy & Eggs", "Household & Personal Care"]);

  // A duplicate unchecked item gets a light warning but is still added.
  await quickAdd(page, "milk");
  await expect(page.getByText('"milk" is already on the list')).toBeVisible();

  // Collapse a section.
  await page.locator(".shop-section-head", { hasText: "Dairy" }).click();
  await expect(page.getByText("2 gallons")).toHaveCount(0);
  await page.locator(".shop-section-head", { hasText: "Dairy" }).click();
  await expect(page.getByText("2 gallons")).toBeVisible();

  // Remove checked items: states the count and asks first.
  await page.getByRole("button", { name: "Remove checked items (1)" }).click();
  await expect(page.getByText("Remove 1 checked item?")).toBeVisible();
  await page.locator(".ant-popover .ant-btn-primary").click();
  await expect(page.getByRole("checkbox", { name: "Bananas" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Remove checked items/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Bananas" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Apples" })).toBeVisible();

  // Delete one item.
  await page.getByRole("button", { name: /^Apples/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.locator(".ant-popover .ant-btn-primary").click();
  await expect(page.getByRole("checkbox", { name: "Apples" })).toHaveCount(0);
});

test("the planner's slide-over has the list, quick add and an unchecked count", async ({ page }) => {
  await newOwner(page, "shop2", "The Panelists");
  await page.goto("/meals");
  const button = page.getByRole("button", { name: /Shopping list/ });
  await expect(button).toBeVisible();
  await expect(page.locator(".ant-badge-count")).toHaveCount(0);

  await button.click();
  const panel = page.locator(".ant-drawer");
  await quickAdd(panel.page(), "Flour");
  await expect(panel.locator(".shop-name")).toHaveText(["Flour"]);
  await expect(panel.getByRole("link", { name: "Open full page" })).toHaveAttribute("href", "/meals/shopping");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".ant-badge-count")).toHaveText("1");

  // The same item is on the full page.
  await page.getByRole("link", { name: "Shopping", exact: true }).click();
  await expect(page).toHaveURL(/\/meals\/shopping/);
  await expect(page.getByRole("checkbox", { name: "Flour" })).toBeVisible();
});

test("the shopping list stays out of the Lists module", async ({ page }) => {
  const { email } = await newOwner(page, "shop3", "The Separatists");
  await page.goto("/meals/shopping"); // creates it
  await page.goto("/lists");
  await expect(page.getByText("Shopping list")).toHaveCount(0);
  await page.goto("/lists/archived");
  await expect(page.getByText("Shopping list")).toHaveCount(0);
  const id = await shoppingListId(email);
  for (const path of [`/lists/${id}`, `/lists/${id}/compare`]) {
    await gotoMissing(page, path);
    await expect(page.getByText(/could not be found/i), path).toBeVisible();
  }
  await page.goto("/home");
  await expect(page.getByText("Shopping list")).toHaveCount(0);
});

test("one household's shopping list is invisible to another", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  await newOwner(a.page, "shopa", "The Shopas");
  await newOwner(b.page, "shopb", "The Shopbs");
  await a.page.goto("/meals/shopping");
  await quickAdd(a.page, "A's private item");
  await expect(a.page.getByText("A's private item")).toBeVisible();
  await b.page.goto("/meals/shopping");
  await expect(b.page.getByText(/Nothing on the list/)).toBeVisible();
  await expect(b.page.getByText("A's private item")).toHaveCount(0);
  for (const s of [a, b]) await s.context.close();
});

test("two people in a household see each other's changes without reloading", async ({ browser }) => {
  test.setTimeout(90_000);
  const owner = await newSession(browser);
  await newOwner(owner.page, "shop4", "The Syncers");
  const mate = await addMember(browser, owner.page, "shop4mate");
  await owner.page.goto("/meals/shopping");
  await mate.page.goto("/meals/shopping");

  await quickAdd(owner.page, "Shared eggs");
  await expect(mate.page.getByRole("checkbox", { name: "Shared eggs" })).toBeVisible({ timeout: 30_000 });

  await mate.page.getByRole("checkbox", { name: "Shared eggs" }).check();
  await expect(owner.page.getByRole("checkbox", { name: "Shared eggs" })).toBeChecked({ timeout: 30_000 });
  for (const s of [owner, mate]) await s.context.close();
});

test("on a phone: the full page fits, with finger-sized rows", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await newOwner(page, "shop5", "The Phoners");
  await page.goto("/meals/shopping");
  await quickAdd(page, "A rather long item name that has to wrap onto more than one line on a small phone screen");
  await quickAdd(page, "Bread", "Bakery");
  await expect(page.getByRole("checkbox", { name: "Bread" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // Measured with retries: a row is re-rendered when the saved copy replaces the optimistic one, and a detached element
  // has no box for that instant.
  const heightOf = (selector: string) => async () => (await page.locator(selector).first().boundingBox())?.height ?? 0;
  await expect.poll(heightOf(".shop-row")).toBeGreaterThanOrEqual(52);
  await expect.poll(heightOf(".shop-section-head")).toBeGreaterThanOrEqual(44);
  await page.getByRole("checkbox", { name: "Bread" }).check();
  await expect(page.getByRole("checkbox", { name: "Bread" })).toBeChecked();
  await context.close();
});
