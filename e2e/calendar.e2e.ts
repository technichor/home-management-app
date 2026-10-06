import { expect, type Page } from "@playwright/test";
import { addMember, newOwner, newSession, seedPlanEntry, test } from "./helpers";

const base = `http://localhost:${process.env.E2E_APP_PORT ?? 3100}`;

const iso = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const quick = (page: Page) => page.locator(".cal-quickadd");
async function quickAdd(page: Page, text: string) {
  await quick(page).getByLabel("Title").fill(text);
  await quick(page).getByLabel("Title").press("Enter");
}
const todayCell = (page: Page) => page.locator(".cal-day[data-today]");
const nav = (page: Page, view: string) => page.getByRole("navigation", { name: "View" }).getByRole("link", { name: view });

test("the calendar: quick add, several in a row, details, edit and delete", async ({ page }) => {
  await newOwner(page, "cal1", "The Calendars");
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 4 })).toBeVisible();
  await expect(todayCell(page)).toBeVisible();

  // Quick-add several in a row; focus stays in the box.
  await quickAdd(page, "Picture day");
  await expect(todayCell(page).getByText("Picture day")).toBeVisible();
  await expect(quick(page).getByLabel("Title")).toBeFocused();
  await quickAdd(page, "Call the vet");
  await expect(todayCell(page).getByText("Call the vet")).toBeVisible();
  // Events and reminders only: tasks live on the to-do list.
  await expect(quick(page).getByText("Task", { exact: true })).toHaveCount(0);
  await expect(todayCell(page).getByRole("checkbox")).toHaveCount(0);
  await quick(page).getByLabel("Start time").fill("09:30");
  await quick(page).getByLabel("Title").fill("Dentist");
  await quick(page).getByLabel("Title").press("Enter");
  await expect(todayCell(page).getByText("Dentist")).toBeVisible();
  await expect(todayCell(page).getByText("9:30 AM")).toBeVisible();

  // Order within the day: untimed events in the order added, then timed events.
  await expect(todayCell(page).locator(".cal-entry-title")).toHaveText(["Picture day", "Call the vet", "Dentist"]);

  // Details, edit, delete.
  await todayCell(page).getByRole("button", { name: /Dentist/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Event · .* · 9:30 AM/)).toBeVisible();
  await dialog.getByRole("button", { name: "Edit" }).click();
  const form = page.getByRole("dialog").filter({ hasText: "Edit event" });
  await form.getByLabel("Title").fill("Dentist (rescheduled)");
  await form.getByLabel("Notes").fill("Bring the card\n<b>and the form</b>");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(todayCell(page).getByText("Dentist (rescheduled)")).toBeVisible();
  await todayCell(page).getByRole("button", { name: /Dentist/ }).click();
  await expect(page.getByRole("dialog").getByText(/Bring the card/)).toBeVisible();
  expect(await page.locator("b").count()).toBe(0); // notes are text, never HTML
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.locator(".ant-popover .ant-btn-primary").click();
  await expect(todayCell(page).getByText("Dentist (rescheduled)")).toHaveCount(0);
});

test("views, navigation across month and year boundaries, and the week start shared with the planner", async ({ page }) => {
  await newOwner(page, "cal2", "The Navigators");
  const today = iso();
  await page.goto(`/calendar?view=week&today=${today}`);
  const title = page.getByRole("heading", { level: 4 });
  await expect(title).toBeVisible();

  // Day, week, month.
  await nav(page, "Day").click();
  await expect(page).toHaveURL(/view=day/);
  await expect(page.getByText(/Nothing on the calendar for/)).toBeVisible();
  await nav(page, "Month").click();
  await expect(page.locator(".cal-cell")).not.toHaveCount(0);
  expect(await page.locator(".cal-cell").count() % 7).toBe(0);
  await nav(page, "Week").click();
  await expect(page.locator(".cal-day")).toHaveCount(7);

  // Previous/next step by the view's unit; Today comes back.
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`view=week&date=${today}`));
  const thisWeek = await title.textContent();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(title).not.toHaveText(thisWeek!);
  await page.getByRole("link", { name: "Previous" }).click();
  await expect(title).toHaveText(thisWeek!);
  await page.getByRole("link", { name: "Next" }).click();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(title).toHaveText(thisWeek!);

  // Any date inside a range works and is normalized; navigation is unbounded and crosses year ends.
  await page.goto(`/calendar?view=month&date=2026-12-20&today=${today}`);
  await expect(title).toHaveText("December 2026");
  await page.getByRole("link", { name: "Next" }).click();
  await expect(title).toHaveText("January 2027");
  await page.getByRole("link", { name: "Previous" }).click();
  await page.getByRole("link", { name: "Previous" }).click();
  await expect(title).toHaveText("November 2026");
  await page.goto(`/calendar?view=week&date=1999-12-29&today=${today}`);
  await expect(title).toHaveText("Dec 26, 1999 – Jan 1, 2000");
  await page.goto(`/calendar?view=month&date=2099-02-14&today=${today}`);
  await expect(title).toHaveText("February 2099");
  await page.goto(`/calendar?view=week&date=garbage&today=${today}`);
  await expect(page.locator(".cal-day")).toHaveCount(7);

  // The week's first day is the planner's setting: change it here and the planner follows.
  await page.goto(`/calendar?view=week&today=2026-10-07`);
  await expect(page.locator(".cal-day-head").first()).toContainText("Sun");
  await page.getByRole("combobox", { name: "Week starts on" }).click();
  await page.locator('.ant-select-item-option[title="Starts Monday"]').click();
  await expect(page.locator(".cal-day-head").first()).toContainText("Mon");
  await page.goto(`/meals?today=2026-10-07`);
  await expect(page.locator(".planner-day").first()).toContainText("Mon");
  // ... and the other way round.
  await page.getByRole("button", { name: "Planner settings" }).click();
  await page.getByRole("combobox", { name: "Week starts on" }).click();
  await page.locator('.ant-select-item-option[title="Sunday"]').click();
  await expect(page.locator(".planner-day").first()).toContainText("Sun");
  await page.goto(`/calendar?view=week&today=2026-10-07`);
  await expect(page.locator(".cal-day-head").first()).toContainText("Sun");
});

test("birthdays and important dates come from contacts, read-only, and link to the contact", async ({ page }) => {
  await newOwner(page, "cal4", "The Birthdays");
  const d = new Date();
  async function addContact(first: string, extra: (p: Page) => Promise<void>) {
    await page.goto("/contacts/new");
    await page.getByLabel("First name").fill(first);
    await page.getByLabel("Last name").fill("Person");
    await page.locator("#category").click().catch(() => {});
    await page.locator('.ant-select-item-option[title="Service Provider"]').click().catch(() => {});
    await extra(page);
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(first) })).toBeVisible();
  }
  const bday = async (p: Page, year: string) => {
    await p.getByRole("combobox", { name: "Birthday month" }).click();
    await p.locator(`.ant-select-item-option[title="${["January","February","March","April","May","June","July","August","September","October","November","December"][d.getMonth()]}"]`).click();
    await p.getByLabel("Birthday day").fill(String(d.getDate()));
    if (year) await p.getByLabel("Birthday year").fill(year);
  };
  await addContact("Withyear", (p) => bday(p, String(d.getFullYear() - 30)));
  await addContact("Noyear", (p) => bday(p, ""));

  const today = iso();
  await page.goto(`/calendar?view=week&today=${today}`);
  await expect(todayCell(page).getByRole("link", { name: /Withyear's birthday/ })).toContainText("turns 30");
  await expect(todayCell(page).getByRole("link", { name: /Noyear's birthday/ })).not.toContainText("turns");
  // Read-only: no checkbox or edit; clicking goes to the contact.
  await todayCell(page).getByRole("link", { name: /Withyear's birthday/ }).click();
  await expect(page).toHaveURL(/\/contacts\/[a-z0-9]+$/);
  await expect(page.getByText(`March`).or(page.getByText(/January|February|April|May|June|July|August|September|October|November|December/)).first()).toBeVisible();

  // In the month view and the day view too, listed before everything else.
  await page.goto(`/calendar?view=month&today=${today}`);
  await expect(page.locator(".cal-cell[data-today]").getByText(/Withyear's birthday/)).toBeVisible();
  await page.goto(`/calendar?view=day&today=${today}`);
  await expect(page.getByRole("heading", { name: "Birthdays and dates" })).toBeVisible();
  await quickAdd(page, "Plain reminder");
  await expect(page.locator(".cal-section-title").first()).toHaveText("Birthdays and dates");

  // A removed contact's dates leave the calendar.
  await page.goto("/contacts");
  await page.getByRole("link", { name: /Noyear/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await page.locator(".ant-popover .ant-btn-primary").click();
  await expect(page).toHaveURL(/\/contacts(\?.*)?$/);
  await page.goto(`/calendar?view=week&today=${today}`);
  await expect(todayCell(page).getByText(/Noyear's birthday/)).toHaveCount(0);
  await expect(todayCell(page).getByText(/Withyear's birthday/)).toBeVisible();
});

test("assignees: the household's members, and the filter shows a member's items plus the household's", async ({ browser }) => {
  const owner = await newSession(browser);
  await newOwner(owner.page, "cal5", "The Assigners");
  const mate = await addMember(browser, owner.page, "cal5mate");
  const page = owner.page;
  const today = iso();
  await page.goto(`/calendar?view=week&today=${today}`);

  async function add(title: string, who: string) {
    await page.getByRole("button", { name: "New event" }).click();
    const form = page.getByRole("dialog").filter({ hasText: "New event" });
    await form.getByLabel("Title").fill(title);
    if (who) {
      await form.getByRole("combobox", { name: "Assigned to" }).click();
      await page.locator(`.ant-select-item-option[title="${who}"]`).click();
    }
    await form.getByRole("button", { name: "Add" }).click();
    await expect(todayCell(page).getByText(title)).toBeVisible();
  }
  await add("For everyone", "");
  await add("For Casey", "Casey");
  await add("For the mate", "Joiner");
  await expect(todayCell(page).getByText("Joiner").first()).toBeVisible(); // the assignee's name is shown

  // Only the household's own members are offered (here the owner and the joiner), not strangers.
  await page.getByRole("combobox", { name: "Show items for" }).click();
  await expect(page.locator(".ant-select-item-option")).toHaveCount(3); // Everyone, Casey, Joiner
  await page.locator('.ant-select-item-option[title="Joiner"]').click();
  await expect(page).toHaveURL(/who=/);
  await expect(todayCell(page).getByText("For the mate")).toBeVisible();
  await expect(todayCell(page).getByText("For everyone")).toBeVisible();
  await expect(todayCell(page).getByText("For Casey")).toHaveCount(0);

  await page.getByRole("combobox", { name: "Show items for" }).click();
  await page.locator('.ant-select-item-option[title="Everyone"]').click();
  await expect(todayCell(page).getByText("For Casey")).toBeVisible();
  await mate.context.close();
  await owner.context.close();
});

test("planned meals can be shown, on the week and day views but not the month", async ({ page }) => {
  const { email } = await newOwner(page, "cal6", "The Mealers");
  await page.goto("/meals/library/new");
  await page.getByLabel("Name").fill("Tacos");
  await page.getByRole("button", { name: "Add meal" }).click();
  await expect(page).toHaveURL(/\/meals\/library\/(?!new)[a-z0-9]+/);
  await seedPlanEntry(email, "Tacos", iso());

  const today = iso();
  await page.goto(`/calendar?view=week&today=${today}`);
  await expect(todayCell(page).getByText("Dinner: Tacos")).toHaveCount(0);
  await page.getByRole("switch", { name: "Show meals" }).click();
  await expect(todayCell(page).getByRole("link", { name: "Dinner: Tacos" })).toBeVisible();
  await expect(todayCell(page).getByRole("link", { name: "Dinner: Tacos" })).toHaveAttribute("href", /\/meals\?week=/);
  await page.reload();
  await expect(todayCell(page).getByRole("link", { name: "Dinner: Tacos" })).toBeVisible(); // remembered for the household

  await page.goto(`/calendar?view=day&today=${today}`);
  await expect(page.getByRole("heading", { name: "Meals" })).toBeVisible();
  await page.goto(`/calendar?view=month&today=${today}`);
  await expect(page.getByText("Dinner: Tacos")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Show meals" })).toBeDisabled();
  await page.goto(`/calendar?view=week&today=${today}`);
  await page.getByRole("switch", { name: "Show meals" }).click();
  await expect(todayCell(page).getByText("Dinner: Tacos")).toHaveCount(0);
});

// "Today" is the browser's date: the server (UTC) must not decide it.
for (const [zone, instant, today, weekTitle] of [
  ["Pacific/Pago_Pago", "2026-10-11T08:00:00Z", "Sat Oct 10", "Oct 4 – 10, 2026"],
  ["Pacific/Kiritimati", "2026-10-10T20:00:00Z", "Sun Oct 11", "Oct 11 – 17, 2026"],
] as const) {
  test(`today is the browser's local date (${zone}), not the server's`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: base, timezoneId: zone });
    await ctx.clock.setFixedTime(new Date(instant));
    const p = await ctx.newPage();
    await newOwner(p, `caltz${zone.slice(-4).toLowerCase()}`, `The ${zone}ers`);
    await p.goto("/calendar");
    await expect(p.getByRole("heading", { level: 4 })).toHaveText(weekTitle);
    await expect(p.locator(".cal-day[data-today]")).toContainText(today);
    await ctx.close();
  });
}

test("on a phone: the week is a list with today first, the month is a compact grid, and a day opens from it", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await newOwner(page, "cal7", "The Phoners");
  const today = iso();
  await page.goto(`/calendar?view=week&today=${today}`);
  await expect(page.locator(".cal-day[data-today]")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await quickAdd(page, "Phone reminder");
  await expect(todayCell(page).getByText("Phone reminder")).toBeVisible();

  await page.goto(`/calendar?view=month&today=${today}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const cell = page.locator(".cal-cell[data-today]");
  await expect(cell.locator(".cal-dots")).toHaveText("1");
  await expect(cell.locator(".cal-chips")).toBeHidden();
  await cell.locator(".cal-dots").click();
  await expect(page).toHaveURL(/view=day/);
  await expect(page.getByText("Phone reminder")).toBeVisible();
  await ctx.close();
});

test("two people in a household see each other's changes without a manual refresh", async ({ browser }) => {
  test.setTimeout(120_000);
  const owner = await newSession(browser);
  await newOwner(owner.page, "cal8", "The Pollers");
  const mate = await addMember(browser, owner.page, "cal8mate");
  const today = iso();
  await owner.page.goto(`/calendar?view=week&today=${today}`);
  await mate.page.goto(`/calendar?view=week&today=${today}`);
  await quickAdd(mate.page, "From the mate");
  await expect(mate.page.locator(".cal-day[data-today]").getByText("From the mate")).toBeVisible();
  await expect(owner.page.locator(".cal-day[data-today]").getByText("From the mate")).toBeVisible({ timeout: 60_000 });
  await mate.context.close();
  await owner.context.close();
});

test("another household's calendar is separate", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  await newOwner(a.page, "cala", "The Calas");
  await newOwner(b.page, "calb", "The Calbs");
  const today = iso();
  await a.page.goto(`/calendar?view=week&today=${today}`);
  await quickAdd(a.page, "A's private reminder");
  await expect(a.page.getByText("A's private reminder")).toBeVisible();
  await b.page.goto(`/calendar?view=week&today=${today}`);
  await expect(b.page.locator(".cal-day[data-today]")).toBeVisible();
  await expect(b.page.getByText("A's private reminder")).toHaveCount(0);
  await a.context.close();
  await b.context.close();
});

test("the meals layer follows the planner: its visible meals, one-offs, the right order, and a link to the planner week", async ({ page }) => {
  const { email } = await newOwner(page, "cal9", "The Layers");
  await page.goto("/meals/library/new");
  await page.getByLabel("Name").fill("Pancakes");
  await page.getByRole("button", { name: "Add meal" }).click();
  await expect(page).toHaveURL(/\/meals\/library\/(?!new)[a-z0-9]+/);
  const today = iso();
  await seedPlanEntry(email, "Pancakes", today, "BREAKFAST");

  // A one-off dinner, added in the planner like anyone would.
  await page.goto(`/meals?today=${today}`);
  const now = new Date();
  const dayLabel = `${now.toLocaleDateString("en-US", { weekday: "short" })} ${now.toLocaleDateString("en-US", { month: "short" })} ${now.getDate()}`;
  await page.getByRole("button", { name: `Add to Dinner on ${dayLabel}` }).click();
  await page.getByRole("dialog").getByLabel("Meal").fill("Leftovers");
  await page.getByRole("dialog").getByRole("button", { name: "Add as one-off (not saved to library)" }).click();
  await expect(page.locator('.planner-cell[data-slot="DINNER"] .plan-entry')).toHaveText(["Leftovers"]);
  await page.reload();

  // Breakfast is hidden in the planner by default, so the calendar leaves it out too; dinner is in.
  await page.goto(`/calendar?view=week&today=${today}`);
  await page.getByRole("switch", { name: "Show meals" }).click();
  await expect(todayCell(page).getByText("Dinner: Leftovers")).toBeVisible();
  await expect(todayCell(page).getByText("Breakfast: Pancakes")).toHaveCount(0);

  // Switch breakfast on in the planner and it appears on the calendar, before dinner.
  await page.goto(`/meals?today=${today}`);
  await page.getByRole("button", { name: "Breakfast", exact: true }).click();
  await expect(page.locator('.planner-cell[data-slot="BREAKFAST"]')).toHaveCount(7);
  await page.goto(`/calendar?view=week&today=${today}`);
  await expect(todayCell(page).locator(".cal-entry-meal")).toHaveText(["Breakfast: Pancakes", "Dinner: Leftovers"]);

  // On the day view the meals sit in their own section, after the events.
  await page.goto(`/calendar?view=day&today=${today}`);
  await quickAdd(page, "Call the vet");
  await expect(page.locator(".cal-section-title")).toHaveText(["Events and reminders", "Meals"]);

  // Lighter than real items, read-only (no checkbox), and each links to that week in the planner.
  await page.goto(`/calendar?view=week&today=${today}`);
  const meal = todayCell(page).getByRole("link", { name: "Dinner: Leftovers" });
  await expect(meal.locator("xpath=..")).not.toContainText("Complete");
  await meal.click();
  await expect(page).toHaveURL(new RegExp(`/meals\\?week=${today}`));
  await expect(page.locator('.planner-cell[data-slot="DINNER"] .plan-entry')).toHaveText(["Leftovers"]);

  // Hiding a meal in the planner removes it from the calendar again.
  await page.getByRole("button", { name: "Breakfast", exact: true }).click();
  await expect(page.locator('.planner-cell[data-slot="BREAKFAST"]')).toHaveCount(0);
  await page.goto(`/calendar?view=week&today=${today}`);
  await expect(todayCell(page).getByText("Breakfast: Pancakes")).toHaveCount(0);
  await expect(todayCell(page).getByText("Dinner: Leftovers")).toBeVisible();
});

test("repeating: an event shows on every occurrence of the series", async ({ page }) => {
  await newOwner(page, "cal-rep", "The Repeaters");
  const today = iso();
  await page.goto(`/calendar?view=week&today=${today}`);

  // A daily event that began two days ago appears today (and on the other days of the week).
  await page.getByRole("button", { name: "New event" }).click();
  const form = page.getByRole("dialog").filter({ hasText: "New event" });
  await form.getByLabel("Title").fill("Water plants");
  await form.getByLabel("Date").fill(iso(-2));
  await form.getByRole("combobox", { name: "Repeats" }).click();
  await page.getByTitle("Repeats daily").click();
  await form.getByRole("button", { name: "Add" }).click();
  await expect(todayCell(page).getByText("Water plants")).toBeVisible();
  await todayCell(page).getByRole("button", { name: /Water plants/ }).click();
  await expect(page.getByRole("dialog").getByText(/Every day/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`/calendar?view=week&date=${iso(7)}&today=${today}`);
  await expect(page.locator(".cal-day").getByText("Water plants")).toHaveCount(7);
});
