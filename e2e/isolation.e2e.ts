import { test, expect } from "@playwright/test";
import { addServiceProvider, newOwner, newSession } from "./helpers";

test("one account's contacts, households and exports are invisible to another", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  const ownerA = await newOwner(a.page, "isoa", "The Alphas");
  const ownerB = await newOwner(b.page, "isob", "The Betas");

  const contactId = await addServiceProvider(a.page, ownerA.slug, "Secretive", "Plumber", { address: "1 Hidden Way" });
  await expect(a.page.getByRole("heading", { name: /Secretive Plumber/ })).toBeVisible();

  // B's own directory doesn't list it...
  await b.page.goto(`/${ownerB.slug}/contacts`);
  await expect(b.page.getByText("Secretive")).toHaveCount(0);
  await b.page.goto(`/${ownerB.slug}/contacts/households`);
  await expect(b.page.getByText("The Alphas")).toHaveCount(0);

  // ...nor can B open it by id, under B's slug or A's.
  await b.page.goto(`/${ownerB.slug}/contacts/${contactId}`);
  await expect(b.page.getByText(/could not be found/i)).toBeVisible();
  await expect(b.page.getByText("Secretive")).toHaveCount(0);
  await b.page.goto(`/${ownerA.slug}/contacts/${contactId}`);
  await expect(b.page).toHaveURL(new RegExp(`/${ownerB.slug}$`)); // sent back to B's own
  await expect(b.page.getByText("Secretive")).toHaveCount(0);

  // B's CSV export has none of A's data.
  for (const file of ["contacts", "households"]) {
    const res = await b.page.request.get(`/${ownerB.slug}/contacts/api/export?file=${file}`);
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).not.toContain("Secretive");
    expect(csv).not.toContain("The Alphas");
    expect(csv).not.toContain("Hidden Way");
  }

  // And A's own export does include it.
  const mine = await a.page.request.get(`/${ownerA.slug}/contacts/api/export?file=contacts`);
  expect(await mine.text()).toContain("Secretive");

  // Nobody signed out can read an export.
  const anon = await newSession(browser);
  const res = await anon.page.request.get(`/${ownerA.slug}/contacts/api/export?file=contacts`);
  expect(res.status()).toBe(401);

  for (const s of [a, b, anon]) await s.context.close();
});
