import { expect, type Page } from "@playwright/test";
import { addMember, newOwner, newSession, test } from "./helpers";

const base = `http://localhost:${process.env.E2E_APP_PORT ?? 3100}`;

const iso = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const box = (page: Page) => page.getByRole("textbox", { name: "Add a to-do" });
const openList = (page: Page) => page.getByLabel("To-dos");
const openTexts = (page: Page) => openList(page).locator(".todo-text");
async function add(page: Page, text: string) {
  await box(page).fill(text);
  await box(page).press("Enter");
  await expect(openList(page).getByRole("button", { name: new RegExp(`^${text}`) })).toBeVisible();
}
async function pick(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="${option}"]`).last().click();
}
async function drag(page: Page, text: string, ontoText: string) {
  const from = await page.getByLabel(`Drag to reorder ${text}`).boundingBox();
  const to = await openList(page).getByRole("button", { name: new RegExp(`^${ontoText}`) }).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 5, from!.y + 10, { steps: 5 });
  await page.mouse.move(to!.x + 10, to!.y + to!.height / 2, { steps: 15 });
  await page.mouse.up();
}

test("the to-do list: add, assign, filter, reorder, finish, and details, shared by the household", async ({ page, browser }) => {
  await newOwner(page, "todo1", "The Doers");
  const mate = await addMember(browser, page, "todomate");

  await page.goto("/todo");
  await expect(page.getByText("Nothing to do. Add something above.")).toBeVisible();
  await expect(box(page)).toBeFocused();

  // Adding is one step: type and Enter, several in a row; the cursor stays in the box.
  await add(page, "Mow the lawn");
  await add(page, "Call the vet");
  await expect(box(page)).toBeFocused();

  // For a chosen person, with a due date one click in.
  await pick(page, "New to-dos are for", "Joiner");
  await page.getByRole("button", { name: "Add a due date" }).click();
  await page.getByLabel("Due date for the new to-do").fill(iso(0));
  await add(page, "Renew passport");
  await expect(openTexts(page)).toHaveText(["Mow the lawn", "Call the vet", "Renew passport"]);
  await expect(openList(page).locator(".todo-row", { hasText: "Renew passport" }).getByText("Today")).toBeVisible();

  // Assigning is one step on the row.
  await pick(page, "Who: Mow the lawn", "Casey");

  // Reordering by drag; the order is saved.
  await drag(page, "Renew passport", "Mow the lawn");
  await expect(openTexts(page)).toHaveText(["Renew passport", "Mow the lawn", "Call the vet"]);
  // Saved (the move shows at once; reload until the server has it).
  await expect(async () => {
    await page.reload();
    await expect(openTexts(page)).toHaveText(["Renew passport", "Mow the lawn", "Call the vet"], { timeout: 2_000 });
  }).toPass();

  // The filter: mine (with or without Anyone's), one member's, and it is remembered.
  await pick(page, "Show", "Mine");
  await expect(openTexts(page)).toHaveText(["Mow the lawn", "Call the vet"]);
  await page.getByRole("checkbox", { name: "Include Anyone" }).uncheck();
  await expect(openTexts(page)).toHaveText(["Mow the lawn"]);
  await page.reload();
  await expect(openTexts(page)).toHaveText(["Mow the lawn"]);
  await pick(page, "Show", "Joiner's");
  await expect(openTexts(page)).toHaveText(["Renew passport"]);
  await pick(page, "Show", "Everyone's");
  await page.getByRole("checkbox", { name: "Include Anyone" }).check();

  // The other member sees the same list, and their "Mine" is theirs.
  await mate.page.goto("/todo");
  await expect(openTexts(mate.page)).toHaveText(["Renew passport", "Mow the lawn", "Call the vet"]);
  await pick(mate.page, "Show", "Mine");
  await expect(openTexts(mate.page)).toHaveText(["Renew passport", "Call the vet"]);

  // Finishing is one step; done items are one click in, and can be undone.
  await page.getByRole("checkbox", { name: "Done: Call the vet" }).click();
  await expect(openTexts(page)).toHaveText(["Renew passport", "Mow the lawn"]);
  await page.getByRole("button", { name: "Done (1)" }).click();
  const done = page.getByLabel("Done");
  await expect(done.getByText("Call the vet")).toBeVisible();
  await done.getByRole("checkbox", { name: "Done: Call the vet" }).click();
  await expect(openTexts(page)).toHaveText(["Renew passport", "Mow the lawn", "Call the vet"]);

  // Details are one click in: notes (plain text), due date, delete.
  await openList(page).getByRole("button", { name: /^Mow the lawn/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Notes").fill("Front <b>and</b> back");
  await dialog.getByLabel("Due date").fill(iso(-2));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(openList(page).locator(".todo-row", { hasText: "Mow the lawn" }).locator(".todo-due")).toHaveAttribute("data-tone", "overdue");
  await openList(page).getByRole("button", { name: /^Mow the lawn/ }).click();
  await expect(page.getByRole("dialog").getByLabel("Notes")).toHaveValue("Front <b>and</b> back");
  expect(await page.locator("b").count()).toBe(0);
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.locator(".ant-popover .ant-btn-primary").click();
  await expect(openTexts(page)).toHaveText(["Renew passport", "Call the vet"]);

  // Clear done (the Done section is still open from before).
  await page.getByRole("checkbox", { name: "Done: Call the vet" }).click();
  await expect(page.getByLabel("Done").getByText("Call the vet")).toBeVisible();
  await page.getByRole("button", { name: "Clear done" }).click();
  await expect(page.getByRole("button", { name: /Done \(/ })).toHaveCount(0);

  await mate.context.close();
});

test("Prioritize: which matters more re-sorts the to-do list", async ({ page }) => {
  await newOwner(page, "todo2", "The Rankers");
  await page.goto("/todo");
  await add(page, "Paint fence");
  await add(page, "Fix roof");
  await page.getByRole("link", { name: "Prioritize" }).click();
  await expect(page.getByText("Which matters more?")).toBeVisible();
  // Each card also says who it's for.
  await expect(page.getByRole("button", { name: /Fix roof/ })).toContainText("Anyone");
  await page.getByRole("button", { name: /Fix roof/ }).click();
  await expect(page.getByText(/1 comparison made/)).toBeVisible();
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/todo(\?.*)?$/);
  await expect(openTexts(page)).toHaveText(["Fix roof", "Paint fence"]);
});

test("Home has a To-do column: yours and Anyone's, due ones first, checkable there; never on the calendar", async ({ page, browser }) => {
  await newOwner(page, "todo3", "The Dues");
  const mate = await addMember(browser, page, "todo3mate");
  await page.goto("/todo");
  await add(page, "Top priority");
  await pick(page, "New to-dos are for", "Joiner");
  await add(page, "Not mine");
  await pick(page, "New to-dos are for", "Anyone");
  await page.getByRole("button", { name: "Add a due date" }).click();
  await page.getByLabel("Due date for the new to-do").fill(iso(-1));
  await add(page, "Overdue thing");

  await page.goto("/home");
  const column = page.getByRole("region", { name: "To-do" });
  await expect(column.locator(".home-todo-row .brief-title")).toHaveText(["Overdue thing", "Top priority"]);
  await expect(column.locator(".home-todo-row").first()).toHaveAttribute("data-overdue", "true");
  // On a wide screen it is a column to the right of the other lists.
  const todoBox = await column.boundingBox();
  const attentionBox = await page.locator(".home-attention").boundingBox();
  expect(todoBox!.x).toBeGreaterThan(attentionBox!.x + attentionBox!.width);
  // Checking one off here takes it off the list.
  await column.getByRole("checkbox", { name: "Done: Top priority" }).click();
  await expect(column.getByText("Top priority")).toHaveCount(0);
  await page.goto("/todo");
  await expect(openTexts(page)).toHaveText(["Not mine", "Overdue thing"]);

  // The other member sees theirs.
  await mate.page.goto("/home");
  await expect(mate.page.getByRole("region", { name: "To-do" }).locator(".home-todo-row .brief-title")).toHaveText(["Overdue thing", "Not mine"]);
  await mate.context.close();

  await page.goto(`/calendar?view=week&today=${iso(0)}`);
  await expect(page.getByText("Overdue thing")).toHaveCount(0);
});

test("another household's to-do list is separate", async ({ browser, page }) => {
  await newOwner(page, "todo4", "The Privates");
  await page.goto("/todo");
  await add(page, "Secret chore");

  const { context, page: other } = await newSession(browser);
  await newOwner(other, "todo5", "The Neighbours");
  await other.goto("/todo");
  await expect(other.getByText("Secret chore")).toHaveCount(0);
  await expect(other.getByText("Nothing to do. Add something above.")).toBeVisible();
  await context.close();
});

test("on a phone, To-do is in the tab bar and the list fits the screen", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await newOwner(page, "todo6", "The Phones");
  await page.goto("/home");
  await page.locator(".tabbar").getByRole("link", { name: "To-do" }).click();
  await expect(page).toHaveURL(/\/todo/);
  await add(page, "A long to-do that has to wrap onto more than one line on a small phone screen to fit");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect.poll(async () => (await page.locator(".todo-row").first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Home shows the first three, with the rest one tap away.
  for (const t of ["Two", "Three", "Four", "Five"]) await add(page, t);
  await page.goto("/home");
  const column = page.getByRole("region", { name: "To-do" });
  await expect(column.locator(".home-todo-row:visible")).toHaveCount(3);
  await column.getByRole("button", { name: "Show 2 more" }).click();
  await expect(column.locator(".home-todo-row:visible")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await context.close();
});
