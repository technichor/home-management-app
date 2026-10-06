import { expect, type Page } from "@playwright/test";
import { addMember, addServiceProvider, choose, newOwner, test } from "./helpers";

test("the home page is a weekly brief: the week's meals, what needs attention, and what's coming up", async ({ page, browser }) => {
  await newOwner(page, "home", "The Homes");
  const brief = page.getByRole("heading", { level: 1 });
  await expect(brief).toHaveText("Nothing is planned this week yet, Casey.");
  await expect(page.getByText(/^Week of /)).toBeVisible();
  await expect(page.getByText("Nothing needs attention")).toBeVisible();
  await expect(page.getByRole("img", { name: /Sunday: open/ })).toBeVisible();
  await expect(page.locator(".brief-row[data-open]")).toHaveCount(7);
  // Every day is broken out under the drawing, today marked.
  await expect(page.locator(".brief-day")).toHaveCount(7);
  await expect(page.locator(".brief-day[data-today]")).toHaveCount(1);
  await expect(page.locator(".brief-day-title").first()).toHaveText("Open");

  // Meals planned this week appear in the headline, the drawing and the day-by-day list.
  await page.goto("/meals");
  await page.getByRole("button", { name: /^Add to Dinner on/ }).first().click();
  await page.getByRole("dialog").getByLabel("Meal").fill("Tacos");
  await page.getByRole("dialog").getByRole("button", { name: /Create .Tacos. and add/ }).click();
  await expect(page.locator('.planner-cell[data-slot="DINNER"] .plan-entry')).toHaveText(["Tacos"]);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(brief).toContainText("A light week, Casey, with the most planned on");
  await expect(page.locator(".brief-row", { hasText: "Dinner: Tacos." })).toHaveCount(1);
  await expect(page.locator(".brief-row[data-today]")).toHaveCount(1);
  await expect(page.locator(".brief-drawing circle")).toHaveCount(1);
  await expect(page.locator(".brief-day", { hasText: "Tacos" }).locator(".brief-day-title")).toHaveText("Tacos");
  // A day links to that week in the planner.
  await page.locator(".brief-row", { hasText: "Dinner: Tacos." }).click();
  await expect(page).toHaveURL(/\/meals\?week=\d{4}-\d{2}-\d{2}/);

  // A contact's birthday today is in the week; one a few days out is under Today & coming up.
  const iso = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  for (const [first, last, date] of [["Bertie", "Birthday", iso(0)], ["Later", "Person", iso(5)]]) {
    await page.goto(`/contacts/new`);
    await page.getByLabel("First name").fill(first);
    await page.getByLabel("Last name").fill(last);
    await choose(page, "Category", "Service Provider");
    await page.getByLabel("Important date 1").fill(date);
    await page.getByLabel("Label").first().fill("Birthday");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`${first} ${last}`) })).toBeVisible();
  }
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByText("Bertie Birthday's birthday").first()).toBeVisible();
  const coming = page.locator("section", { has: page.getByRole("heading", { name: "Today & coming up" }) });
  await expect(coming.getByText("Bertie Birthday's birthday")).toBeVisible();
  await expect(coming.getByText("Later Person's birthday")).toBeVisible();
  await expect(coming.getByText("Next 7 days")).toBeVisible();
  await expect(coming.getByRole("link", { name: "View calendar" })).toHaveAttribute("href", /\/calendar\?view=week/);

  // What needs attention: a message from someone else in the household shows up with a link to it.
  const mate = await addMember(browser, page, "homemate");
  await mate.page.goto("/messages");
  await mate.page.getByText("General").first().click();
  await mate.page.getByPlaceholder(/Write a message/).fill("Dinner is ready");
  await mate.page.getByRole("button", { name: "Send" }).click();
  await expect(mate.page.getByText("Dinner is ready")).toBeVisible();
  await page.goto("/home");
  const attention = page.locator("section", { has: page.getByRole("heading", { name: "Needs attention" }) });
  await expect(attention.getByText("General has 1 unread message")).toBeVisible();
  await expect(attention.getByText(/Dinner is ready/)).toBeVisible();
  await attention.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/messages\/[a-z0-9]+/);
  await mate.context.close();
});

// ---- Phone-sized screens ----

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  /** Nothing sticks out past the right edge, so the page never scrolls sideways. */
  async function expectFitsScreen(page: Page, where: string) {
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `${where} is wider than the screen`).toBeLessThanOrEqual(innerWidth);
  }

  test("every screen fits a 375px phone", async ({ page }) => {
    await newOwner(page, "phone", "The Phones With A Rather Long Household Name");

    // Some realistic data so the pages aren't empty.
    await page.goto(`/contacts/households/new`);
    await page.getByLabel("Household name").fill("The Reynolds Family With A Long Name");
    await page.getByLabel(/^Mailing address/).fill("1234 Long Street Name Avenue, Springfield, Illinois 62704");
    await page.getByRole("button", { name: "Add household" }).click();
    await expect(page).toHaveURL(/households\/(?!new$)[a-z0-9]+$/);
    const householdPath = new URL(page.url()).pathname;
    await page.goto(`/contacts/new`);
    await page.getByLabel("First name").fill("Alexandria");
    await page.getByLabel("Last name").fill("Reynolds-Montgomery");
    await choose(page, "Household", "The Reynolds Family With A Long Name");
    await page.getByLabel(/^Primary email/).fill("alexandria.reynolds.montgomery@example.com");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page).toHaveURL(/contacts\/(?!new$)[a-z0-9]+$/);
    const contactPath = new URL(page.url()).pathname;
    await addServiceProvider(page, "Pat", "Plumber", { address: "9 Elm St" });

    await page.goto(`/lists`);
    await page.getByRole("button", { name: "New list" }).click();
    await page.getByPlaceholder("e.g. Costco run").fill("Costco run");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/lists\/[a-z0-9]+/);
    const add = page.getByPlaceholder(/Add an item and press Enter/);
    await add.fill("A rather long item name that should wrap onto several lines on a phone");
    await add.press("Enter");
    await expect(page.getByText(/A rather long item name/)).toBeVisible();
    const listPath = new URL(page.url()).pathname;

    await page.goto(`/messages`);
    await page.getByText("General").first().click();
    await expect(page).toHaveURL(/messages\/[a-z0-9]+/);
    const box = page.getByPlaceholder(/Write a message/);
    await box.fill("A very long message that goes on and on so we can see how it wraps on a small screen");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/A very long message/)).toBeVisible();
    const chatPath = new URL(page.url()).pathname;

    const pages = [
      `/home`,
      `/contacts`,
      `/contacts/new`,
      contactPath,
      `${contactPath}/edit`,
      `/contacts/households`,
      `/contacts/households/new`,
      householdPath,
      `${householdPath}/edit`,
      `/contacts/import`,
      `/contacts/removed`,
      `/lists`,
      listPath,
      `${listPath}/compare`,
      `/lists/archived`,
      `/messages`,
      chatPath,
      `/meals/library`,
      `/meals/library/new`,
      `/meals/shopping`,
      `/calendar`,
      `/calendar?view=month`,
      `/calendar?view=day`,
      `/account`,
      `/household`,
    ];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectFitsScreen(page, path);
    }

    // The signed-out and onboarding screens too.
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Log out" }).click();
    for (const path of ["/", "/login", "/signup", "/forgot-password"]) {
      await page.goto(path);
      await expectFitsScreen(page, path);
    }
  });

  test("the home page's week strip is just day initials on a phone, with the detail in the list below", async ({ page }) => {
    await newOwner(page, "homephone", "The Homephones");
    await page.goto("/home");
    await expect(page.locator(".brief-day")).toHaveCount(7);
    await expect(page.locator(".brief-day-initial")).toHaveText(["S", "M", "T", "W", "T", "F", "S"]);
    await expect(page.locator(".brief-day-full").first()).toBeHidden();
    await expect(page.locator(".brief-day-title").first()).toBeHidden();
    await expect(page.locator(".brief-row", { hasText: "Nothing planned." }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test("navigation stays usable: a tab bar at the bottom with every module, and the rest under More", async ({ page }) => {
    await newOwner(page, "nav", "The Navs");
    const tabs = page.getByRole("navigation", { name: "Main" });
    for (const tab of ["Home", "Contacts", "Lists", "Messages", "More"]) {
      const box = await tabs.getByText(tab, { exact: true }).boundingBox();
      expect(box, tab).not.toBeNull();
      expect(box!.y + box!.height, tab).toBeLessThanOrEqual(812); // on screen (the 375x812 phone)
    }
    await expect(page.getByText(/Meal Planning/)).toHaveCount(0);
    await tabs.getByRole("link", { name: "Lists", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/lists$`));

    // Account / Household / Log out are one tap away under More.
    await tabs.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    for (const name of ["Account", "Household"]) await expect(sheet.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Log out" })).toBeVisible();
    await sheet.getByRole("link", { name: "Account", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("forms are easy to use: 16px text (no iOS zoom), full-width filters, finger-sized buttons", async ({ page }) => {
    await newOwner(page, "forms", "The Formers");

    await page.goto(`/contacts/new`);
    const fontSize = await page.getByLabel("First name").evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe("16px");

    await page.goto(`/contacts`);
    const search = await page.locator(".ant-input-search").first().boundingBox();
    expect(search!.width).toBeGreaterThanOrEqual(375 - 32 - 2); // spans the whole row
    const add = await page.getByRole("link", { name: "Add contact" }).boundingBox();
    expect(add!.height).toBeGreaterThanOrEqual(40);
  });

  test("the contact list says who each person is without the hidden columns", async ({ page }) => {
    await newOwner(page, "list", "The Lists");
    await addServiceProvider(page, "Pat", "Plumber");
    await page.goto(`/contacts`);
    await expect(page.getByText("Service Provider").first()).toBeVisible();
  });
});
