import { expect } from "@playwright/test";
import { gotoMissing, newOwner, newSession, test } from "./helpers";

test("a document: add one from a pre-filled form, open its links, edit it, delete it; no other household sees it", async ({ page, browser }) => {
  await newOwner(page, "docs1", "The Documenters");

  // Pre-filled as an "Add link" button would: a passport, so it needs whose it is, and the title follows.
  await page.goto("/documents/new?type=passport");
  await expect(page.getByText(/Domata saves the link, not the file/)).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Passport");
  await page.getByRole("combobox", { name: "Whose" }).click();
  await page.locator(".ant-select-item-option[title='Casey']").click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Passport – Casey");
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
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Passport – Casey");
  await page.getByRole("button", { name: "Remove link 2" }).click();
  await page.getByLabel("Link 1", { exact: true }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("A link must start with http:// or https://")).toBeVisible();
  await page.getByLabel("Link 1", { exact: true }).fill("https://drive.google.com/file/d/passport-2031/view");
  await page.getByLabel("Title", { exact: true }).fill("Passport (2031) – Casey");
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
  await page.getByLabel("Title", { exact: true }).fill("Badge photo");
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

test("the overview: fill a suggestion, say one doesn't apply and bring it back, search, and filter by whose", async ({ page }) => {
  await newOwner(page, "docs4", "The Overviews");
  // A kid without a login is a household member too.
  await page.goto("/contacts/households");
  await page.getByRole("main").getByText("The Overviews", { exact: true }).click();
  await page.getByRole("link", { name: /Add person/ }).click();
  await page.getByLabel("First name").fill("Ellie");
  await page.getByLabel("Last name").fill("Overview");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("link", { name: "Ellie Overview" })).toBeVisible();

  await page.getByRole("navigation", { name: "Modules" }).getByRole("link", { name: "Documents" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("heading", { name: "Documents (0)" })).toBeVisible();
  const identity = page.getByRole("region", { name: "Identity & vital records" });
  await expect(identity.getByText("0 of 9")).toBeVisible(); // four for each of two people, and the marriage certificate

  // Add Ellie's passport from its chip; saving comes back here.
  await identity.getByRole("link", { name: "Add link: Passport – Ellie" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Passport – Ellie");
  await page.getByLabel("Link 1", { exact: true }).fill("https://drive.google.com/file/d/ellie-passport/view");
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(identity.getByText("1 of 9")).toBeVisible();
  await expect(identity.getByText("· 1 of 2")).toBeVisible();
  await expect(identity.getByRole("link", { name: "Open Passport – Ellie (drive.google.com)" })).toHaveAttribute("target", "_blank");
  await expect(identity.getByRole("link", { name: "Add link: Passport – Ellie" })).toHaveCount(0);

  // A driver's license doesn't apply to Ellie (yet): it leaves the count, and comes back from Dismissed.
  await identity.getByRole("button", { name: "More for Driver's license or state ID – Ellie" }).click();
  await page.getByRole("menuitem", { name: "Doesn't apply to Ellie" }).click();
  await expect(identity.getByText("1 of 8")).toBeVisible();
  await page.getByRole("button", { name: "Dismissed (1)" }).click();
  await page.getByRole("button", { name: "Restore Driver's license or state ID – Ellie" }).click();
  await expect(identity.getByText("1 of 9")).toBeVisible();
  await expect(page.getByRole("button", { name: /Dismissed/ })).toHaveCount(0);

  // Search: what matches, and what isn't added yet.
  await page.getByLabel("Search documents").fill("passport");
  await expect(page.getByRole("region", { name: "Matching documents" }).getByRole("link", { name: "Passport – Ellie", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Not added yet" }).getByText("Passport – Casey")).toBeVisible();
  await page.getByLabel("Search documents").fill("");

  // Ellie's documents, one click away, and still chosen after a reload.
  await page.getByRole("combobox", { name: "Whose" }).click();
  await page.locator(".ant-select-item-option[title='Ellie']").click();
  await expect(page.getByText("1 of 5 suggestions added")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add link: Passport – Casey" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("1 of 5 suggestions added")).toBeVisible();
});

test("panels: a vehicle's title from its Maintenance page, a person's from their contact page; deleting the vehicle keeps the title", async ({ page }) => {
  await newOwner(page, "docs5", "The Panels");
  await page.goto("/maintenance/new");
  await page.getByLabel("Name").fill("Pacifica");
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByTitle("Vehicle", { exact: true }).click();
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByRole("heading", { name: "Pacifica" })).toBeVisible();
  const itemPath = new URL(page.url()).pathname;

  // The vehicle's Documents section suggests its title, and adding it comes back here.
  const panel = page.getByRole("region", { name: "Documents" });
  await panel.getByRole("link", { name: "Add Title" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Title – Pacifica");
  await page.getByLabel("Link 1", { exact: true }).fill("https://drive.google.com/file/d/pacifica-title/view");
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page).toHaveURL(new RegExp(`${itemPath}$`));
  await expect(panel.getByRole("link", { name: "Title – Pacifica", exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Add Title" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Add Registration" })).toBeVisible();

  // On /documents, under Vehicles.
  await page.goto("/documents");
  const vehicles = page.getByRole("region", { name: "Vehicles" });
  await expect(vehicles.getByRole("link", { name: "Title – Pacifica", exact: true })).toBeVisible();
  await expect(vehicles.getByText("1 of 4")).toBeVisible();

  // A household member's contact page: their documents and what they don't have yet.
  await page.goto("/contacts");
  await page.getByRole("link", { name: /Casey docs5/ }).first().click();
  const personal = page.getByRole("region", { name: "Documents" });
  await personal.getByRole("link", { name: "Add Passport" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Passport – Casey");
  await page.getByLabel("Link 1", { exact: true }).fill("https://drive.google.com/casey-passport");
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(personal.getByRole("link", { name: "Passport – Casey", exact: true })).toBeVisible();

  // Deleting the Pacifica keeps its title, as a Vehicles document of the household.
  await page.goto(itemPath);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("tooltip").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/maintenance$/);
  await page.goto("/documents");
  await expect(page.getByRole("region", { name: "Vehicles" }).getByRole("link", { name: "Title – Pacifica", exact: true })).toBeVisible();
});
