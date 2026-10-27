import { expect, type Page } from "@playwright/test";
import { addMember, gotoMissing, newOwner, newSession, syncHouseholds, test, uniqueEmail, signUp, confirmEmail, createHousehold } from "./helpers";

const base = `http://localhost:${process.env.E2E_APP_PORT ?? 3100}`;

async function newList(page: Page, name: string, kind: "List" | "Gift ideas" = "List") {
  await page.goto("/lists");
  await page.getByRole("button", { name: "New list" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Costco run").fill(name);
  if (kind === "Gift ideas") await dialog.getByText("Gift ideas").click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/lists\/[a-z0-9]+$/);
  return new URL(page.url()).pathname;
}

async function addItem(page: Page, text: string, url?: string) {
  await page.getByPlaceholder(/Add an item/).fill(text);
  if (url) await page.getByLabel("Link for the new item").fill(url);
  await page.getByPlaceholder(/Add an item/).press("Enter");
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

const sharing = (page: Page) => page.getByRole("dialog").filter({ hasText: "Share this list" });

test("a gift list: ideas with links, public from the start, seen by anyone with the link (not checked ones)", async ({ page, browser }) => {
  await newOwner(page, "gift", "The Gifters");
  const listPath = await newList(page, "Corey's Christmas list", "Gift ideas");
  await expect(page.getByText("Gift ideas", { exact: true })).toBeVisible();
  await expect(page.locator(".list-who").getByText("Public")).toBeVisible();

  // Ideas with links; one click opens a link in a new tab.
  await addItem(page, "Lego set", "https://shop.example.test/lego");
  await addItem(page, "Wool socks");
  const lego = page.getByRole("link", { name: "Open Lego set (shop.example.test)" });
  await expect(lego).toHaveAttribute("href", "https://shop.example.test/lego");
  await expect(lego).toHaveAttribute("target", "_blank");
  // A link can be added or changed from the item's editor too.
  await page.getByRole("button", { name: "Edit item" }).nth(1).click(); // Wool socks, the second idea
  await expect(page.getByRole("dialog").getByPlaceholder("Item")).toHaveValue("Wool socks");
  await page.getByRole("dialog").getByLabel("Link").fill("https://socks.example.test/wool");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: "Open Wool socks (socks.example.test)" })).toBeVisible();

  // The public link, opened by someone who isn't signed in.
  await page.getByRole("button", { name: /Share/ }).click();
  const publicUrl = await sharing(page).getByLabel("The public link").inputValue();
  expect(publicUrl).toMatch(/\/l\/[A-Za-z0-9_-]{32}$/);
  await sharing(page).getByRole("button", { name: "Done" }).click();
  const visitor = await browser.newContext({ baseURL: base });
  const anon = await visitor.newPage();
  await anon.goto(new URL(publicUrl).pathname);
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Corey's Christmas list");
  await expect(anon.getByText("Gift ideas")).toBeVisible();
  await expect(anon.getByRole("link", { name: "Open Lego set (shop.example.test)" })).toHaveAttribute("target", "_blank");
  await expect(anon.getByRole("navigation")).toHaveCount(0); // none of the app

  // Something checked off ("got it") leaves the public page.
  await page.getByRole("checkbox", { name: "Done: Lego set" }).check();
  await expect(async () => {
    await anon.reload();
    await expect(anon.getByText("Lego set")).toHaveCount(0, { timeout: 2_000 });
  }).toPass();
  await expect(anon.getByText("Wool socks")).toBeVisible();

  // A new link: the old one stops working. Turning it off: so does the new one.
  await page.goto(listPath);
  await page.getByRole("button", { name: /Share/ }).click();
  await sharing(page).getByText("Make a new link").click();
  await page.locator(".ant-popconfirm:visible .ant-btn-primary").click();
  await expect(sharing(page).getByLabel("The public link")).not.toHaveValue(publicUrl);
  const newUrl = await sharing(page).getByLabel("The public link").inputValue();
  await anon.goto(new URL(publicUrl).pathname);
  await expect(anon.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await sharing(page).getByRole("switch", { name: "Public link" }).click();
  await expect(sharing(page).getByLabel("The public link")).toHaveCount(0);
  await anon.goto(new URL(newUrl).pathname);
  await expect(anon.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await visitor.close();
});

test("personal, household and shared: who sees a list, and who can change it", async ({ page, browser }) => {
  await newOwner(page, "share", "The Sharers");
  const mate = await addMember(browser, page, "sharemate");
  const listPath = await newList(page, "Birthday ideas");
  await addItem(page, "Kite");

  // Shared with the household by default: the mate sees and can edit it.
  await mate.page.goto("/lists");
  await expect(mate.page.getByRole("link", { name: "Birthday ideas" })).toBeVisible();
  await mate.page.goto(listPath);
  await expect(mate.page.getByPlaceholder(/Add an item/)).toBeVisible();

  // Personal: the household no longer sees it at all.
  await page.getByRole("button", { name: /Share/ }).click();
  await sharing(page).getByRole("switch", { name: "Share with the household" }).click();
  await expect(sharing(page).getByRole("switch", { name: "Share with the household" })).not.toBeChecked();
  await expect(page.locator(".list-who").getByText("Personal")).toBeVisible();
  await mate.page.goto("/lists");
  await expect(mate.page.getByRole("link", { name: "Birthday ideas" })).toHaveCount(0);
  await gotoMissing(mate.page, listPath);
  await expect(mate.page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();

  // Shared with the mate to view: it's under Shared with me, read only.
  await sharing(page).getByRole("combobox", { name: "Add people" }).click();
  await page.locator(".ant-select-item-option", { hasText: "Joiner sharemate" }).click();
  await sharing(page).getByRole("button", { name: "Add" }).click();
  // Saved: they have a row of their own (their name also shows in the picker until then).
  await expect(sharing(page).getByRole("combobox", { name: "What Joiner sharemate can do" })).toBeVisible();
  await mate.page.goto("/lists");
  const sharedWithMe = mate.page.getByRole("region", { name: "Shared with me" });
  await expect(sharedWithMe.getByText(/from Casey share · view only/)).toBeVisible();
  await sharedWithMe.getByRole("link", { name: "Birthday ideas" }).click();
  await expect(mate.page.getByText("View only")).toBeVisible();
  await expect(mate.page.getByPlaceholder(/Add an item/)).toHaveCount(0);
  await expect(mate.page.getByRole("checkbox", { name: "Done: Kite" })).toBeDisabled();

  // Allowed to edit: they can add.
  await sharing(page).getByRole("combobox", { name: "What Joiner sharemate can do" }).click();
  await page.locator(".ant-select-item-option[title='Can edit']:visible").click();
  await expect(async () => {
    await mate.page.reload();
    await expect(mate.page.getByPlaceholder(/Add an item/)).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await addItem(mate.page, "Puzzle");
  await expect(mate.page.getByRole("button", { name: /Share/ })).toHaveCount(0); // only the owner shares

  // They can take it off their lists.
  await mate.page.goto("/lists");
  await mate.page.getByRole("button", { name: "More for Birthday ideas" }).click();
  await mate.page.getByText("Remove from my lists").click();
  await expect(mate.page.getByRole("link", { name: "Birthday ideas" })).toHaveCount(0);
  await mate.context.close();
});

test("a list can be shared with someone in a synced household", async ({ page, browser }) => {
  await newOwner(page, "synca", "The Syncas");
  const other = await newSession(browser);
  const otherEmail = uniqueEmail("syncb");
  await signUp(other.page, { first: "Bea", last: "Syncb", email: otherEmail });
  await confirmEmail(other.page, otherEmail);
  await createHousehold(other.page, "The Syncbs");
  await syncHouseholds(page, other.page, otherEmail, "syncb");

  const listPath = await newList(page, "Shared wishlist");
  await addItem(page, "Board game");
  await page.getByRole("button", { name: /Share/ }).click();
  await sharing(page).getByRole("combobox", { name: "Add people" }).click();
  await page.locator(".ant-select-item-option", { hasText: "Bea Syncb (The Syncbs)" }).click();
  await sharing(page).getByRole("button", { name: "Add" }).click();
  await expect(sharing(page).getByRole("combobox", { name: "What Bea Syncb can do" })).toBeVisible();

  await other.page.goto("/lists");
  await other.page.getByRole("region", { name: "Shared with me" }).getByRole("link", { name: "Shared wishlist" }).click();
  await expect(other.page).toHaveURL(new RegExp(`${listPath}$`));
  await expect(other.page.getByText("Board game")).toBeVisible();
  await other.context.close();
});
