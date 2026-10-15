import { expect, type Page } from "@playwright/test";
import { addMember, addServiceProvider, choose, dayLabelIn, newOwner, test } from "./helpers";

test("the home page: today first, the next two days, then to-do, what else is on today and what needs attention", async ({ page, browser }) => {
  await newOwner(page, "home", "The Homes");
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const iso = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const today = page.locator("section", { has: page.getByRole("heading", { name: "Today", exact: true }) });
  const ahead = page.locator("section", { has: page.getByRole("heading", { name: "Next 2 days" }) });
  const also = page.locator("section", { has: page.getByRole("heading", { name: "Also today" }) });

  // A calm empty day.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Casey\.$/);
  await expect(today.getByText("Nothing on the calendar today.")).toBeVisible();
  await expect(ahead.locator(".home-card")).toHaveCount(2);
  await expect(ahead.getByText("Nothing planned.")).toHaveCount(2);
  await expect(also.getByRole("link", { name: /Shopping list/ })).toContainText("Nothing to buy");
  await expect(also.getByRole("link", { name: /Dinner tonight/ })).toContainText("Not planned");
  await expect(page.getByRole("button", { name: "Needs attention, 0 items" })).toBeVisible();
  // No week drawing, no week strip, no days gone by.
  await expect(page.locator(".brief-drawing, .brief-day, details")).toHaveCount(0);

  // New event, from the home page: a reminder today and an event tomorrow morning.
  await page.getByRole("button", { name: "New event" }).click();
  let form = page.getByRole("dialog").filter({ hasText: "New event" });
  await form.getByLabel("Title").fill("Picture day");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(form).toBeHidden();
  await expect(today.getByRole("list", { name: "All day" }).getByRole("link", { name: "Picture day" })).toBeVisible();
  await page.getByRole("button", { name: "New event" }).click();
  form = page.getByRole("dialog").filter({ hasText: "New event" });
  await form.getByLabel("Title").fill("Garbage pickup");
  await form.getByLabel("Date").fill(iso(1));
  await form.getByLabel("Start time").fill("07:00");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(form).toBeHidden();
  const tomorrow = ahead.locator(".home-card").first();
  await expect(tomorrow).toContainText("7:00 AM");
  await expect(tomorrow).toContainText("Garbage pickup");
  await tomorrow.locator(".home-card-title").click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?view=day&date=${iso(1)}`));

  // Tonight's dinner and the shopping list, whatever the calendar shows.
  await page.goto("/meals");
  await page.getByRole("button", { name: `Add to Dinner on ${dayLabelIn(zone)}` }).click();
  await page.getByRole("dialog").getByLabel("Meal").fill("Tacos");
  await page.getByRole("dialog").getByRole("button", { name: /Create .Tacos. and add/ }).click();
  await expect(page.locator('.planner-cell[data-slot="DINNER"] .plan-entry')).toHaveText(["Tacos"]);
  await page.goto("/meals/shopping");
  await page.getByLabel("Add an item").fill("Tortillas");
  await page.getByLabel("Add an item").press("Enter");
  await expect(page.getByRole("checkbox", { name: "Tortillas" })).toBeVisible();
  await page.goto("/home");
  await expect(also.getByRole("link", { name: /Dinner tonight/ })).toContainText("Tacos");
  await expect(also.getByRole("link", { name: /Shopping list/ })).toContainText("1 item");

  // A contact's birthday today is along the top of today.
  await page.goto(`/contacts/new`);
  await page.getByLabel("First name").fill("Bertie");
  await page.getByLabel("Last name").fill("Birthday");
  await choose(page, "Category", "Service Provider");
  await page.getByLabel("Important date 1").fill(iso(0));
  await page.getByLabel("Label").first().fill("Birthday");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: /Bertie Birthday/ })).toBeVisible();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(today.getByRole("list", { name: "All day" })).toContainText("Bertie: Birthday");

  // What needs attention: a message from someone else in the household, on the bell and at the bottom.
  const mate = await addMember(browser, page, "homemate");
  await mate.page.goto("/messages");
  await mate.page.getByText("General").first().click();
  await mate.page.getByPlaceholder(/Write a message/).fill("Dinner is ready");
  await mate.page.getByRole("button", { name: "Send" }).click();
  await expect(mate.page.getByText("Dinner is ready")).toBeVisible();
  await page.goto("/home");
  const attention = page.locator("section", { has: page.getByRole("heading", { name: /^Needs attention/ }) });
  await expect(attention.getByText("General has 1 unread message")).toBeVisible();
  await page.getByRole("button", { name: "Needs attention, 1 item" }).click();
  await page.locator(".ant-popover").getByRole("link", { name: /General has 1 unread message/ }).click();
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
    test.setTimeout(180_000); // it visits every screen in the app
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
      `/todo`,
      `/todo/prioritize`,
      `/maintenance`,
      `/maintenance/new`,
      `/accounts`,
      `/accounts/new`,
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
    await expect(page).toHaveURL(/\/login$/);
    for (const path of ["/", "/login", "/signup", "/forgot-password"]) {
      await page.goto(path);
      await expectFitsScreen(page, path);
    }
  });

  test("the home page is one column on a phone: today, the next days, then to-do", async ({ page }) => {
    await newOwner(page, "homephone", "The Homephones");
    await page.goto("/home");
    const top = async (name: string | RegExp) => (await page.getByRole("heading", { name, exact: typeof name === "string" }).boundingBox())!.y;
    const [today, ahead, todo, attention] = [await top("Today"), await top("Next 2 days"), await top("To-do"), await top(/^Needs attention/)];
    expect(today).toBeLessThan(ahead);
    expect(ahead).toBeLessThan(todo);
    expect(todo).toBeLessThan(attention);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test("navigation stays usable: a tab bar at the bottom with every module, and the rest under More", async ({ page }) => {
    await newOwner(page, "nav", "The Navs");
    const tabs = page.getByRole("navigation", { name: "Main" });
    for (const tab of ["Home", "To-do", "Lists", "Messages", "More"]) {
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
