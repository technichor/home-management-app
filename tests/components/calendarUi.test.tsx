// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/calendar/actions", () => ({
  createCalendarItemAction: vi.fn(),
  updateCalendarItemAction: vi.fn(),
  deleteCalendarItemAction: vi.fn(),
  setShowMealsAction: vi.fn(),
  setWeekStartAction: vi.fn(),
}));

import CalendarClient from "@/app/(app)/calendar/CalendarClient";
import { CALENDAR_POLL_MS, CALENDAR_LIST_QUERY } from "@/lib/calendarView";
import { datesInRange, viewRange } from "@/lib/dates";
import type { AgendaContactDateEntry, AgendaGoogleEntry, AgendaItemEntry, AgendaMealEntry } from "@/lib/agendaOrder";
import {
  createCalendarItemAction,
  deleteCalendarItemAction,
  setShowMealsAction,
  setWeekStartAction,
  updateCalendarItemAction,
} from "@/app/(app)/calendar/actions";

// Today is Wed 7 Oct 2026; the week is Sun 4 - Sat 10.
const TODAY = "2026-10-07";
let n = 0;
const item = (over: Partial<AgendaItemEntry> = {}): AgendaItemEntry => ({
  source: "item", id: `i${++n}`, itemId: over.id ?? `i${n}`, date: TODAY, title: "Item", notes: null, startTime: null, endTime: null,
  assigneeContactId: null, assigneeName: null, createdAt: `2026-10-01T00:00:${String(n).padStart(2, "0")}Z`, repeat: null, google: { wanted: true, sent: false, error: null }, editable: true, ...over,
});
const birthday = (over: Partial<AgendaContactDateEntry> = {}): AgendaContactDateEntry => ({
  source: "contact_date", id: `c${++n}`, date: TODAY, title: "Jo's birthday", type: "birthday", contactId: "c9", turns: null, editable: false, ...over,
});
const meal = (over: Partial<AgendaMealEntry> = {}): AgendaMealEntry => ({
  source: "meal", id: `m${++n}`, date: TODAY, slot: "DINNER", title: "Dinner: Tacos", startTime: null, createdAt: "2026-10-01T00:00:00Z", editable: false, ...over,
});
const gEvent = (over: Partial<AgendaGoogleEntry> = {}): AgendaGoogleEntry => ({
  source: "google", id: `g${++n}`, googleId: `g${n}`, date: TODAY, title: "Standup", startTime: null, endTime: null, link: "https://calendar.google.com/e",
  calendarName: "Work", color: "#f00", ownerName: "Sam", ownerContactId: "m1", editable: false, ...over,
});
const members = [{ id: "m1", name: "Sam", fullName: "Sam Doe" }, { id: "m2", name: "Ann", fullName: "Ann Doe" }];

type Props = React.ComponentProps<typeof CalendarClient>;
const props = (over: Partial<Props> = {}): Props => ({
  view: "week", anchor: "2026-10-04", dates: datesInRange(viewRange("week", "2026-10-04", "SUNDAY")),
  prev: "2026-09-27", next: "2026-10-11", today: TODAY, weekStartsOn: "SUNDAY", showMeals: false,
  assignees: members, assigneeFilter: null, entries: [], ...over,
});
const wrap = (p: Props) => (
  <App>
    <CalendarClient {...p} />
  </App>
);
const setup = (over: Partial<Props> = {}) => render(wrap(props(over)));
// The week renders both its hour grid (wide screens) and its list of days (phones); CSS shows one. jsdom has no CSS,
// so tests pick the one they mean.
const grid = () => within(document.querySelector(".cal-week-grid") as HTMLElement);
const weekList = () => within(document.querySelector(".cal-week") as HTMLElement);
const month = (over: Partial<Props> = {}) =>
  setup({ view: "month", anchor: "2026-10-01", dates: datesInRange(viewRange("month", "2026-10-01", "SUNDAY")), prev: "2026-09-01", next: "2026-11-01", ...over });
const day = (over: Partial<Props> = {}) =>
  setup({ view: "day", anchor: TODAY, dates: [TODAY], prev: "2026-10-06", next: "2026-10-08", ...over });

beforeEach(() => {
  vi.resetAllMocks();
  n = 0;
  for (const fn of [createCalendarItemAction, updateCalendarItemAction, deleteCalendarItemAction, setShowMealsAction, setWeekStartAction]) {
    vi.mocked(fn as any).mockResolvedValue({ ok: true });
  }
  vi.mocked(createCalendarItemAction).mockResolvedValue({ ok: true, id: "new" });
});

describe("the header", () => {
  it("names what is viewed and links previous, next, today and the three views", () => {
    setup();
    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent("Oct 4 – 10, 2026");
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/calendar?view=week&date=2026-09-27");
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/calendar?view=week&date=2026-10-11");
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/calendar?view=week&date=2026-10-07");
    const views = within(screen.getByRole("navigation", { name: "View" }));
    expect(views.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");
    // Today is in this week, so switching view goes to today (the Day view opens on today, not on Sunday).
    expect(views.getByRole("link", { name: "Day" })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-07");
    expect(views.getByRole("link", { name: "Month" })).toHaveAttribute("href", "/calendar?view=month&date=2026-10-07");
  });

  it("switches view within the period being looked at when today isn't in it", () => {
    setup({ anchor: "2026-10-18", dates: datesInRange(viewRange("week", "2026-10-18", "SUNDAY")), prev: "2026-10-11", next: "2026-10-25" });
    const views = within(screen.getByRole("navigation", { name: "View" }));
    expect(views.getByRole("link", { name: "Day" })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-18");
    expect(views.getByRole("link", { name: "Month" })).toHaveAttribute("href", "/calendar?view=month&date=2026-10-18");
  });

  it("keeps the chosen member in every link", () => {
    setup({ assigneeFilter: "m1" });
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", expect.stringMatching(/&who=m1$/));
    expect(screen.getByRole("link", { name: "Day" })).toHaveAttribute("href", expect.stringMatching(/&who=m1$/));
  });

  it("titles the day and month views", () => {
    const { unmount } = day();
    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent("Wednesday, Oct 7, 2026");
    unmount();
    month();
    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent("October 2026");
  });

  it("makes New event the main button, starting on today when today is in view", async () => {
    setup();
    const button = screen.getByRole("button", { name: "New event" });
    expect(button).toHaveClass("ant-btn-primary");
    await userEvent.click(button);
    expect((await dialogTitled("New event")).getByLabelText("Date")).toHaveValue(TODAY);
  });

  it("starts a new event on the day being viewed, or the first day of a period without today", async () => {
    const { unmount } = day({ anchor: "2026-10-09", dates: ["2026-10-09"] });
    await userEvent.click(screen.getByRole("button", { name: /New event/ }));
    expect((await dialogTitled("New event")).getByLabelText("Date")).toHaveValue("2026-10-09");
    unmount();
    setup({ anchor: "2026-10-18", dates: datesInRange(viewRange("week", "2026-10-18", "SUNDAY")) });
    await userEvent.click(screen.getByRole("button", { name: /New event/ }));
    expect((await dialogTitled("New event")).getByLabelText("Date")).toHaveValue("2026-10-18");
  });

  it("has no quick-add line", () => {
    setup();
    expect(screen.queryByPlaceholderText(/Add an event/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  describe("settings", () => {
    const openSettings = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Calendar settings" }));
      return dialogTitled("Calendar settings");
    };

    it("are behind a button beside the views, not on the page", async () => {
      setup();
      expect(screen.queryByRole("combobox", { name: "Show items for" })).toBeNull();
      expect(screen.queryByRole("switch", { name: "Show meals" })).toBeNull();
      const settings = await openSettings();
      expect(settings.getByRole("combobox", { name: "Show items for" })).toBeInTheDocument();
      expect(settings.getByRole("combobox", { name: "Week starts on" })).toBeInTheDocument();
      expect(settings.getByRole("switch", { name: "Show meals" })).toBeInTheDocument();
      await userEvent.click(settings.getByRole("button", { name: "Done" }));
      // Closing (jsdom never finishes Ant Design's closing animation, so check that it has started).
      await waitFor(() => expect(document.querySelector(".ant-modal")!.className).toMatch(/leave/));
    });

    it("close with their corner button too", async () => {
      setup();
      const settings = await openSettings();
      await userEvent.click(settings.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(document.querySelector(".ant-modal")!.className).toMatch(/leave/));
    });

    it("filters by member, keeping the view and date", async () => {
      setup();
      const settings = await openSettings();
      await userEvent.click(settings.getByRole("combobox", { name: "Show items for" }));
      await userEvent.click(await screen.findByTitle("Sam"));
      expect(router.push).toHaveBeenCalledWith("/calendar?view=week&date=2026-10-04&who=m1");
    });

    it("goes back to everyone", async () => {
      setup({ assigneeFilter: "m1" });
      const settings = await openSettings();
      await userEvent.click(settings.getByRole("combobox", { name: "Show items for" }));
      await userEvent.click(await screen.findByTitle("Everyone"));
      expect(router.push).toHaveBeenCalledWith("/calendar?view=week&date=2026-10-04");
    });

    it("changes the week's first day (shared with the planner) and refreshes", async () => {
      setup();
      const settings = await openSettings();
      await userEvent.click(settings.getByRole("combobox", { name: "Week starts on" }));
      await userEvent.click(await screen.findByTitle("Monday"));
      expect(setWeekStartAction).toHaveBeenCalledWith("MONDAY");
      await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    });

    it("shows the reason when a setting can't be saved", async () => {
      vi.mocked(setWeekStartAction).mockResolvedValue({ ok: false, error: "Invalid setting" });
      setup();
      const settings = await openSettings();
      await userEvent.click(settings.getByRole("combobox", { name: "Week starts on" }));
      await userEvent.click(await screen.findByTitle("Monday"));
      expect(await screen.findByText("Invalid setting")).toBeInTheDocument();
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("turns planned meals on and off, on any view", async () => {
      const { unmount } = setup();
      let toggle = (await openSettings()).getByRole("switch", { name: "Show meals" });
      expect(toggle).not.toBeChecked();
      await userEvent.click(toggle);
      expect(setShowMealsAction).toHaveBeenCalledWith(true);
      unmount();
      month({ showMeals: true });
      toggle = (await openSettings()).getByRole("switch", { name: "Show meals" });
      expect(toggle).toBeChecked();
      await userEvent.click(toggle);
      expect(setShowMealsAction).toHaveBeenLastCalledWith(false);
    });
  });

  describe("a member filter", () => {
    it("is shown by the title, with a way back to everyone, and marked on the settings button", async () => {
      setup({ assigneeFilter: "m2" });
      expect(screen.getByText("Only Ann")).toBeInTheDocument();
      expect(document.querySelector(".ant-badge-dot")).not.toBeNull();
      await userEvent.click(screen.getByLabelText("Show everyone"));
      expect(router.push).toHaveBeenCalledWith("/calendar?view=week&date=2026-10-04");
    });

    it("isn't shown for everyone, or for someone who is no longer a member", () => {
      const { unmount } = setup();
      expect(screen.queryByText(/^Only /)).toBeNull();
      expect(document.querySelector(".ant-badge-dot")).toBeNull();
      unmount();
      setup({ assigneeFilter: "gone" });
      expect(screen.queryByText(/^Only /)).toBeNull();
    });
  });
});

describe("polling", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("refreshes every 30 seconds while the tab is visible, and when the window gets focus", () => {
    setup();
    router.refresh.mockClear();
    act(() => vi.advanceTimersByTime(CALENDAR_POLL_MS * 2));
    expect(router.refresh).toHaveBeenCalledTimes(2);
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(router.refresh).toHaveBeenCalledTimes(3);
  });

  it("does nothing in a hidden tab, and stops when closed", () => {
    const { unmount } = setup();
    router.refresh.mockClear();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    act(() => vi.advanceTimersByTime(CALENDAR_POLL_MS));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(router.refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    unmount();
    act(() => vi.advanceTimersByTime(CALENDAR_POLL_MS * 2));
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("the week", () => {
  it("shows seven days, today marked, each with an add button", () => {
    setup();
    const days = [...document.querySelectorAll(".cal-day")];
    expect(days).toHaveLength(7);
    expect(days[3]).toHaveAttribute("data-today");
    expect(days[3]).toHaveTextContent("Today");
    expect(days.filter((d) => d.hasAttribute("data-today"))).toHaveLength(1);
    expect(weekList().getByRole("button", { name: "Add to Wed Oct 7" })).toBeInTheDocument();
    expect(weekList().getByRole("link", { name: /Mon Oct 5/ })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-05");
  });

  it("shows each kind of entry: reminders and events with times, contact dates, meals", () => {
    setup({
      entries: [
        birthday({ turns: 41 }),
        item({ title: "Picture day" }),
        item({ title: "Dentist", startTime: "09:30", endTime: "10:15", assigneeContactId: "m1", assigneeName: "Sam" }),
        meal({ title: "Dinner: Tacos" }),
      ],
    });
    const today = document.querySelector(".cal-day[data-today]") as HTMLElement;
    const inDay = within(today);
    expect(inDay.getByRole("link", { name: /Jo's birthday/ })).toHaveAttribute("href", "/contacts/c9");
    expect(inDay.getByText("turns 41")).toBeInTheDocument();
    expect(inDay.getByText("Picture day")).toBeInTheDocument();
    expect(inDay.getByText("9:30 AM – 10:15 AM")).toBeInTheDocument();
    expect(inDay.getByText("Sam")).toBeInTheDocument();
    expect(inDay.getByRole("link", { name: "Dinner: Tacos" })).toHaveAttribute("href", "/meals?week=2026-10-07");
    expect([...today.querySelectorAll(".cal-entry-title")].map((e) => e.textContent)).toEqual(["Jo's birthday", "Picture day", "Dentist", "Dinner: Tacos"]);
  });

  it("doesn't say 'turns' for a birthday with no year", () => {
    setup({ entries: [birthday({ turns: null })] });
    expect(screen.queryByText(/turns/)).toBeNull();
  });

});

describe("on a narrow screen", () => {
  const original = window.matchMedia;
  const scrolled = vi.fn();
  beforeEach(() => {
    scrolled.mockClear();
    window.HTMLElement.prototype.scrollIntoView = scrolled;
  });
  afterEach(() => {
    window.matchMedia = original;
  });
  const narrow = (on: boolean) => {
    window.matchMedia = ((q: string) => ({ matches: on && q === CALENDAR_LIST_QUERY, media: q, addEventListener() {}, removeEventListener() {} })) as any;
  };

  it("brings today to the top of the week's list", () => {
    narrow(true);
    setup();
    expect(scrolled).toHaveBeenCalledWith({ block: "start" });
  });

  it("leaves it alone on a wide screen, or when today isn't in the week", () => {
    narrow(false);
    setup();
    narrow(true);
    setup({ dates: datesInRange(viewRange("week", "2026-10-18", "SUNDAY")), anchor: "2026-10-18" });
    expect(scrolled).not.toHaveBeenCalled();
  });
});

describe("the day", () => {
  it("is an hour grid: what has no time along the top, timed events and meals as blocks at their times", () => {
    day({ entries: [birthday(), item({ title: "Picture day" }), item({ title: "Dentist", startTime: "09:00" }), meal(), meal({ id: "m-timed", title: "Lunch: Soup", slot: "LUNCH", startTime: "12:00" })] });
    const allDay = within(document.querySelector(".tg-allday-cell") as HTMLElement);
    expect(allDay.getByText("Jo's birthday")).toBeInTheDocument();
    expect(allDay.getByText("Picture day")).toBeInTheDocument();
    expect(allDay.getByText("Dinner: Tacos")).toBeInTheDocument();
    const column = document.querySelector(".tg-col") as HTMLElement;
    const dentist = within(column).getByRole("button", { name: /Dentist/ });
    expect(dentist).toHaveStyle({ top: `${9 * 48}px`, height: `${24 - 2}px` });
    expect(dentist).toHaveTextContent("9:00 AM");
    expect(within(column).getByRole("link", { name: /Lunch: Soup/ })).toHaveAttribute("href", "/meals?week=2026-10-07");
    expect(document.querySelector(".tg-heads")).toBeNull(); // one day: the page title says which
  });

  it("says when there is nothing, and still offers to add something", () => {
    day();
    expect(screen.getByText("Nothing on the calendar for Oct 7, 2026.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Wed Oct 7" })).toBeInTheDocument();
  });

  it("only shows its own day's entries", () => {
    day({ entries: [item({ title: "Today thing" }), item({ title: "Other day", date: "2026-10-08" })] });
    expect(screen.getByText("Today thing")).toBeInTheDocument();
    expect(screen.queryByText("Other day")).toBeNull();
  });
});

describe("the month", () => {
  it("is a grid of whole weeks with the day names, today marked, and days of other months dimmed", () => {
    month();
    expect([...document.querySelectorAll('[role="columnheader"]')].map((c) => c.textContent)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    const cells = [...document.querySelectorAll(".cal-cell")];
    expect(cells).toHaveLength(35);
    expect(cells[0]).toHaveAttribute("data-outside");
    expect(cells[0]).toHaveTextContent("27");
    expect(cells[4]).not.toHaveAttribute("data-outside");
    expect(cells.filter((c) => c.hasAttribute("data-today"))).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open Oct 7, 2026" })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-07");
  });

  it("starts the week on Monday when the household does", () => {
    setup({ view: "month", anchor: "2026-10-01", weekStartsOn: "MONDAY", dates: datesInRange(viewRange("month", "2026-10-01", "MONDAY")) });
    expect([...document.querySelectorAll('[role="columnheader"]')].map((c) => c.textContent)[0]).toBe("Mon");
  });

  it("shows up to three entries in a cell, then '+N more' that opens the day", () => {
    month({ entries: [item({ title: "One" }), item({ title: "Two" }), item({ title: "Three" }), item({ title: "Four" }), item({ title: "Five" })] });
    const cell = document.querySelector(".cal-cell[data-today]") as HTMLElement;
    expect(cell.querySelectorAll(".cal-chips .cal-entry")).toHaveLength(3);
    expect(within(cell).queryByText("Four")).toBeNull();
    expect(within(cell).getByRole("link", { name: "+2 more" })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-07");
  });

  it("shows exactly three with no '+N more'", () => {
    month({ entries: [item({ title: "A" }), item({ title: "B" }), item({ title: "C" })] });
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it("shows a count for the compact (phone) grid, opening the day", () => {
    month({ entries: [item({ title: "A" }), item({ title: "B" })] });
    const dots = screen.getByRole("link", { name: "2 on Oct 7, 2026" });
    expect(dots).toHaveTextContent("2");
    expect(dots).toHaveAttribute("href", "/calendar?view=day&date=2026-10-07");
    expect(document.querySelectorAll(".cal-dots")).toHaveLength(1);
  });

  it("shows events, birthdays and meals compactly, and an event chip opens its details", async () => {
    month({ entries: [birthday(), item({ title: "Call the vet" }), meal()] });
    expect(screen.getByRole("link", { name: /Jo's birthday/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dinner: Tacos" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Call the vet/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Call the vet");
  });


  it("has an add button on each day", async () => {
    month();
    await userEvent.click(screen.getByRole("button", { name: "Add to Fri Oct 9" }));
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-09");
  });
});



describe("a day's '+'", () => {
  it("opens a new event on that day", async () => {
    setup();
    await userEvent.click(grid().getByRole("button", { name: "Add to Sat Oct 10" }));
    const form = await dialogTitled("New event");
    expect(form.getByLabelText("Date")).toHaveValue("2026-10-10");
    expect(form.getByLabelText("Title")).toHaveFocus();
  });
});


// jsdom's date/time inputs are plain inputs: set them the way a browser would.
import { fireEvent } from "@testing-library/react";
const fireChange = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const dialogTitled = async (title: string) => within((await screen.findByText(title, { selector: ".ant-modal-title" })).closest('[role="dialog"]') as HTMLElement);

describe("an item's details", () => {
  const open = async (title: string) => {
    await userEvent.click(grid().getByRole("button", { name: new RegExp(title) }));
    return within(await screen.findByRole("dialog"));
  };

  it("shows an event with its date, time, assignee and notes as plain text", async () => {
    setup({ entries: [item({ title: "Dentist", startTime: "09:00", endTime: "10:00", assigneeName: "Sam", notes: "Bring the card\n  <b>not bold</b>" })] });
    const dialog = await open("Dentist");
    expect(dialog.getByText("Event · Oct 7, 2026 · 9:00 AM – 10:00 AM · Sam")).toBeInTheDocument();
    const notes = dialog.getByText(/Bring the card/);
    expect(notes.textContent).toBe("Bring the card\n  <b>not bold</b>");
    expect(notes).toHaveStyle({ whiteSpace: "pre-wrap" });
    expect(document.querySelector(".ant-modal b")).toBeNull();
  });

  it("calls an untimed event a reminder, for the whole household unless assigned", async () => {
    setup({ entries: [item({ title: "Picture day" })] });
    const dialog = await open("Picture day");
    expect(dialog.getByText("Reminder · Oct 7, 2026 · Whole household")).toBeInTheDocument();
    expect(dialog.queryByRole("checkbox")).toBeNull();
  });


  it("deletes after confirming, then closes and refreshes", async () => {
    setup({ entries: [item({ id: "i9", title: "Picture day" })] });
    const dialog = await open("Picture day");
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteCalendarItemAction).toHaveBeenCalledWith("i9"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("shows the reason when deleting fails", async () => {
    vi.mocked(deleteCalendarItemAction).mockResolvedValue({ ok: false, error: "That item isn't on your calendar any more" });
    setup({ entries: [item({ title: "Picture day" })] });
    const dialog = await open("Picture day");
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("That item isn't on your calendar any more")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("opens the full form to edit, filled in", async () => {
    setup({ entries: [item({ id: "i9", title: "Dentist", startTime: "09:00", endTime: "10:00", notes: "Card", assigneeContactId: "m1", assigneeName: "Sam" })] });
    const dialog = await open("Dentist");
    await userEvent.click(dialog.getByRole("button", { name: "Edit" }));
    const form = (await dialogTitled("Edit event"));
    expect(form.getByLabelText("Title")).toHaveValue("Dentist");
    expect(form.getByLabelText("Date")).toHaveValue(TODAY);
    expect(form.getByLabelText("Start time")).toHaveValue("09:00");
    expect(form.getByLabelText("End time")).toHaveValue("10:00");
    expect(form.getByLabelText("Notes")).toHaveValue("Card");
  });
});

describe("the full form", () => {
  const openNew = async () => {
    await userEvent.click(screen.getByRole("button", { name: "New event" }));
    return (await dialogTitled("New event"));
  };

  describe("start, end and duration", () => {
    const durationShown = (form: ReturnType<typeof within>) => form.getByRole("combobox", { name: "Duration" }).closest(".ant-select")!.textContent;

    it("has no end or duration until there is a start; then it is half an hour long", async () => {
      setup();
      const form = await openNew();
      expect(form.getByLabelText("End time")).toBeDisabled();
      expect(form.getByRole("combobox", { name: "Duration" })).toBeDisabled();
      fireChange(form.getByLabelText("Start time"), "09:00");
      expect(form.getByLabelText("End time")).toHaveValue("09:30");
      expect(durationShown(form)).toBe("30 min");
    });

    it("sets the end from a chosen duration", async () => {
      setup();
      const form = await openNew();
      fireChange(form.getByLabelText("Start time"), "09:00");
      await userEvent.click(form.getByRole("combobox", { name: "Duration" }));
      await userEvent.click(await screen.findByTitle("1.5 hr"));
      expect(form.getByLabelText("End time")).toHaveValue("10:30");
    });

    it("keeps the length when the start moves, and clears the end with the start", async () => {
      setup();
      const form = await openNew();
      fireChange(form.getByLabelText("Start time"), "09:00");
      fireChange(form.getByLabelText("End time"), "10:00");
      fireChange(form.getByLabelText("Start time"), "14:15");
      expect(form.getByLabelText("End time")).toHaveValue("15:15");
      expect(durationShown(form)).toBe("1 hr");
      fireChange(form.getByLabelText("Start time"), "");
      expect(form.getByLabelText("End time")).toHaveValue("");
    });

    it("shows a typed end that isn't a usual length as what it is, and no duration for an end before the start", async () => {
      setup();
      const form = await openNew();
      fireChange(form.getByLabelText("Start time"), "09:00");
      fireChange(form.getByLabelText("End time"), "10:10");
      expect(durationShown(form)).toBe("1 hr 10 min");
      fireChange(form.getByLabelText("End time"), "08:00");
      expect(durationShown(form)).toBe("Duration");
      // A moved start then falls back to half an hour.
      fireChange(form.getByLabelText("Start time"), "11:00");
      expect(form.getByLabelText("End time")).toHaveValue("11:30");
    });

    it("never ends past midnight", async () => {
      setup();
      const form = await openNew();
      fireChange(form.getByLabelText("Start time"), "23:45");
      expect(form.getByLabelText("End time")).toHaveValue("23:59");
    });

    it("keeps a saved event's own end, and leaves it blank if it had none", async () => {
      setup({ entries: [item({ id: "i1", title: "Long", startTime: "09:00", endTime: "12:00" }), item({ id: "i2", title: "Open-ended", startTime: "13:00" })] });
      await userEvent.click(grid().getByRole("button", { name: /Long/ }));
      await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit" }));
      const form = await dialogTitled("Edit event");
      expect(form.getByLabelText("End time")).toHaveValue("12:00");
      expect(durationShown(form)).toBe("3 hr");
    });

    it("leaves a saved event with no end open-ended", async () => {
      setup({ entries: [item({ id: "i2", title: "Open-ended", startTime: "13:00" })] });
      await userEvent.click(grid().getByRole("button", { name: /Open-ended/ }));
      await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit" }));
      const form = await dialogTitled("Edit event");
      expect(form.getByLabelText("End time")).toHaveValue("");
    });
  });

  it("creates an event with every field, then closes and refreshes", async () => {
    setup();
    const form = await openNew();
    await userEvent.type(form.getByLabelText("Title"), "Dentist");
    fireChange(form.getByLabelText("Date"), "2026-10-09");
    fireChange(form.getByLabelText("Start time"), "09:00");
    fireChange(form.getByLabelText("End time"), "10:00");
    await userEvent.type(form.getByLabelText("Notes"), "Bring the card");
    await userEvent.click(form.getByRole("combobox", { name: "Assigned to" }));
    await userEvent.click(await screen.findByTitle("Ann"));
    await userEvent.click(form.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(createCalendarItemAction).toHaveBeenCalledWith({
      title: "Dentist", date: "2026-10-09", notes: "Bring the card", startTime: "09:00", endTime: "10:00", assigneeContactId: "m2",
      repeatUnit: null, repeatEvery: 1, repeatUntil: "", toGoogle: true,
    }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("sets a repeat: every N units, optionally until a date", async () => {
    setup();
    const form = await openNew();
    expect(form.queryByLabelText("Repeat every")).toBeNull();
    await userEvent.type(form.getByLabelText("Title"), "Change filter");
    await userEvent.click(form.getByRole("combobox", { name: "Repeats" }));
    await userEvent.click(await screen.findByTitle("Repeats monthly"));
    fireChange(form.getByLabelText("Repeat every"), "3");
    fireChange(form.getByLabelText("Repeat until"), "2027-12-31");
    await userEvent.click(form.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(createCalendarItemAction).toHaveBeenCalledWith(expect.objectContaining({ repeatUnit: "MONTH", repeatEvery: 3, repeatUntil: "2027-12-31" })));
  });

  it("starts on the viewed or current date, for the whole household", async () => {
    setup();
    const form = await openNew();
    expect(form.getByLabelText("Date")).toHaveValue(TODAY);
    expect(form.getByText("Whole household")).toBeInTheDocument();
  });


  it("only allows an end time once there is a start time", async () => {
    setup();
    const form = await openNew();
    expect(form.getByLabelText("End time")).toBeDisabled();
    fireChange(form.getByLabelText("Start time"), "09:00");
    expect(form.getByLabelText("End time")).toBeEnabled();
  });

  it("keeps the form open and shows the reason when saving fails", async () => {
    vi.mocked(createCalendarItemAction).mockResolvedValue({ ok: false, error: "The end time must be after the start time" });
    setup();
    const form = await openNew();
    await userEvent.type(form.getByLabelText("Title"), "Dentist");
    await userEvent.click(form.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("The end time must be after the start time")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("needs a title", async () => {
    setup();
    const form = await openNew();
    expect(form.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("cancels without saving", async () => {
    setup();
    const form = await openNew();
    await userEvent.click(form.getByRole("button", { name: "Cancel" }));
    expect(createCalendarItemAction).not.toHaveBeenCalled();
  });

  it("saves an edit, and can hand an item back to the whole household", async () => {
    setup({ entries: [item({ id: "i9", title: "Dentist", assigneeContactId: "m1", assigneeName: "Sam" })] });
    await userEvent.click(grid().getByRole("button", { name: /Dentist/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit" }));
    const form = (await dialogTitled("Edit event"));
    await userEvent.clear(form.getByLabelText("Title"));
    await userEvent.type(form.getByLabelText("Title"), "Dentist (moved)");
    await userEvent.click(form.getByRole("combobox", { name: "Assigned to" }));
    await userEvent.click(await screen.findByTitle("Whole household"));
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateCalendarItemAction).toHaveBeenCalledWith("i9", expect.objectContaining({ title: "Dentist (moved)", assigneeContactId: null })));
  });

  it("edits a repeating event as its series: the start date, not the occurrence, with the repeat filled in", async () => {
    const repeat = { unit: "WEEK" as const, every: 2, until: "2027-01-01", start: "2026-09-23" };
    setup({ entries: [item({ id: "i9@2026-10-07", itemId: "i9", title: "Trash", repeat })] });
    await userEvent.click(grid().getByRole("button", { name: /Trash/ }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/Every 2 weeks, until Jan 1, 2027/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Edit" }));
    const form = (await dialogTitled("Edit event"));
    expect(form.getByLabelText("Date")).toHaveValue("2026-09-23");
    expect(form.getByLabelText("Repeat every")).toHaveValue(2);
    expect(form.getByLabelText("Repeat until")).toHaveValue("2027-01-01");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateCalendarItemAction).toHaveBeenCalledWith("i9", expect.objectContaining({ repeatUnit: "WEEK", repeatEvery: 2, date: "2026-09-23" })));
  });


  it("keeps an assignee who has since been removed, marked as removed", async () => {
    setup({ entries: [item({ id: "i9", title: "Dentist", assigneeContactId: "gone", assigneeName: "Pat" })] });
    await userEvent.click(grid().getByRole("button", { name: /Dentist/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit" }));
    const form = (await dialogTitled("Edit event"));
    expect(form.getByText("Pat (removed)")).toBeInTheDocument();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateCalendarItemAction).toHaveBeenCalledWith("i9", expect.objectContaining({ assigneeContactId: "gone" })));
  });

  it("calls a removed assignee with no name a former member, and offers current members otherwise", async () => {
    setup({ entries: [item({ title: "Dentist", assigneeContactId: "gone", assigneeName: null })] });
    await userEvent.click(grid().getByRole("button", { name: /Dentist/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit" }));
    const form = (await dialogTitled("Edit event"));
    expect(form.getByText("Former member (removed)")).toBeInTheDocument();
    await userEvent.click(form.getByRole("combobox", { name: "Assigned to" }));
    expect(await screen.findByTitle("Sam")).toBeInTheDocument();
    expect(screen.getByTitle("Ann")).toBeInTheDocument();
  });

});

describe("the hour grid", () => {
  const column = (date: string) => document.querySelector(`.cal-week-grid .tg-col[data-date="${date}"]`) as HTMLElement;

  it("heads the week's seven days, today marked, and opens scrolled to the morning", () => {
    setup();
    const heads = [...document.querySelectorAll(".cal-week-grid .tg-head")];
    expect(heads).toHaveLength(7);
    expect(heads[3]).toHaveAttribute("data-today");
    expect(heads[3]).toHaveTextContent("Today");
    expect((document.querySelector(".cal-week-grid .tg-scroll") as HTMLElement).scrollTop).toBe(7 * 48 - 8); // a little above, so "7 AM" shows
    expect([...document.querySelectorAll(".cal-week-grid .tg-hour")].map((h) => h.textContent).slice(0, 3)).toEqual(["", "1 AM", "2 AM"]);
  });

  it("never scrolls above midnight", () => {
    setup({ entries: [item({ title: "Night feed", startTime: "00:00" })] });
    expect((document.querySelector(".cal-week-grid .tg-scroll") as HTMLElement).scrollTop).toBe(0);
  });

  it("opens earlier when something starts before 7", () => {
    setup({ entries: [item({ title: "Early run", startTime: "05:45" })] });
    expect((document.querySelector(".cal-week-grid .tg-scroll") as HTMLElement).scrollTop).toBe(5.25 * 48 - 8);
  });

  it("puts overlapping events side by side", () => {
    setup({ entries: [item({ title: "Dentist", startTime: "09:00", endTime: "10:00" }), item({ title: "Call", startTime: "09:30" })] });
    const dentist = within(column(TODAY)).getByRole("button", { name: /Dentist/ });
    const call = within(column(TODAY)).getByRole("button", { name: /Call/ });
    expect(dentist).toHaveStyle({ left: "calc(0% + 2px)", width: "calc(50% - 4px)", top: `${9 * 48}px`, height: `${48 - 2}px` });
    expect(call).toHaveStyle({ left: "calc(50% + 2px)", width: "calc(50% - 4px)" });
    expect(dentist).toHaveAttribute("title", "9:00 AM \u2013 10:00 AM Dentist");
    expect(dentist).not.toHaveAttribute("data-short");
    expect(call).toHaveAttribute("data-short"); // half an hour: one line, "Call, 9:30 AM"
    expect(call).toHaveTextContent("Call9:30 AM"); // (the comma after the title is drawn by CSS)
  });

  it("names who an event is for next to its time", () => {
    setup({ entries: [item({ title: "Dentist", startTime: "09:00", assigneeContactId: "m1", assigneeName: "Sam" }), item({ title: "Swim", startTime: "11:00" })] });
    expect(within(column(TODAY)).getByRole("button", { name: /Dentist/ })).toHaveTextContent("9:00 AM · Sam");
    expect(within(column(TODAY)).getByRole("button", { name: /Swim/ })).toHaveTextContent(/11:00 AM$/);
  });

  it("starts a new event at the half hour clicked", async () => {
    setup();
    fireEvent.click(column("2026-10-08"), { clientY: 9.75 * 48 });
    const form = await dialogTitled("New event");
    expect(form.getByLabelText("Date")).toHaveValue("2026-10-08");
    expect(form.getByLabelText("Start time")).toHaveValue("09:30");
    expect(form.getByLabelText("End time")).toHaveValue("10:00"); // half an hour, to start with
  });

  it("opens an event, or goes to the planner for a meal, without starting a new event", async () => {
    setup({ entries: [item({ title: "Dentist", startTime: "09:00" }), meal({ title: "Dinner: Tacos", startTime: "17:30" })], showMeals: true });
    const tacos = within(column(TODAY)).getByRole("link", { name: /Dinner: Tacos/ });
    expect(tacos).toHaveAttribute("href", "/meals?week=2026-10-07");
    fireEvent.click(tacos);
    expect(screen.queryByText("New event", { selector: ".ant-modal-title" })).toBeNull();
    await userEvent.click(within(column(TODAY)).getByRole("button", { name: /Dentist/ }));
    expect(await screen.findByText(/Event · Oct 7, 2026 · 9:00 AM/)).toBeInTheDocument();
    expect(screen.queryByText("New event", { selector: ".ant-modal-title" })).toBeNull();
  });

  it("draws a line at the current time on today, and keeps it current", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 7, 14, 30));
    setup();
    const now = () => column(TODAY).querySelector(".tg-now") as HTMLElement;
    expect(now()).toHaveStyle({ top: `${14.5 * 48}px` });
    expect(column("2026-10-08").querySelector(".tg-now")).toBeNull();
    act(() => vi.advanceTimersByTime(60_000));
    expect(parseFloat(now().style.top)).toBeCloseTo(((14 * 60 + 31) / 60) * 48);
    vi.useRealTimers();
  });
});

describe("Google Calendar", () => {
  it("shows a member's Google event as a link to it in Google, saying whose calendar it's from", () => {
    setup({ entries: [gEvent({ title: "Flight" })] });
    const link = weekList().getByRole("link", { name: /Flight/ });
    expect(link).toHaveAttribute("href", "https://calendar.google.com/e");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("title", "Sam's Work (Google Calendar)");
    expect(link).toHaveTextContent("Sam");
  });

  it("shows a timed Google event on the hour grid, with its owner, and on the month as a chip", () => {
    setup({ entries: [gEvent({ title: "Standup", startTime: "09:00", endTime: "09:15", link: null, color: null })] });
    const block = grid().getByTitle(/Standup.*Sam's Work \(Google Calendar\)/);
    expect(block).toHaveClass("tg-block-google");
    expect(block).toHaveTextContent("Sam");
    expect(block).not.toHaveAttribute("href");
    expect(weekList().getByTitle("Sam's Work (Google Calendar)").querySelector(".cal-time")).not.toBeNull();
    cleanup();
    month({ entries: [gEvent({ title: "Trip" })] });
    expect(screen.getByRole("link", { name: /Trip/ })).toHaveClass("cal-chip");
  });

  it("opens a Google event in Google, not a new event, when its grid block is clicked", async () => {
    setup({ entries: [gEvent({ title: "Standup", startTime: "09:00" })] });
    await userEvent.click(grid().getByTitle(/Standup/));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("warns about calendars Google couldn't give just now", () => {
    setup({ googleProblems: ["Sam's Work", "Ann's Family"] });
    expect(screen.getByText(/Couldn't read from Google just now: Sam's Work, Ann's Family/)).toBeInTheDocument();
  });

  it("offers no Google option on the form, and no status, when the household has no Google calendar", async () => {
    setup({ entries: [item({ title: "Dentist", google: { wanted: true, sent: true, error: null } })] });
    await userEvent.click(screen.getByRole("button", { name: "New event" }));
    expect((await dialogTitled("New event")).queryByText(/Create Google Calendar event/)).toBeNull();
    cleanup();
    setup({ entries: [item({ title: "Dentist", google: { wanted: true, sent: true, error: "Nope (403)" } })] });
    await userEvent.click(grid().getByRole("button", { name: /Dentist/ }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.queryByText(/Google/)).toBeNull();
  });

  it("creates the Google event by default, and can be told not to", async () => {
    setup({ googleCalendarName: "Family" });
    await userEvent.click(screen.getByRole("button", { name: "New event" }));
    const form = await dialogTitled("New event");
    const box = form.getByRole("checkbox", { name: /Create Google Calendar event \(in Family/ });
    expect(box).toBeChecked();
    await userEvent.type(form.getByLabelText("Title"), "Dentist");
    await userEvent.click(box);
    await userEvent.click(form.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(createCalendarItemAction).toHaveBeenCalledWith(expect.objectContaining({ title: "Dentist", toGoogle: false })));
  });

  it("keeps an event's own choice when editing it", async () => {
    setup({ googleCalendarName: "Family", entries: [item({ id: "i9", title: "Dentist", google: { wanted: false, sent: false, error: null } })] });
    await userEvent.click(grid().getByRole("button", { name: /Dentist/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit" }));
    const form = await dialogTitled("Edit event");
    expect(form.getByRole("checkbox", { name: /Create Google Calendar event/ })).not.toBeChecked();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateCalendarItemAction).toHaveBeenCalledWith("i9", expect.objectContaining({ toGoogle: false })));
  });

  it("says an event is in Google, or why Google couldn't be updated", async () => {
    setup({ googleCalendarName: "Family", entries: [item({ title: "Dentist", google: { wanted: true, sent: true, error: null } })] });
    await userEvent.click(grid().getByRole("button", { name: /Dentist/ }));
    expect(within(await screen.findByRole("dialog")).getByText(/In Google Calendar \(Family\)/)).toBeInTheDocument();
    cleanup();
    setup({ googleCalendarName: "Family", entries: [item({ title: "Dentist", google: { wanted: true, sent: true, error: "Google Calendar: Forbidden (403)" } })] });
    await userEvent.click(grid().getByRole("button", { name: /Dentist/ }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Couldn't update Google Calendar: Google Calendar: Forbidden (403)")).toBeInTheDocument();
    expect(dialog.queryByText(/In Google Calendar/)).toBeNull();
  });

  it("says nothing about Google for an event not sent there", async () => {
    setup({ googleCalendarName: "Family", entries: [item({ title: "Dentist", google: { wanted: false, sent: false, error: null } })] });
    await userEvent.click(grid().getByRole("button", { name: /Dentist/ }));
    expect(within(await screen.findByRole("dialog")).queryByText(/Google/)).toBeNull();
  });
});
