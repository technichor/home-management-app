import { expect, type Page } from "@playwright/test";
import { addServiceProvider, choose, newOwner, test } from "./helpers";

test("the home page greets you and reflects what's in the household", async ({ page }) => {
  await newOwner(page, "home", "The Homes");
  await expect(page.getByRole("heading", { name: /Welcome back, Casey/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /General/ })).toBeVisible(); // every household starts with General
  await expect(page.getByText("No lists yet.")).toBeVisible();

  // A contact with a birthday today shows under "Coming up", and is found from the home page.
  const today = new Date().toISOString().slice(0, 10);
  await page.goto(`/contacts/new`);
  await page.getByLabel("First name").fill("Bertie");
  await page.getByLabel("Last name").fill("Birthday");
  await choose(page, "Category", "Service Provider");
  await page.getByLabel("Important date 1").fill(today);
  await page.getByLabel("Label").first().fill("Birthday");
  await page.getByLabel(/^Favorite/).click();
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: /Bertie Birthday/ })).toBeVisible();

  await page.getByRole("button", { name: "Home" }).click();
  await expect(page).toHaveURL(new RegExp(`/home$`));
  await expect(page.getByText("Bertie Birthday").first()).toBeVisible();
  await expect(page.getByText("Today")).toBeVisible();
  await expect(page.getByText("2 people in 1 household")).toBeVisible();

  // The cards link through to the real pages.
  await page.getByRole("link", { name: "Add contact" }).click();
  await expect(page).toHaveURL(new RegExp(`/contacts/new$`));
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("link", { name: "Invite someone" }).click();
  await expect(page).toHaveURL(new RegExp(`/household$`));
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
      `/account`,
      `/household`,
    ];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectFitsScreen(page, path);
    }

    // The signed-out and onboarding screens too.
    await page.getByRole("button", { name: "Log out" }).click();
    for (const path of ["/", "/login", "/signup", "/forgot-password"]) {
      await page.goto(path);
      await expectFitsScreen(page, path);
    }
  });

  test("navigation stays usable: every main tab is reachable and the coming-soon ones are hidden", async ({ page }) => {
    await newOwner(page, "nav", "The Navs");
    const tabs = page.locator(".tab-strip").first();
    for (const tab of ["Home", "Contacts", "Lists", "Messages"]) {
      await expect(tabs.getByRole("button", { name: tab, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /Meal Planning/ })).toBeHidden();
    await tabs.getByRole("button", { name: "Lists", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/lists$`));
    // Account / Household / Log out are in the top bar, not off screen.
    for (const name of ["Account", "Household", "Log out"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    }
  });

  test("forms are easy to use: 16px text (no iOS zoom), full-width filters, finger-sized buttons", async ({ page }) => {
    await newOwner(page, "forms", "The Formers");

    await page.goto(`/contacts/new`);
    const fontSize = await page.getByLabel("First name").evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe("16px");

    await page.goto(`/contacts`);
    const search = await page.locator(".ant-input-search").first().boundingBox();
    expect(search!.width).toBeGreaterThanOrEqual(375 - 24 - 2); // spans the whole row
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
