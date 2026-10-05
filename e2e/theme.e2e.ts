import { expect } from "@playwright/test";
import { newOwner, test } from "./helpers";

const base = `http://localhost:${process.env.E2E_APP_PORT ?? 3100}`;

for (const [scheme, background] of [
  ["light", "rgb(255, 255, 255)"],
  ["dark", "rgb(17, 17, 19)"],
] as const) {
  test(`follows a ${scheme} system: page, components and the remembered choice`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: base, colorScheme: scheme });
    const page = await context.newPage();

    // First visit (no cookie yet): settles on the system scheme and shows the page.
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    await expect(page.locator("html")).not.toHaveAttribute("data-pending", /.*/);
    await expect(page.locator("body")).toHaveCSS("background-color", background);
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === "scheme")?.value).toBe(scheme);

    // Ant Design's components match too: the page's card is the dark surface in dark, white in light.
    const card = await page.locator(".ant-card").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(card).toBe(scheme === "dark" ? "rgb(24, 24, 27)" : "rgb(255, 255, 255)");

    // Signed in, the sidebar is the scheme's sidebar color.
    await newOwner(page, `theme${scheme}`, `The ${scheme} Themes`);
    await expect(page.locator(".sidebar")).toHaveCSS("background-color", scheme === "dark" ? "rgb(12, 12, 14)" : "rgb(247, 247, 248)");
    await context.close();
  });
}

test("the system changing while the page is open switches it live", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: base, colorScheme: "light" });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(17, 17, 19)");
  await context.close();
});
