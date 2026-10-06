import { expect } from "@playwright/test";
import { addMember, newChannel, newOwner, newSession, gotoMissing, test } from "./helpers";

test("lists: create, add items, check one off, delete one", async ({ page }) => {
  await newOwner(page, "lists", "The Listers");
  await page.goto(`/lists`);
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByPlaceholder("e.g. Costco run").fill("Costco run");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/lists/[a-z0-9]+`));

  const add = page.getByPlaceholder(/Add an item and press Enter/);
  for (const item of ["Milk", "Eggs", "Bread"]) {
    await add.fill(item);
    await add.press("Enter");
    await expect(page.getByText(item, { exact: true })).toBeVisible();
  }

  // Check one off; it survives a reload.
  await page.locator("li, div").filter({ hasText: /^Eggs$/ }).getByRole("checkbox").first().check();
  await expect(async () => {
    await page.reload(); // until the save (shown at once) has reached the server
    await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(1, { timeout: 2_000 });
  }).toPass();

  // Delete one with the confirmation.
  await page.getByRole("button", { name: "Delete item" }).first().click();
  await page.locator(".ant-modal-confirm .ant-btn-dangerous, .ant-modal-confirm .ant-btn-primary").last().click();
  await expect(page.getByText("This can not be undone.")).toHaveCount(0);

  // The list shows on the index with its progress.
  await page.goto(`/lists`);
  await expect(page.getByText("Costco run")).toBeVisible();
});

test("another household can't open your list", async ({ page, browser }) => {
  await newOwner(page, "listown", "The Listowners");
  await page.goto(`/lists`);
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByPlaceholder("e.g. Costco run").fill("Private list");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/lists/[a-z0-9]+`));
  const listPath = new URL(page.url()).pathname;

  const { context: other, page: otherPage } = await newSession(browser);
  await newOwner(otherPage, "listother", "The Others");
  await gotoMissing(otherPage, listPath);
  await expect(otherPage.getByText(/could not be found/i)).toBeVisible();
  await expect(otherPage.getByText("Private list")).toHaveCount(0);
  await other.close();
});

test("messages: start a channel with a household member and send a message", async ({ page, browser }) => {
  await newOwner(page, "chat", "The Chatters");
  const joiner = await addMember(browser, page, "chatmate");
  await newChannel(page, "Weekend plans", [joiner.name]);

  const box = page.getByPlaceholder(/Write a message/);
  await box.fill("Who is bringing snacks?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Who is bringing snacks?")).toBeVisible();
  await expect(page.getByText("Casey chat")).toBeVisible(); // sent as the signed-in user

  await page.reload();
  await expect(page.getByText("Who is bringing snacks?")).toBeVisible();

  await page.goto(`/messages`);
  await expect(page.getByText("Weekend plans")).toBeVisible();
  await expect(page.getByText("General")).toBeVisible();

  // The other member sees it too.
  await joiner.page.goto(`/messages`);
  await joiner.page.getByText("Weekend plans").click();
  await expect(joiner.page.getByText("Who is bringing snacks?")).toBeVisible();
  await joiner.context.close();
});
