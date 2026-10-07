import { expect } from "@playwright/test";
import { gotoMissing, newOwner, newSession, test } from "./helpers";

test("the maintenance inventory: add, see what to tell a repair person, record service, edit, delete", async ({ page }) => {
  await newOwner(page, "maint1", "The Maintainers");
  await page.goto("/maintenance");
  await expect(page.getByText(/Nothing here yet/)).toBeVisible();

  await page.getByRole("link", { name: "Add item" }).click();
  await page.getByLabel("Name").fill("Upstairs furnace");
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByTitle("Heating & cooling").click();
  await page.getByLabel("Location").fill("Attic");
  await page.getByLabel("Brand").fill("Carrier");
  await page.getByLabel("Model number").fill("59TP6");
  await page.getByLabel("Serial number").fill("SN-12345");
  await page.getByLabel("Year installed").fill("2004");
  await page.getByLabel("Service every (months)").fill("12");
  await page.getByLabel("Last serviced").fill("2020-01-01");
  await page.getByLabel("Manual link").fill("https://example.com/manual.pdf");
  await page.getByLabel("Notes").fill("Filter 16x25x1 <b>not bold</b>");
  await page.getByRole("button", { name: "Add item" }).click();

  // The detail page has what a repair person asks for.
  await expect(page.getByRole("heading", { name: "Upstairs furnace" })).toBeVisible();
  for (const text of ["Carrier", "59TP6", "SN-12345", "Attic"]) await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByText(/^2004 \(\d+ years old\)$/)).toBeVisible();
  await expect(page.getByText("Service was due Jan 1, 2021")).toBeVisible();
  const manual = page.getByRole("link", { name: "https://example.com/manual.pdf" });
  await expect(manual).toHaveAttribute("target", "_blank");
  // Notes are plain text, never HTML.
  await expect(page.getByText("<b>not bold</b>", { exact: false })).toBeVisible();
  expect(await page.locator("b").count()).toBe(0);

  // Recording service moves the next one on.
  await page.getByRole("button", { name: "Serviced today" }).click();
  await expect(page.getByText(/^Next service /)).toBeVisible();
  await expect(page.getByText(/Service was due/)).toHaveCount(0);

  // The list shows it, with its age and next service, and finds it by model.
  await page.goto("/maintenance");
  await expect(page.getByText(/Heating & cooling · Carrier 59TP6 · Attic · \d+ years old/)).toBeVisible();
  await page.getByLabel("Search maintenance items").fill("59tp6");
  await expect(page.getByRole("link", { name: /Upstairs furnace/ })).toBeVisible();
  await page.getByLabel("Search maintenance items").fill("nothing like it");
  await expect(page.getByText("Nothing matches.")).toBeVisible();
  await page.getByLabel("Search maintenance items").fill("");

  // Edit.
  await page.getByRole("link", { name: /Upstairs furnace/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Attic furnace");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Attic furnace" })).toBeVisible();

  // A link that isn't http(s) is refused.
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Manual link").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("The manual link must start with http:// or https://")).toBeVisible();

  // Delete.
  await page.getByRole("link", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("tooltip").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/maintenance(\?.*)?$/);
  await expect(page.getByText(/Nothing here yet/)).toBeVisible();
});

test("another household can't see or open an inventory item", async ({ browser, page }) => {
  await newOwner(page, "maint2", "The Owners");
  await page.goto("/maintenance/new");
  await page.getByLabel("Name").fill("Secret safe");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByRole("heading", { name: "Secret safe" })).toBeVisible();
  const path = new URL(page.url()).pathname;

  const { context, page: other } = await newSession(browser);
  await newOwner(other, "maint3", "The Neighbours");
  await other.goto("/maintenance");
  await expect(other.getByText("Secret safe")).toHaveCount(0);
  const response = await gotoMissing(other, path);
  expect(response?.status()).toBe(404);
  await context.close();
});

test("a service that comes due is a to-do: checking it off records the service, and the other way round", async ({ page }) => {
  await newOwner(page, "maintodo", "The Servicers");
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date();
  const today = fmt(now);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  const longAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const shown = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const lastServiced = () => page.locator(".ant-descriptions-row", { hasText: "Last serviced" }).locator(".ant-descriptions-item-content");

  // Two items due now (serviced three months ago, every three months), one far from due.
  const addItem = async (name: string, last: string, every = "3") => {
    await page.goto("/maintenance/new");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Service every (months)").fill(every);
    await page.getByLabel("Last serviced").fill(last);
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    return new URL(page.url()).pathname;
  };
  const filters = await addItem("Air filters", fmt(threeMonthsAgo));
  const heater = await addItem("Water heater", fmt(longAgo), "12");
  await addItem("Gutters", today, "6");

  // They are on the to-do list, marked as maintenance, due; the far one isn't.
  await page.goto("/todo");
  const list = page.getByLabel("To-dos");
  await expect(list.locator(".todo-text")).toHaveText(["Maintenance: Air filters", "Maintenance: Water heater"]);
  await expect(list.locator(".todo-maintenance")).toHaveCount(2);
  // Due today (or a day or two either side, near month ends where "three months ago" lands on another day).
  await expect(list.locator(".todo-row", { hasText: "Air filters" }).locator(".todo-due")).toBeVisible();

  // Checking one off records the service: the item's next service moves on.
  await list.getByRole("checkbox", { name: "Done: Maintenance: Air filters" }).click();
  await expect(list.getByText("Maintenance: Air filters")).toHaveCount(0);
  await page.goto(filters);
  await expect(lastServiced()).toHaveText(shown(now));

  // Unchecking it undoes that.
  await page.goto("/todo");
  await page.getByRole("button", { name: "Done (1)" }).click();
  await page.getByLabel("Done").getByRole("checkbox", { name: "Done: Maintenance: Air filters" }).click();
  await expect(list.getByText("Maintenance: Air filters")).toBeVisible();
  await expect(async () => {
    await page.goto(filters);
    await expect(lastServiced()).toHaveText(shown(threeMonthsAgo), { timeout: 2_000 });
  }).toPass();

  // "Serviced today" on the item checks its to-do off.
  await page.getByRole("button", { name: "Serviced today" }).click();
  await expect(lastServiced()).toHaveText(shown(now));
  await page.goto("/todo");
  await expect(list.locator(".todo-text")).toHaveText(["Maintenance: Water heater"]);

  // A maintenance to-do is skipped, not deleted; it stays closed (and the item is untouched).
  await list.getByRole("button", { name: /^Maintenance: Water heater/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Water heater" })).toHaveAttribute("href", heater);
  await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Skip this time" }).click();
  await page.getByRole("tooltip").getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("Nothing to do. Add something above.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Nothing to do. Add something above.")).toBeVisible();
  await page.goto(heater);
  await expect(lastServiced()).toHaveText(shown(longAgo));
});
