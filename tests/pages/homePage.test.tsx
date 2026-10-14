// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ pageMember: vi.fn() }));
vi.mock("@/lib/calendarEntries", () => ({ calendarEntries: vi.fn() }));
vi.mock("@/lib/calendarItem", () => ({ getCalendarSettings: vi.fn() }));
vi.mock("@/lib/mealPlan", () => ({ getMealPlanSettings: vi.fn() }));
vi.mock("@/lib/homeAttention", () => ({ loadAttention: vi.fn() }));
vi.mock("@/lib/maintenanceTodos", () => ({ syncMaintenanceTodos: vi.fn() }));
vi.mock("@/lib/todo", async (orig) => ({ ...(await orig<typeof import("@/lib/todo")>()), homeTodos: vi.fn() }));
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/home/HomeTodos", () => ({ default: (p: any) => ((seen.todos = p), <section aria-label="To-do">to-dos</section>) }));
vi.mock("@/components/LocalToday", () => ({ default: () => <i data-testid="local-today" /> }));

const clock = vi.hoisted(() => ({ today: null as string | null }));
vi.mock("@/lib/today", async () => {
  const { utcDateString } = await import("@/lib/dates");
  return { pageToday: async () => clock.today, pageTodayOrUtc: async () => clock.today ?? utcDateString() };
});
import { pageMember } from "@/lib/auth";
import { calendarEntries } from "@/lib/calendarEntries";
import { getCalendarSettings } from "@/lib/calendarItem";
import { getMealPlanSettings } from "@/lib/mealPlan";
import { loadAttention } from "@/lib/homeAttention";
import { syncMaintenanceTodos } from "@/lib/maintenanceTodos";
import { homeTodos, type TodoItem } from "@/lib/todo";
import HomePage from "@/app/(app)/home/page";
import type { AgendaContactDateEntry, AgendaEntry, AgendaGoogleEntry, AgendaItemEntry, AgendaMealEntry } from "@/lib/agendaOrder";

const me = (role = "OWNER") => ({ id: "u1", firstName: "Sam", role, householdId: "h1", contactId: "c-me", household: { displayName: "The Smiths" } });
const run = async (today: string | null = "2026-10-07") => {
  clock.today = today;
  return render(await HomePage());
};

let n = 0;
const item = (date: string, over: Partial<AgendaItemEntry> = {}): AgendaItemEntry => ({
  source: "item", id: `i${++n}`, itemId: "item", date, title: "Item", notes: null, startTime: null, endTime: null, assigneeContactId: null,
  assigneeName: null, createdAt: "2026-10-01T00:00:00Z", repeat: null, google: { wanted: true, sent: false, error: null }, editable: true, ...over,
});
const birthday = (date: string, over: Partial<AgendaContactDateEntry> = {}): AgendaContactDateEntry => ({
  source: "contact_date", id: `c${++n}`, date, title: "Jo's birthday", type: "birthday", contactId: "c9", turns: null, editable: false, ...over,
});
const meal = (date: string, dish = "Tacos"): AgendaMealEntry => ({ source: "meal", id: `m${++n}`, date, slot: "DINNER", title: `Dinner: ${dish}`, startTime: null, createdAt: "", editable: false });

const googleEvent = (date: string, title: string, startTime: string | null = null): AgendaGoogleEntry => ({
  source: "google", id: `g${++n}`, googleId: `g${n}`, date, title, startTime, endTime: null, link: null, calendarName: "Work",
  color: null, ownerName: "Sam", ownerContactId: "c-me", editable: false,
});

/** The week's entries, as the calendar shows them. */
function agendas(week: AgendaEntry[]) {
  vi.mocked(calendarEntries).mockResolvedValue({ entries: week, googleProblems: [] });
}
const calendarSettings = (over: object = {}) =>
  vi.mocked(getCalendarSettings).mockResolvedValue({ householdId: "h1", showMeals: false, timeZone: "America/Chicago", googleCalendarId: null, googleCalendarName: null, googleCalendarUserId: null, updatedAt: new Date(), ...over });
const todo = (over: Partial<TodoItem> = {}): TodoItem => ({
  id: `t${++n}`, text: "To-do", notes: null, assigneeContactId: null, assigneeName: null, dueDate: "2026-10-07", done: false, rating: 1500, comparisonCount: 0, maintenance: null, ...over,
});
const section = (title: string) => screen.getByText(title).closest("section") as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(pageMember).mockResolvedValue(me() as any);
  vi.mocked(getMealPlanSettings).mockResolvedValue({ weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: true, showDinner: true, breakfastTime: null, lunchTime: null, dinnerTime: null });
  vi.mocked(loadAttention).mockResolvedValue([]);
  agendas([]);
  calendarSettings();
  vi.mocked(homeTodos).mockResolvedValue([]);
  vi.mocked(syncMaintenanceTodos).mockResolvedValue();
});

describe("HomePage: the week", () => {
  it("waits for the browser's date before showing a week", async () => {
    await run(null);
    expect(screen.getByTestId("local-today")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(calendarEntries).not.toHaveBeenCalled();
  });

  it("shows the week of the browser's today as an empty, flat week with calm empty states", async () => {
    await run();
    expect(screen.getByText("Week of Oct 4 – 10, 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nothing is planned this week yet, Sam.");
    expect(screen.getByText("Nothing needs attention")).toBeInTheDocument();
    expect(document.querySelectorAll("a.brief-row[data-open]")).toHaveLength(7);
    expect(document.querySelectorAll(".brief-day[data-open]")).toHaveLength(7);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringContaining("Sunday: open"));
  });

  it("starts the week on Monday for a household that chose that", async () => {
    vi.mocked(getMealPlanSettings).mockResolvedValue({ weekStartsOn: "MONDAY", showBreakfast: false, showLunch: true, showDinner: true, breakfastTime: null, lunchTime: null, dinnerTime: null });
    await run("2026-10-04");
    expect(screen.getByText("Week of Sep 28 – Oct 4, 2026")).toBeInTheDocument();
    expect(vi.mocked(calendarEntries).mock.calls[0][1]).toEqual({ start: "2026-09-28", end: "2026-10-04" });
  });

  it("asks for what the calendar shows for the week (meals only when the calendar shows them), in the household's zone", async () => {
    await run();
    expect(calendarEntries).toHaveBeenCalledWith("h1", { start: "2026-10-04", end: "2026-10-10" }, { timeZone: "America/Chicago", includeMeals: false });
    calendarSettings({ showMeals: true, timeZone: "Europe/Paris" });
    await run();
    expect(calendarEntries).toHaveBeenLastCalledWith("h1", { start: "2026-10-04", end: "2026-10-10" }, { timeZone: "Europe/Paris", includeMeals: true });
  });

  it("counts and shows Google events like Domata's own", async () => {
    agendas([googleEvent("2026-10-07", "Flight to Denver", "14:00"), googleEvent("2026-10-09", "School play")]);
    await run();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("A light week");
    expect(section("Day by day")).toHaveTextContent("2:00 PM Flight to Denver.");
    expect(document.querySelectorAll(".brief-drawing circle")).toHaveLength(2);
  });

  it("builds the headline, drawing and day rows from every kind of entry", async () => {
    agendas([birthday("2026-10-08"), item("2026-10-08", { title: "Dentist", startTime: "09:30" }), item("2026-10-08", { title: "Soccer" }), meal("2026-10-05")]);
    await run();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("most planned on Thursday");
    const days = [...document.querySelectorAll(".brief-strip .brief-day")];
    expect(days).toHaveLength(7);
    expect(days[4].querySelector(".brief-day-title")).toHaveTextContent("Jo's birthday");
    expect(days[4].querySelector(".brief-day-more")).toHaveTextContent("+2 more");
    expect(days[1].querySelector(".brief-day-title")).toHaveTextContent("Tacos");
    expect(section("Day by day")).toHaveTextContent("9:30 AM Dentist.");
    expect(document.querySelectorAll(".brief-drawing circle")).toHaveLength(2);
  });

  it("breaks every day out, marking today and linking each day to that day on the calendar", async () => {
    await run();
    const days = [...document.querySelectorAll(".brief-strip .brief-day")];
    expect(days.map((d) => d.querySelector(".brief-day-initial")!.textContent)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(days[3]).toHaveAttribute("data-today");
    const row = section("Day by day").querySelector("a[data-today]") as HTMLElement;
    expect(row).toHaveTextContent("(today)");
    expect(row).toHaveAttribute("href", "/calendar?view=day&date=2026-10-07");
  });

  describe("days already gone", () => {
    const earlier = () => section("Day by day").querySelector("details.brief-earlier") as HTMLDetailsElement | null;

    it("fold into one closed row at the top, saying what was on them, and open to show them", async () => {
      agendas([item("2026-10-04", { title: "Brunch" }), meal("2026-10-05"), item("2026-10-08", { title: "Later" })]);
      await run();
      const folded = earlier()!;
      expect(folded.open).toBe(false);
      expect(folded.querySelector("summary")).toHaveTextContent("Earlier");
      expect(folded.querySelector("summary")).toHaveTextContent("Sun – Tue");
      expect(folded.querySelector("summary")).toHaveTextContent("2 things.");
      expect([...folded.querySelectorAll("a.brief-row .brief-index")].map((d) => d.textContent)).toEqual(["Sun", "Mon", "Tue"]);
      // Today and the rest of the week stay open, after it.
      const open = [...section("Day by day").querySelectorAll(":scope > a.brief-row .brief-index")].map((d) => d.textContent);
      expect(open).toEqual(["Wed (today)", "Thu", "Fri", "Sat"]);
    });

    it("name one day by itself, and say when nothing was planned", async () => {
      const { unmount } = await run("2026-10-05");
      expect(earlier()!.querySelector("summary")).toHaveTextContent("Sun");
      expect(earlier()!.querySelector("summary")).not.toHaveTextContent("–");
      expect(earlier()!.querySelector("summary")).toHaveTextContent("Nothing was planned.");
      unmount();
      agendas([item("2026-10-04")]);
      await run("2026-10-05");
      expect(earlier()!.querySelector("summary")).toHaveTextContent("1 thing.");
    });

    it("aren't there on the week's first day", async () => {
      await run("2026-10-04");
      expect(earlier()).toBeNull();
    });
  });

});

describe("HomePage: needs attention", () => {
  it("lists what needs attention, numbered, each linking where the work is", async () => {
    vi.mocked(loadAttention).mockResolvedValue([
      { key: "a", title: "Weekend plans has 2 unread messages", support: "In Messages.", href: "/messages/c1" },
      { key: "b", title: "Ann Ray asked to join your household", support: "On the Household page.", href: "/household" },
    ]);
    await run();
    const links = within(section("Needs attention")).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/messages/c1", "/household"]);
    expect(links[0]).toHaveTextContent("1");
    expect(links[1]).toHaveTextContent("2");
    expect(loadAttention).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", role: "OWNER", householdId: "h1" }));
  });
});

describe("HomePage: the lists", () => {
  it("asks the agenda once, for the week only (there is no separate today-and-ahead list)", async () => {
    await run();
    expect(calendarEntries).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Today & coming up/)).toBeNull();
  });

  it("puts Needs attention, then To-do, then Day by day (the order on a phone; the grid moves Day by day right on a wide screen)", async () => {
    await run();
    const order = [...document.querySelectorAll(".brief-lists > section")].map((el) => el.getAttribute("aria-label") ?? el.querySelector("h2")?.textContent);
    expect(order).toEqual(["Needs attention", "To-do", "Day by day"]);
    expect(section("Needs attention")).toHaveClass("home-attention");
    expect(section("Day by day")).toHaveClass("home-days");
  });

  it("offers the calendar from Day by day", async () => {
    await run();
    expect(within(section("Day by day")).getByRole("link", { name: "View calendar" })).toHaveAttribute("href", "/calendar?view=week");
  });

  it("passes the signed-in member's to-dos (theirs and Anyone's, by the browser's date) to the To-do column", async () => {
    const items = [todo({ text: "Renew passport" })];
    vi.mocked(homeTodos).mockResolvedValue(items);
    await run();
    expect(syncMaintenanceTodos).toHaveBeenCalledWith("h1", "2026-10-07"); // services that came due join first
    expect(vi.mocked(syncMaintenanceTodos).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(homeTodos).mock.invocationCallOrder[0]);
    expect(homeTodos).toHaveBeenCalledWith("h1", "c-me", "2026-10-07");
    expect(seen.todos).toEqual({ items, today: "2026-10-07" });
    expect(screen.getByRole("region", { name: "To-do" })).toBeInTheDocument();
    vi.mocked(pageMember).mockResolvedValue({ ...me(), contactId: undefined } as any);
    await run();
    expect(homeTodos).toHaveBeenLastCalledWith("h1", null, "2026-10-07");
  });

});
