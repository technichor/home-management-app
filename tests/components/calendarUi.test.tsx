// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
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
import type { AgendaContactDateEntry, AgendaItemEntry, AgendaMealEntry } from "@/lib/agendaOrder";
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
  assigneeContactId: null, assigneeName: null, createdAt: `2026-10-01T00:00:${String(n).padStart(2, "0")}Z`, repeat: null, editable: true, ...over,
});
const birthday = (over: Partial<AgendaContactDateEntry> = {}): AgendaContactDateEntry => ({
  source: "contact_date", id: `c${++n}`, date: TODAY, title: "Jo's birthday", type: "birthday", contactId: "c9", turns: null, editable: false, ...over,
});
const meal = (over: Partial<AgendaMealEntry> = {}): AgendaMealEntry => ({
  source: "meal", id: `m${++n}`, date: TODAY, slot: "DINNER", title: "Dinner: Tacos", createdAt: "2026-10-01T00:00:00Z", editable: false, ...over,
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
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/calendar?view=week&date=2026-09-27&today=2026-10-07");
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/calendar?view=week&date=2026-10-11&today=2026-10-07");
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/calendar?view=week&date=2026-10-07&today=2026-10-07");
    const views = within(screen.getByRole("navigation", { name: "View" }));
    expect(views.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");
    expect(views.getByRole("link", { name: "Day" })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-04&today=2026-10-07");
    expect(views.getByRole("link", { name: "Month" })).toHaveAttribute("href", "/calendar?view=month&date=2026-10-04&today=2026-10-07");
  });

  it("keeps the chosen member in every link", () => {
    setup({ assigneeFilter: "m1" });
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", expect.stringContaining("&who=m1&"));
    expect(screen.getByRole("link", { name: "Day" })).toHaveAttribute("href", expect.stringContaining("&who=m1&"));
  });

  it("titles the day and month views", () => {
    const { unmount } = day();
    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent("Wednesday, Oct 7, 2026");
    unmount();
    month();
    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent("October 2026");
  });

  it("filters by member, keeping the view and date", async () => {
    setup();
    await userEvent.click(screen.getByRole("combobox", { name: "Show items for" }));
    await userEvent.click(await screen.findByTitle("Sam"));
    expect(router.push).toHaveBeenCalledWith("/calendar?view=week&date=2026-10-04&who=m1&today=2026-10-07");
  });

  it("goes back to everyone", async () => {
    setup({ assigneeFilter: "m1" });
    await userEvent.click(screen.getByRole("combobox", { name: "Show items for" }));
    await userEvent.click(await screen.findByTitle("Everyone"));
    expect(router.push).toHaveBeenCalledWith("/calendar?view=week&date=2026-10-04&today=2026-10-07");
  });

  it("changes the week's first day (shared with the planner) and refreshes", async () => {
    setup();
    await userEvent.click(screen.getByRole("combobox", { name: "Week starts on" }));
    await userEvent.click(await screen.findByTitle("Starts Monday"));
    expect(setWeekStartAction).toHaveBeenCalledWith("MONDAY");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("shows the reason when a setting can't be saved", async () => {
    vi.mocked(setWeekStartAction).mockResolvedValue({ ok: false, error: "Invalid setting" });
    setup();
    await userEvent.click(screen.getByRole("combobox", { name: "Week starts on" }));
    await userEvent.click(await screen.findByTitle("Starts Monday"));
    expect(await screen.findByText("Invalid setting")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("turns planned meals on and off", async () => {
    const { unmount } = setup();
    const toggle = screen.getByRole("switch", { name: "Show meals" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(setShowMealsAction).toHaveBeenCalledWith(true);
    unmount();
    setup({ showMeals: true });
    await userEvent.click(screen.getByRole("switch", { name: "Show meals" }));
    expect(setShowMealsAction).toHaveBeenLastCalledWith(false);
  });

  it("disables the meals toggle on the month view, which never shows them", () => {
    month({ showMeals: true });
    const toggle = screen.getByRole("switch", { name: "Show meals" });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Show meals (week and day)")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Add to Wed Oct 7" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mon Oct 5/ })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-05&today=2026-10-07");
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
    expect(inDay.getByRole("link", { name: "Dinner: Tacos" })).toHaveAttribute("href", "/meals?week=2026-10-07&today=2026-10-07");
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
  it("lists a day in sections, leaving out the empty ones", () => {
    day({ entries: [birthday(), item({ title: "Picture day" }), item({ title: "Dentist", startTime: "09:00" }), meal()] });
    expect([...document.querySelectorAll(".cal-section-title")].map((h) => h.textContent)).toEqual(["Birthdays and dates", "Events and reminders", "Meals"]);
  });

  it("only shows sections that have something", () => {
    day({ entries: [meal()] });
    expect([...document.querySelectorAll(".cal-section-title")].map((h) => h.textContent)).toEqual(["Meals"]);
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
    expect(screen.getByRole("link", { name: "Open Oct 7, 2026" })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-07&today=2026-10-07");
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
    expect(within(cell).getByRole("link", { name: "+2 more" })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-07&today=2026-10-07");
  });

  it("shows exactly three with no '+N more'", () => {
    month({ entries: [item({ title: "A" }), item({ title: "B" }), item({ title: "C" })] });
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it("shows a count for the compact (phone) grid, opening the day", () => {
    month({ entries: [item({ title: "A" }), item({ title: "B" })] });
    const dots = screen.getByRole("link", { name: "2 on Oct 7, 2026" });
    expect(dots).toHaveTextContent("2");
    expect(dots).toHaveAttribute("href", "/calendar?view=day&date=2026-10-07&today=2026-10-07");
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



describe("quick add", () => {
  const title = () => screen.getByLabelText("Title");

  it("defaults to today's date when today is in view, and to the day on the day view", () => {
    const { unmount } = setup();
    expect(screen.getByLabelText("Date")).toHaveValue(TODAY);
    unmount();
    day({ anchor: "2026-10-09", dates: ["2026-10-09"] });
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-09");
  });

  it("adds an event on Enter, clears the box and keeps the cursor there, then refreshes", async () => {
    setup();
    await userEvent.type(title(), "  Picture day {Enter}");
    expect(createCalendarItemAction).toHaveBeenCalledWith({ title: "Picture day", date: TODAY, startTime: "" });
    await waitFor(() => expect(title()).toHaveValue(""));
    expect(title()).toHaveFocus();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("adds several in a row", async () => {
    setup();
    await userEvent.type(title(), "One{Enter}");
    await waitFor(() => expect(title()).toHaveValue(""));
    await userEvent.type(title(), "Two{Enter}");
    await waitFor(() => expect(createCalendarItemAction).toHaveBeenCalledTimes(2));
  });

  it("adds a timed event with the chosen date and start time", async () => {
    setup();
    fireChange(screen.getByLabelText("Date"), "2026-10-09");
    fireChange(screen.getByLabelText("Start time"), "14:30");
    await userEvent.type(title(), "Dentist{Enter}");
    expect(createCalendarItemAction).toHaveBeenCalledWith({ title: "Dentist", date: "2026-10-09", startTime: "14:30" });
    await waitFor(() => expect(screen.getByLabelText("Start time")).toHaveValue(""));
  });


  it("adds with the Add button, which is off while the box is empty", async () => {
    setup();
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    await userEvent.type(title(), "Thing");
    await userEvent.click(add);
    expect(createCalendarItemAction).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter on a blank box", async () => {
    setup();
    await userEvent.type(title(), "   {Enter}");
    expect(createCalendarItemAction).not.toHaveBeenCalled();
  });

  it("keeps what was typed and shows the reason when adding fails", async () => {
    vi.mocked(createCalendarItemAction).mockResolvedValue({ ok: false, error: "Choose a valid date" });
    setup();
    await userEvent.type(title(), "Thing{Enter}");
    expect(await screen.findByText("Choose a valid date")).toBeInTheDocument();
    expect(title()).toHaveValue("Thing");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("a day's '+' fills in that date and moves the cursor to the box", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Add to Sat Oct 10" }));
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-10");
    await waitFor(() => expect(title()).toHaveFocus());
  });
});

// jsdom's date/time inputs are plain inputs: set them the way a browser would.
import { fireEvent } from "@testing-library/react";
const fireChange = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const dialogTitled = async (title: string) => within((await screen.findByText(title, { selector: ".ant-modal-title" })).closest('[role="dialog"]') as HTMLElement);

describe("an item's details", () => {
  const open = async (title: string) => {
    await userEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
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
      repeatUnit: null, repeatEvery: 1, repeatUntil: "",
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
    await userEvent.click(screen.getByRole("button", { name: /Dentist/ }));
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
    await userEvent.click(screen.getByRole("button", { name: /Trash/ }));
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
    await userEvent.click(screen.getByRole("button", { name: /Dentist/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit" }));
    const form = (await dialogTitled("Edit event"));
    expect(form.getByText("Pat (removed)")).toBeInTheDocument();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateCalendarItemAction).toHaveBeenCalledWith("i9", expect.objectContaining({ assigneeContactId: "gone" })));
  });

  it("calls a removed assignee with no name a former member, and offers current members otherwise", async () => {
    setup({ entries: [item({ title: "Dentist", assigneeContactId: "gone", assigneeName: null })] });
    await userEvent.click(screen.getByRole("button", { name: /Dentist/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit" }));
    const form = (await dialogTitled("Edit event"));
    expect(form.getByText("Former member (removed)")).toBeInTheDocument();
    await userEvent.click(form.getByRole("combobox", { name: "Assigned to" }));
    expect(await screen.findByTitle("Sam")).toBeInTheDocument();
    expect(screen.getByTitle("Ann")).toBeInTheDocument();
  });

});
