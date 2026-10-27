import { expect } from "@playwright/test";
import { gotoMissing, newOwner, newSession, test } from "./helpers";

test("a document: add one from a pre-filled form, open its links, edit it, delete it; no other household sees it", async ({ page, browser }) => {
  await newOwner(page, "docs1", "The Documenters");

  // Pre-filled as an "Add link" button would: a passport, so it needs whose it is, and the title follows.
  await page.goto("/documents/new?type=passport");
  await expect(page.getByText(/Domata saves the link, not the file/)).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Passport");
  await page.getByRole("combobox", { name: "Whose" }).click();
  await page.locator(".ant-select-item-option[title='Casey']").click();
  await expect(page.getByLabel("Title")).toHaveValue("Passport – Casey");
  await page.getByLabel("Link 1", { exact: true }).fill("https://drive.google.com/file/d/passport-front/view");
  await page.getByLabel("Label for link 1").fill("Photo page");
  await page.getByRole("button", { name: /Add another link/ }).click();
  await page.getByLabel("Link 2", { exact: true }).fill("https://www.dropbox.com/s/passport-back");
  await page.getByLabel("Where the original is").fill("Fireproof safe");

  // Something like an ID number in the notes: a warning, not a block.
  await page.getByLabel("Notes").fill("Number 123456789, renew 2031");
  await expect(page.getByText("This looks like an ID or account number. Keep those in the file, not in Domata.")).toBeVisible();
  await page.getByRole("button", { name: "Add document" }).click();

  // Its page: what it is, whose, where the original is, and each link opening in a new tab.
  await expect(page.getByRole("heading", { name: "Passport – Casey" })).toBeVisible();
  const docPath = new URL(page.url()).pathname;
  expect(docPath).toMatch(/^\/documents\/[a-z0-9]+$/);
  await expect(page.getByText("Identity & vital records · Passport")).toBeVisible();
  await expect(page.getByText("Fireproof safe")).toBeVisible();
  const front = page.getByRole("link", { name: "Open Passport – Casey: Photo page (drive.google.com)" });
  await expect(front).toHaveAttribute("target", "_blank");
  await expect(front).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByRole("link", { name: "Open Passport – Casey (dropbox.com)" })).toBeVisible();

  // Edit: its own title stays, a link goes, and a javascript: link is refused.
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Passport – Casey");
  await page.getByRole("button", { name: "Remove link 2" }).click();
  await page.getByLabel("Link 1", { exact: true }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("A link must start with http:// or https://")).toBeVisible();
  await page.getByLabel("Link 1", { exact: true }).fill("https://drive.google.com/file/d/passport-2031/view");
  await page.getByLabel("Title").fill("Passport (2031) – Casey");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Passport (2031) – Casey" })).toBeVisible();
  await expect(page.getByRole("link", { name: /dropbox\.com/ })).toHaveCount(0);

  // Another household can't open it, or its edit page.
  const other = await newSession(browser);
  await newOwner(other.page, "docs2", "The Strangers");
  await gotoMissing(other.page, docPath);
  await expect(other.page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await gotoMissing(other.page, `${docPath}/edit`);
  await expect(other.page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await other.context.close();

  // Delete, after a confirm that says the file is untouched.
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("The file itself isn't touched.")).toBeVisible();
  await page.getByRole("tooltip").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await gotoMissing(page, docPath);
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
});

test("a custom document picks its category, and saving goes back to where the form was opened from", async ({ page }) => {
  await newOwner(page, "docs3", "The Customs");
  await page.goto("/documents/new?returnTo=/accounts");
  await page.getByRole("combobox", { name: "Type" }).fill("Custom");
  await page.locator(".ant-select-item-option[title='Custom (no type)']").click();
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.locator(".ant-select-item-option[title='Work']").click();
  await page.getByLabel("Title").fill("Badge photo");
  await page.getByLabel("Link 1", { exact: true }).fill("https://photos.example.test/badge");
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page).toHaveURL(/\/accounts$/);

  // A return address on another site is ignored: it goes to the document instead.
  await page.goto("/documents/new?type=will&returnTo=https://evil.example.test/");
  await page.getByLabel("Link 1", { exact: true }).fill("https://drive.google.com/will");
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page.getByRole("heading", { name: "Wills" })).toBeVisible();
  await expect(page.getByText("Legal & estate · Wills")).toBeVisible();
});
