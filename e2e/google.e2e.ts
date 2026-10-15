import { expect, type Page } from "@playwright/test";
import { addMember, newOwner, newSession, test } from "./helpers";

// Google Calendar against the stand-in Google that scripts/e2e.mjs starts (scripts/fakeGoogle.mjs).

const fakeGoogle = `http://localhost:${process.env.E2E_GOOGLE_PORT ?? 3199}`;

const iso = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const todayCell = (page: Page) => page.locator(".cal-week-grid .tg-allday-cell[data-today], .cal-week-grid .tg-col[data-today]");

/** Link Google from the Account page, signing in to the stand-in Google as `email`. */
async function linkGoogle(page: Page, email: string) {
  await page.goto("/account");
  await page.getByRole("link", { name: "Connect Google Calendar" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page).toHaveURL(/\/account\?google=connected$/);
  await expect(page.getByText("Google is linked.")).toBeVisible();
  await expect(page.getByText(`Linked to ${email}.`)).toBeVisible();
}

async function shareCalendars(page: Page, names: string[]) {
  await page.goto("/account");
  for (const name of names) await page.getByRole("checkbox", { name: new RegExp(name) }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
}

async function googleEvents(summary: string): Promise<{ calendarId: string; event: { id: string; attendees?: { email: string }[] } }[]> {
  return (await fetch(`${fakeGoogle}/_test/events?summary=${encodeURIComponent(summary)}`)).json();
}

test("Google Calendar: link, share calendars, choose the household calendar, and send events with invites", async ({ browser }) => {
  const owner = await newSession(browser);
  const { email: ownerEmail } = await newOwner(owner.page, "goog1", "The Googlers");
  const mate = await addMember(browser, owner.page, "goog1mate");
  const page = owner.page;
  const ownerGoogle = `g.${ownerEmail}`;
  const mateGoogle = `g.${mate.email}`;

  // Cancelling Google's sign-in links nothing.
  await page.goto("/account");
  await page.getByRole("link", { name: "Connect Google Calendar" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Linking Google was cancelled.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();

  // The owner links Google and shares their Work calendar, which has a trip on it today.
  await linkGoogle(page, ownerGoogle);
  await fetch(`${fakeGoogle}/_test/events`, {
    method: "POST",
    body: JSON.stringify({ calendarId: `work.${ownerGoogle}`, event: { summary: "Trip to Denver", start: { date: iso() }, end: { date: iso(1) } } }),
  });
  await shareCalendars(page, ["Work"]);
  await page.goto(`/calendar?view=week`);
  const trip = todayCell(page).getByRole("link", { name: /Trip to Denver/ });
  await expect(trip).toBeVisible();
  await expect(trip).toHaveAttribute("title", "Casey's Work (Google Calendar)");
  // The home page's week shows it too, as the calendar does.
  await page.goto("/home");
  const homeToday = page.locator("section", { has: page.getByRole("heading", { name: "Today", exact: true }) });
  await expect(homeToday.getByRole("list", { name: "All day" })).toContainText("Trip to Denver");
  await page.goto(`/calendar?view=week`);

  // No household calendar yet: the event form doesn't offer Google.
  await page.getByRole("button", { name: "New event" }).click();
  await expect(page.getByRole("dialog").getByText("Create Google Calendar event")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The owner makes a new Google calendar for the household.
  await page.goto("/household");
  await expect(page.getByText("Not chosen: events made in Domata stay in Domata.")).toBeVisible();
  await page.getByRole("combobox", { name: "Household Google calendar" }).click();
  await page.locator('.ant-select-item-option[title="Create a new calendar for the household"]').click();
  await page.getByRole("button", { name: "Use this calendar" }).click();
  await expect(page.getByText(/Events made in Domata go to Domata · The Googlers in your Google account/)).toBeVisible();

  // The member links Google and shares their main calendar (where invitations land).
  await linkGoogle(mate.page, mateGoogle);
  await shareCalendars(mate.page, [mateGoogle.replace(/[.+]/g, "\\$&")]);

  // A household event goes to Google, inviting the member (not the owner, whose calendar it is).
  await page.goto(`/calendar?view=week`);
  await page.getByRole("button", { name: "New event" }).click();
  const form = page.getByRole("dialog").filter({ hasText: "New event" });
  await form.getByLabel("Title").fill("Soccer practice");
  await expect(form.getByRole("checkbox", { name: /Create Google Calendar event/ })).toBeChecked();
  await form.getByRole("button", { name: "Add" }).click();
  await expect(todayCell(page).getByText("Soccer practice")).toBeVisible();
  const sent = await googleEvents("Soccer practice");
  const household = sent.find((s) => s.calendarId.includes("@group.calendar.google.com"))!;
  expect(household.event.attendees).toEqual([{ email: mateGoogle }]);
  expect(sent.map((s) => s.calendarId)).toContain(mateGoogle); // the member's invitation

  // It shows once: the member's copy of the invitation isn't shown again.
  await page.reload();
  await expect(todayCell(page).getByText("Soccer practice")).toHaveCount(1);
  await todayCell(page).getByRole("button", { name: /Soccer practice/ }).click();
  await expect(page.getByRole("dialog").getByText(/In Google Calendar \(Domata · The Googlers\)/)).toBeVisible();

  // Unticking takes it out of Google (and the invitation with it).
  await page.getByRole("dialog").getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog").filter({ hasText: "Edit event" });
  await edit.getByRole("checkbox", { name: /Create Google Calendar event/ }).uncheck();
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  expect(await googleEvents("Soccer practice")).toEqual([]);

  // Unlinking the owner stops the household calendar too.
  await page.goto("/account");
  await page.getByRole("button", { name: "Unlink Google" }).click();
  await page.locator(".ant-popconfirm:visible .ant-btn-primary").click();
  await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toBeVisible();
  await page.goto("/household");
  await expect(page.getByText("Not chosen: events made in Domata stay in Domata.")).toBeVisible();
  await mate.context.close();
});
