import { expect, type Page } from "@playwright/test";
import { newOwner, newSession, reloadUntil, seedPlanEntry, test } from "./helpers";

const base = `http://localhost:${process.env.E2E_APP_PORT ?? 3100}`;

async function addMeal(page: Page, name: string) {
  await page.goto("/meals/library/new");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Add meal" }).click();
  await expect(page).toHaveURL(/\/meals\/library\/(?!new)[a-z0-9]+/);
}

const todayDinner = (page: Page) => page.locator(".planner-day[data-today]").first();
async function addDinner(page: Page, typed: string, choose: string | RegExp) {
  await page.getByRole("button", { name: /^Add to Dinner on/ }).first().click();
  await page.getByRole("dialog").getByLabel("Meal").fill(typed);
  await page.getByRole("dialog").getByRole("button", { name: choose }).click();
}
const entries = (page: Page) => page.locator('.planner-cell[data-slot="DINNER"] .plan-entry');

test("the planner: add from the library, create inline, one-offs, several per slot, move and remove", async ({ page }) => {
  await newOwner(page, "plan1", "The Planners");
  await addMeal(page, "Tacos");

  await page.goto("/meals");
  await expect(page.getByRole("heading", { level: 4 })).toBeVisible();
  await expect(todayDinner(page)).toContainText("Today");

  // Pick an existing library meal.
  await addDinner(page, "tac", "Tacos");
  await expect(entries(page)).toHaveText(["Tacos"]);

  // Type a new name: create it in the library and add it, in one step.
  await addDinner(page, "Rice", /Create .Rice. and add/);
  await expect(entries(page)).toHaveText(["Tacos", "Rice"]);

  // A typed name that matches (any case) selects the existing meal; no duplicate is created.
  await page.getByRole("button", { name: /^Add to Dinner on/ }).first().click();
  await page.getByRole("dialog").getByLabel("Meal").fill("tACOS");
  await expect(page.getByRole("dialog").getByRole("button", { name: /Create/ })).toHaveCount(0);
  await page.getByRole("dialog").getByLabel("Meal").press("Enter");
  await expect(entries(page)).toHaveText(["Tacos", "Rice", "Tacos"]);

  // A one-off is not saved to the library.
  await addDinner(page, "Leftovers", "Add as one-off (not saved to library)");
  await expect(entries(page)).toHaveText(["Tacos", "Rice", "Tacos", "Leftovers"]);
  await page.goto("/meals/library");
  await expect(page.getByText("Meal library (2)")).toBeVisible();
  await expect(page.getByText("Leftovers")).toHaveCount(0);
  // Both planned Tacos entries are dated today, so they count as made.
  await expect(page.getByRole("link", { name: /Tacos/ })).toContainText("2 times");

  // Detail: a meal shows its stats; move it to tomorrow's lunch.
  await page.goto("/meals");
  await entries(page).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Last made .* · 2 times/)).toBeVisible();
  await dialog.getByLabel("Date").fill(await dialog.getByLabel("Date").inputValue().then((d) => {
    const next = new Date(`${d}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }));
  await dialog.getByRole("combobox", { name: "Meal of the day" }).click();
  await page.locator('.ant-select-item-option[title="Lunch"]').click();
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(entries(page)).toHaveText(["Rice", "Tacos", "Leftovers"]);
  await expect(page.locator('.planner-cell[data-slot="LUNCH"] .plan-entry')).toHaveText(["Tacos"]);

  // Remove an entry; the meal stays in the library.
  await entries(page).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove from plan" }).click();
  await page.locator(".ant-popover .ant-btn-primary").click();
  await expect(entries(page)).toHaveText(["Tacos", "Leftovers"]);
});

test("week navigation is unbounded, and 'This week' comes back", async ({ page }) => {
  await newOwner(page, "plan2", "The Navigators");
  await page.goto("/meals");
  const heading = page.getByRole("heading", { level: 4 });
  await expect(heading).toBeVisible();
  const thisWeek = await heading.textContent();
  await expect(page.getByRole("link", { name: "This week" })).toHaveCount(0);

  for (let i = 0; i < 3; i++) await page.getByRole("link", { name: "Next week" }).click();
  await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/);
  await expect(heading).not.toHaveText(thisWeek!);
  await page.getByRole("link", { name: "This week" }).click();
  await expect(heading).toHaveText(thisWeek!);
  await expect(page.getByRole("link", { name: "This week" })).toHaveCount(0);

  // Years back and forth work too.
  await page.goto("/meals?week=1999-12-26&today=2026-10-05");
  await expect(heading).toHaveText("Dec 26, 1999 – Jan 1, 2000");
  await page.goto("/meals?week=2099-01-04&today=2026-10-05");
  await expect(heading).toHaveText("Jan 4 – 10, 2099");
});

test("meals can be switched on and off, entries in hidden ones are noted, and the week can start on Monday", async ({ page }) => {
  await newOwner(page, "plan3", "The Togglers");
  await page.goto("/meals");
  await expect(page.locator('.planner-cell[data-slot="BREAKFAST"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Breakfast", exact: true }).click();
  await expect(page.locator('.planner-cell[data-slot="BREAKFAST"]')).toHaveCount(7);
  await page.getByRole("button", { name: /^Add to Breakfast on/ }).first().click();
  await page.getByRole("dialog").getByLabel("Meal").fill("Oatmeal");
  await page.getByRole("dialog").getByRole("button", { name: "Add as one-off (not saved to library)" }).click();
  await expect(page.locator('.planner-cell[data-slot="BREAKFAST"] .plan-entry')).toHaveText(["Oatmeal"]);

  await page.getByRole("button", { name: "Breakfast", exact: true }).click();
  await expect(page.locator('.planner-cell[data-slot="BREAKFAST"]')).toHaveCount(0);
  await expect(page.getByText(/1 hidden entry this week/)).toBeVisible();

  // The last visible meal can't be switched off.
  await page.getByRole("button", { name: "Lunch", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dinner", exact: true })).toBeDisabled();

  // Settings are household-wide and survive a reload; the week now starts on Monday.
  await page.getByRole("button", { name: "Planner settings" }).click();
  await page.getByRole("combobox", { name: "Week starts on" }).click();
  await page.locator('.ant-select-item-option[title="Monday"]').click();
  await expect(page.locator(".planner-day").first()).toContainText("Mon");
  await reloadUntil(page, async () => {
    await expect(page.locator(".planner-day").first()).toContainText("Mon");
    await expect(page.getByRole("button", { name: "Lunch", exact: true })).toHaveAttribute("aria-pressed", "false");
  });
});

// "Today" is the browser's date: the server (UTC) must not decide it.
for (const [zone, instant, today, week] of [
  // 21:00 on Saturday 10 Oct in Samoa (UTC-11) is already Sunday 11 Oct in UTC.
  ["Pacific/Pago_Pago", "2026-10-11T08:00:00Z", "Sat Oct 10", "Oct 4 – 10, 2026"],
  // 10:00 on Sunday 11 Oct on Kiritimati (UTC+14) is still Saturday 10 Oct in UTC.
  ["Pacific/Kiritimati", "2026-10-10T20:00:00Z", "Sun Oct 11", "Oct 11 – 17, 2026"],
] as const) {
  test(`today is the browser's local date (${zone}), not the server's`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: base, timezoneId: zone });
    await ctx.clock.setFixedTime(new Date(instant));
    const p = await ctx.newPage();
    await newOwner(p, `plantz${zone.slice(-4).toLowerCase()}`, `The ${zone}ers`);
    await p.goto("/meals");
    await expect(p.getByRole("heading", { level: 4 })).toHaveText(week);
    const marked = p.locator(".planner-day[data-today]");
    await expect(marked).toHaveCount(1);
    await expect(marked).toContainText(today);
    await ctx.close();
  });
}

test("on a phone the week is a list with today at the top, and adding works", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await newOwner(page, "plan4", "The Phoners");
  await page.goto("/meals");
  const today = page.locator(".planner-day[data-today]");
  await expect(today).toBeVisible();
  await expect.poll(async () => (await today.boundingBox())!.y).toBeLessThan(200); // scrolled to the top
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.getByRole("button", { name: /^Add to Dinner on/ }).first().click();
  await page.getByRole("dialog").getByLabel("Meal").fill("Soup");
  await page.getByRole("dialog").getByRole("button", { name: /Create .Soup. and add/ }).click();
  await expect(page.locator('.planner-cell[data-slot="DINNER"] .plan-entry')).toHaveText(["Soup"]);
  await context.close();
});

test("another household's plan is separate", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  await newOwner(a.page, "plana", "The Planas");
  await newOwner(b.page, "planb", "The Planbs");
  await a.page.goto("/meals");
  await a.page.getByRole("button", { name: /^Add to Dinner on/ }).first().click();
  await a.page.getByRole("dialog").getByLabel("Meal").fill("A's secret dinner");
  await a.page.getByRole("dialog").getByRole("button", { name: "Add as one-off (not saved to library)" }).click();
  await expect(a.page.getByText("A's secret dinner")).toBeVisible();

  await b.page.goto("/meals");
  await expect(b.page.getByRole("heading", { level: 4 })).toBeVisible();
  await expect(b.page.getByText("A's secret dinner")).toHaveCount(0);
  for (const s of [a, b]) await s.context.close();
});

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

test("suggestions: due for a repeat and family staples, one-tap add, shuffle", async ({ page }) => {
  const { email } = await newOwner(page, "plan5", "The Suggesters");
  for (const name of ["Fresh", "Old favourite", "Staple", "Just had", "Already planned"]) {
    await page.goto("/meals/library/new");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Add meal" }).click();
    await expect(page).toHaveURL(/\/meals\/library\/(?!new)[a-z0-9]+/);
  }
  await seedPlanEntry(email, "Old favourite", daysAgo(200));
  for (const n of [60, 67, 74, 81, 88]) await seedPlanEntry(email, "Staple", daysAgo(n));
  await seedPlanEntry(email, "Just had", daysAgo(3));
  await seedPlanEntry(email, "Already planned", daysAgo(120));

  await page.goto("/meals");
  // Plan one meal this week by hand: it must drop out of the suggestions.
  await page.getByRole("button", { name: /^Add to Dinner on/ }).first().click();
  await page.getByRole("dialog").getByLabel("Meal").fill("Already");
  await page.getByRole("dialog").getByRole("button", { name: "Already planned" }).click();
  // ("Just had", three days ago, is also in this week from Wednesday on, so look for this entry only.)
  await expect(entries(page).filter({ hasText: "Already planned" })).toHaveCount(1);

  await page.getByRole("button", { name: "Ideas" }).click();
  const panel = page.locator(".suggest-panel");
  const list = (title: string) => panel.locator(".suggest-list", { has: page.locator(".suggest-title", { hasText: title }) }).locator(".suggest-name");
  // Never made first, then the longest ago; the meal made 3 days ago and the one already planned are left out.
  await expect(list("Due for a repeat")).toHaveText(["Fresh", "Old favourite", "Staple"]);
  await expect(list("Family staples")).toHaveText(["Staple", "Old favourite"]);
  await expect(panel.getByText("Never made")).toBeVisible();
  await expect(panel.getByText(/Last made .* · 5 times/).first()).toBeVisible();
  await expect(panel).not.toContainText("Just had");

  // One tap adds it to the chosen day and meal (today's dinner by default), and it stops being suggested.
  await panel.getByRole("button", { name: "Add Fresh" }).first().click();
  await expect(entries(page).filter({ hasNotText: "Just had" })).toHaveText(["Already planned", "Fresh"]);
  await expect(list("Due for a repeat")).toHaveText(["Old favourite", "Staple"]);

  // Shuffle redraws without breaking anything.
  await panel.getByRole("button", { name: "Shuffle" }).click();
  await expect(panel.locator(".suggest-name").first()).toBeVisible();

  // The same ideas appear in a cell's add box.
  await page.getByRole("button", { name: /^Add to Lunch on/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Family staples")).toBeVisible();
  await dialog.getByRole("button", { name: "Add Staple" }).first().click();
  await expect(page.locator('.planner-cell[data-slot="LUNCH"] .plan-entry')).toHaveText(["Staple"]);
});
