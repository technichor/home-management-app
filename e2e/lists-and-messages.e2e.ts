import { test, expect } from "@playwright/test";
import { newOwner } from "./helpers";

test("lists: create, add items, check one off, delete one", async ({ page }) => {
  const { slug } = await newOwner(page, "lists", "The Listers");
  await page.goto(`/${slug}/lists`);
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByPlaceholder("e.g. Costco run").fill("Costco run");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/lists/[a-z0-9]+`));

  const add = page.getByPlaceholder(/Add an item and press Enter/);
  for (const item of ["Milk", "Eggs", "Bread"]) {
    await add.fill(item);
    await add.press("Enter");
    await expect(page.getByText(item, { exact: true })).toBeVisible();
  }

  // Check one off; it survives a reload.
  await page.locator("li, div").filter({ hasText: /^Eggs$/ }).getByRole("checkbox").first().check();
  await page.reload();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(1);

  // Delete one with the confirmation.
  await page.getByRole("button", { name: "Delete item" }).first().click();
  await page.locator(".ant-modal-confirm .ant-btn-dangerous, .ant-modal-confirm .ant-btn-primary").last().click();
  await expect(page.getByText("This can not be undone.")).toHaveCount(0);

  // The list shows on the index with its progress.
  await page.goto(`/${slug}/lists`);
  await expect(page.getByText("Costco run")).toBeVisible();
});

test("another household can't open your list", async ({ page, browser }) => {
  const { slug } = await newOwner(page, "listown", "The Listowners");
  await page.goto(`/${slug}/lists`);
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByPlaceholder("e.g. Costco run").fill("Private list");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/lists/[a-z0-9]+`));
  const listPath = new URL(page.url()).pathname.split("/").slice(2).join("/");

  const other = await browser.newContext({ baseURL: `http://localhost:${process.env.E2E_APP_PORT ?? 3100}` });
  const otherPage = await other.newPage();
  const { slug: otherSlug } = await newOwner(otherPage, "listother", "The Others");
  await otherPage.goto(`/${otherSlug}/${listPath}`);
  await expect(otherPage.getByText(/could not be found/i)).toBeVisible();
  await expect(otherPage.getByText("Private list")).toHaveCount(0);
  await other.close();
});

test("messages: start a group chat and send a message", async ({ page }) => {
  const { slug } = await newOwner(page, "chat", "The Chatters");
  await page.goto(`/${slug}/messages`);
  await page.getByRole("button", { name: "New group chat" }).click();
  await page.getByPlaceholder("Name, e.g. Weekend plans").fill("Weekend plans");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/messages/[a-z0-9]+`));

  const box = page.getByPlaceholder(/Write a message/);
  await box.fill("Who is bringing snacks?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Who is bringing snacks?")).toBeVisible();
  await expect(page.getByText("Casey chat")).toBeVisible(); // sent as the signed-in user's own contact

  await page.reload();
  await expect(page.getByText("Who is bringing snacks?")).toBeVisible();

  await page.goto(`/${slug}/messages`);
  await expect(page.getByText("Weekend plans")).toBeVisible();
});
