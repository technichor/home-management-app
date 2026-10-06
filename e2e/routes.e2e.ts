import { expect, type Page } from "@playwright/test";
import { addServiceProvider, gotoMissing, newOwner, newSession, test } from "./helpers";

// URLs are the same for every household (the data comes from who you're signed in as): there is
// no per-household segment in any path.
const APP_PREFIXES = ["home", "contacts", "lists", "messages", "meals", "calendar", "accounts", "account", "household", "invite", "join"];

async function hrefs(page: Page): Promise<string[]> {
  return page.locator("a[href]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("href") ?? "").filter((h) => h.startsWith("/"))
  );
}

test("signed-out visitors are sent to log in from every app page", async ({ page }) => {
  for (const path of [
    "/home",
    "/contacts",
    "/contacts/new",
    "/contacts/households",
    "/contacts/households/new",
    "/contacts/import",
    "/contacts/removed",
    "/lists",
    "/lists/archived",
    "/messages",
    "/meals",
    "/meals/library",
    "/meals/library/new",
    "/meals/shopping",
    "/calendar",
    "/accounts",
    "/account",
    "/household",
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login$/);
  }
  expect((await page.request.get("/contacts/api/export?file=contacts")).status()).toBe(401);
});

test("the old per-household URLs are gone", async ({ page }) => {
  await newOwner(page, "oldurl", "The Oldurls");
  for (const path of ["/the-oldurls", "/the-oldurls/contacts", "/the-oldurls/lists", "/oldurl/home"]) {
    await gotoMissing(page, path);
    await expect(page.getByText(/could not be found/i), path).toBeVisible();
  }
});

test("no link anywhere in the app carries a household name", async ({ page }) => {
  await newOwner(page, "links", "The Linkers With A Name");
  const contactId = await addServiceProvider(page, "Pat", "Plumber");
  await page.goto("/lists");
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByPlaceholder("e.g. Costco run").fill("Costco run");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/lists\/[a-z0-9]+$/);
  const listPath = new URL(page.url()).pathname;
  await page.goto("/messages");
  await page.getByText("General").first().click();
  await expect(page).toHaveURL(/\/messages\/[a-z0-9]+$/);

  const pages = [
    "/home",
    "/contacts",
    `/contacts/${contactId}`,
    `/contacts/${contactId}/edit`,
    "/contacts/households",
    "/contacts/import",
    "/contacts/removed",
    "/lists",
    listPath,
    "/messages",
    "/meals/library",
    "/meals/library/new",
    "/meals/shopping",
    "/calendar",
    "/account",
    "/household",
  ];
  for (const path of pages) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    for (const href of await hrefs(page)) {
      const first = href.split(/[/?#]/)[1];
      expect(APP_PREFIXES, `${path} links to ${href}`).toContain(first);
    }
  }
});

test("signed in, the front page and logging in lead to /home; the nav goes where it says", async ({ page, browser }) => {
  await newOwner(page, "front", "The Fronts");
  await page.goto("/");
  await expect(page).toHaveURL(/\/home(\?.*)?$/);

  const nav = page.getByRole("navigation", { name: "Modules" });
  for (const [tab, path] of [
    ["Contacts", "/contacts"],
    ["Lists", "/lists"],
    ["Messages", "/messages"],
    ["Home", "/home"],
  ] as const) {
    await nav.getByRole("link", { name: tab, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}(\\?.*)?$`));
  }
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("link", { name: "Household", exact: true }).click();
  await expect(page).toHaveURL(/\/household$/);

  // A deep link survives logging in (the ?next= path no longer contains a household name either).
  const other = await newSession(browser);
  await other.page.goto("/lists");
  await expect(other.page).toHaveURL(/\/login$/);
  await other.context.close();
});

test("two accounts use identical URLs and see only their own data", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  await newOwner(a.page, "samea", "The Samea");
  await newOwner(b.page, "sameb", "The Sameb");
  await addServiceProvider(a.page, "Only", "InA");
  await addServiceProvider(b.page, "Only", "InB");

  for (const s of [a, b]) {
    await s.page.goto("/contacts");
    await expect(s.page.getByRole("link", { name: /Only In[AB]/ })).toHaveCount(1);
  }
  await expect(a.page.getByRole("link", { name: "Only InA" })).toBeVisible();
  await expect(b.page.getByRole("link", { name: "Only InB" })).toBeVisible();
  await a.page.goto("/household");
  await expect(a.page.getByRole("heading", { name: "The Samea" })).toBeVisible();
  await b.page.goto("/household");
  await expect(b.page.getByRole("heading", { name: "The Sameb" })).toBeVisible();
  for (const s of [a, b]) await s.context.close();
});

test("the 404 guard really catches a URL that doesn't exist (so tests can't pass against dead links)", async ({ page }) => {
  await newOwner(page, "guard", "The Guards");
  await expect(page.goto("/definitely-not-a-page")).rejects.toThrow(/unexpectedly shows the 404 page/);
  // ...while a deliberate visit to a missing page is allowed.
  await gotoMissing(page, "/definitely-not-a-page");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});
