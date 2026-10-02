import { expect } from "@playwright/test";
import { addServiceProvider, newOwner, newSession, gotoMissing, test } from "./helpers";

test("one account's contacts, households and exports are invisible to another", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  await newOwner(a.page, "isoa", "The Alphas");
  await newOwner(b.page, "isob", "The Betas");

  const contactId = await addServiceProvider(a.page, "Secretive", "Plumber", { address: "1 Hidden Way" });
  await expect(a.page.getByRole("heading", { name: /Secretive Plumber/ })).toBeVisible();

  // B's own directory doesn't list it...
  await b.page.goto(`/contacts`);
  await expect(b.page.getByText("Secretive")).toHaveCount(0);
  await b.page.goto(`/contacts/households`);
  await expect(b.page.getByText("The Alphas")).toHaveCount(0);

  // ...nor can B open it by id: the very same URL A uses shows B nothing.
  await gotoMissing(b.page, `/contacts/${contactId}`);
  await expect(b.page.getByText(/could not be found/i)).toBeVisible();
  await expect(b.page.getByText("Secretive")).toHaveCount(0);
  await gotoMissing(b.page, `/contacts/${contactId}/edit`);
  await expect(b.page.getByText(/could not be found/i)).toBeVisible();

  // B's CSV export has none of A's data.
  for (const file of ["contacts", "households"]) {
    const res = await b.page.request.get(`/contacts/api/export?file=${file}`);
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).not.toContain("Secretive");
    expect(csv).not.toContain("The Alphas");
    expect(csv).not.toContain("Hidden Way");
  }

  // And A's own export does include it.
  const mine = await a.page.request.get(`/contacts/api/export?file=contacts`);
  expect(await mine.text()).toContain("Secretive");

  // Nobody signed out can read an export.
  const anon = await newSession(browser);
  const res = await anon.page.request.get(`/contacts/api/export?file=contacts`);
  expect(res.status()).toBe(401);

  for (const s of [a, b, anon]) await s.context.close();
});
