import { expect } from "@playwright/test";
import { gotoMissing, newOwner, newSession, planEntries, seedPlanEntry, test } from "./helpers";

async function addMeal(page: import("@playwright/test").Page, name: string, description = "") {
  await page.goto("/meals/library/new");
  await page.getByLabel("Name").fill(name);
  if (description) await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Add meal" }).click();
  await expect(page).toHaveURL(/\/meals\/library\/(?!new)[a-z0-9]+(\?.*)?$/);
  return new URL(page.url()).pathname;
}

test("the meal library: add, search, sort, edit, and no duplicate names", async ({ page }) => {
  await newOwner(page, "mealslib", "The Mealers");
  await page.goto("/meals/library");
  await expect(page.getByText(/No meals yet/)).toBeVisible();

  const recipe = "1. Chop <b>onions</b>\n   2. Fry them\n\nServe hot.";
  const tacosPath = await addMeal(page, "Tacos", recipe);
  await addMeal(page, "Apple pie");
  await addMeal(page, "Chili");

  // The description is plain text with its line breaks and indentation, never HTML.
  await page.goto(tacosPath);
  await expect(page.getByRole("heading", { name: "Tacos" })).toBeVisible();
  await expect(page.getByText("Chop <b>onions</b>", { exact: false })).toBeVisible();
  expect(await page.locator("b").count()).toBe(0);
  expect(await page.getByText(/Chop <b>onions<\/b>/).evaluate((el) => (el as HTMLElement).innerText)).toContain("   2. Fry them");
  await expect(page.getByText("Never made · 0 times")).toBeVisible();

  // Names are unique per household, ignoring case.
  await page.goto("/meals/library/new");
  await page.getByLabel("Name").fill("  tACOS ");
  await page.getByRole("button", { name: "Add meal" }).click();
  await expect(page.getByText('"Tacos" is already in your library')).toBeVisible();

  // List, search, sort.
  await page.goto("/meals/library");
  await expect(page.getByText("Meal library (3)")).toBeVisible();
  const rows = page.locator('a[href^="/meals/library/"]:not([href$="/new"])');
  await expect(rows).toHaveText([/Apple pie/, /Chili/, /Tacos/]);
  await page.getByLabel("Search meals").fill("ch");
  await expect(rows).toHaveText([/Chili/]);
  await page.getByLabel("Search meals").fill("nothing like this");
  await expect(page.getByText(/No meal matches/)).toBeVisible();

  // Edit.
  await page.goto(tacosPath);
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Fish tacos");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Fish tacos" })).toBeVisible();
});

test("last made and times made come from the plan, up to the browser's today", async ({ page }) => {
  const { email } = await newOwner(page, "mealsstats", "The Statters");
  const path = await addMeal(page, "Lasagna");
  await seedPlanEntry(email, "Lasagna", "2020-03-01");
  await seedPlanEntry(email, "Lasagna", "2020-04-15", "LUNCH");
  await seedPlanEntry(email, "Lasagna", "2099-01-01"); // in the future: not "made" yet

  await page.goto("/meals/library");
  await expect(page.getByText("Last made Apr 15, 2020 · 2 times")).toBeVisible();
  await page.goto(path);
  await expect(page.getByText("Last made Apr 15, 2020 · 2 times")).toBeVisible();
});

test("deleting a meal keeps its planned entries as one-offs with its name", async ({ page }) => {
  const { email } = await newOwner(page, "mealsdel", "The Deleters");
  const path = await addMeal(page, "Pot roast");
  await seedPlanEntry(email, "Pot roast", "2020-05-01");
  await seedPlanEntry(email, "Pot roast", "2099-05-02", "LUNCH");

  await page.goto(path);
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/2 planned entries use this meal/)).toBeVisible();
  await page.locator(".ant-popover .ant-btn-primary").click();
  await expect(page).toHaveURL(/\/meals\/library(\?.*)?$/);
  await expect(page.getByText("Pot roast")).toHaveCount(0);

  expect(await planEntries(email)).toEqual([
    { date: "2020-05-01", slot: "DINNER", mealId: null, text: "Pot roast" },
    { date: "2099-05-02", slot: "LUNCH", mealId: null, text: "Pot roast" },
  ]);
});

test("one household can't see or change another's meals", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  await newOwner(a.page, "mealsa", "The Mealas");
  await newOwner(b.page, "mealsb", "The Mealbs");
  const path = await addMeal(a.page, "Secret sauce", "Family recipe");

  for (const url of [path, `${path}/edit`]) {
    await gotoMissing(b.page, url);
    await expect(b.page.getByText(/could not be found/i)).toBeVisible();
    await expect(b.page.getByText("Family recipe")).toHaveCount(0);
  }
  await b.page.goto("/meals/library");
  await expect(b.page.getByText("Secret sauce")).toHaveCount(0);
  // B can use the same name for their own meal.
  await addMeal(b.page, "Secret sauce");

  for (const s of [a, b]) await s.context.close();
});
