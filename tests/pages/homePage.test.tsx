// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ pageMember: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { mealPlanEntry: { findFirst: vi.fn() } } }));
vi.mock("@/lib/calendarEntries", () => ({ calendarEntries: vi.fn() }));
vi.mock("@/lib/calendarItem", () => ({ getCalendarSettings: vi.fn() }));
vi.mock("@/lib/homeAttention", () => ({ loadAttention: vi.fn() }));
vi.mock("@/lib/maintenanceTodos", () => ({ syncMaintenanceTodos: vi.fn() }));
vi.mock("@/lib/shopping", () => ({ loadShopping: vi.fn() }));
vi.mock("@/lib/householdMembers", () => ({ memberOptionsOf: vi.fn() }));
vi.mock("@/lib/google", () => ({ googleConfigured: vi.fn(() => false) }));
vi.mock("@/lib/todo", async (orig) => ({ ...(await orig<typeof import("@/lib/todo")>()), homeTodos: vi.fn() }));
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/home/HomeTodos", () => ({ default: (p: any) => ((seen.todos = p), <section aria-label="To-do">to-dos</section>) }));
vi.mock("@/app/(app)/home/HomeHeaderActions", () => ({ default: (p: any) => ((seen.actions = p), <div>header actions</div>) }));
vi.mock("@/app/(app)/home/HomeNewEvent", () => ({ default: (p: any) => ((seen.newEvent = p), <button type="button">New event</button>) }));
vi.mock("@/components/LocalToday", () => ({ default: ({ today }: any) => <i data-testid="local-today" data-today={today ?? "none"} /> }));

const clock = vi.hoisted(() => ({ now: null as { date: string; minutes: number } | null }));
vi.mock("@/lib/today", () => ({ pageClock: async () => clock.now }));

import { prisma } from "@/lib/db";
import { pageMember } from "@/lib/auth";
import { calendarEntries } from "@/lib/calendarEntries";
import { getCalendarSettings } from "@/lib/calendarItem";
import { loadAttention } from "@/lib/homeAttention";
import { syncMaintenanceTodos } from "@/lib/maintenanceTodos";
import { loadShopping } from "@/lib/shopping";
import { memberOptionsOf } from "@/lib/householdMembers";
import { googleConfigured } from "@/lib/google";
import { homeTodos, type TodoItem } from "@/lib/todo";
import HomePage from "@/app/(app)/home/page";
import type { AgendaContactDateEntry, AgendaEntry, AgendaGoogleEntry, AgendaItemEntry, AgendaMealEntry } from "@/lib/agendaOrder";

// Thursday 15 October 2026; "now" is 9:35 AM unless a test says otherwise.
const TODAY = "2026-10-15";
const me = { id: "u1", firstName: "Casey", role: "OWNER", householdId: "h1", contactId: "c-me", household: { displayName: "The Beckers" } };
const run = async (minutes: number | null = 9 * 60 + 35, date = TODAY) => {
  clock.now = minutes === null ? null : { date, minutes };
  return render(await HomePage());
};

let n = 0;
const item = (date: string, title: string, over: Partial<AgendaItemEntry> = {}): AgendaItemEntry => ({
  source: "item", id: `i${++n}`, itemId: `i${n}`, date, title, notes: null, startTime: null, endTime: null, assigneeContactId: null,
  assigneeName: null, createdAt: "2026-10-01T00:00:00Z", repeat: null, google: { wanted: true, sent: false, error: null }, editable: true, ...over,
});
const google = (date: string, title: string, over: Partial<AgendaGoogleEntry> = {}): AgendaGoogleEntry => ({
  source: "google", id: `g${++n}`, googleId: `g${n}`, date, title, startTime: null, endTime: null, link: "https://calendar.google.com/e",
  calendarName: "Work", color: "#3b6fd8", ownerName: "Casey", ownerContactId: "c-me", editable: false, ...over,
});
const birthday = (date: string, over: Partial<AgendaContactDateEntry> = {}): AgendaContactDateEntry => ({
  source: "contact_date", id: `c${++n}`, date, title: "Jo's birthday", type: "birthday", contactId: "c9", turns: 9, editable: false, ...over,
});
const meal = (date: string, dish: string, startTime: string | null = null): AgendaMealEntry => ({
  source: "meal", id: `m${++n}`, date, slot: "DINNER", title: `Dinner: ${dish}`, startTime, createdAt: "", editable: false,
});
const todo = (over: Partial<TodoItem> = {}): TodoItem => ({
  id: `t${++n}`, text: "To-do", notes: null, assigneeContactId: null, assigneeName: null, dueDate: null, done: false, rating: 1500, comparisonCount: 0, maintenance: null, ...over,
});
const entries = (list: AgendaEntry[]) => vi.mocked(calendarEntries).mockResolvedValue({ entries: list, googleProblems: [] });
const settings = (over: object = {}) =>
  vi.mocked(getCalendarSettings).mockResolvedValue({ householdId: "h1", showMeals: false, timeZone: "America/Chicago", googleCalendarId: null, googleCalendarName: null, googleCalendarUserId: null, updatedAt: new Date(), ...over });
const section = (name: string) => screen.getByRole("heading", { name }).closest("section") as HTMLElement;
const timelineRows = () => [...section("Today").querySelectorAll(".home-timeline > li")];

beforeEach(() => {
  vi.resetAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(pageMember).mockResolvedValue(me as any);
  settings();
  entries([]);
  vi.mocked(loadAttention).mockResolvedValue([]);
  vi.mocked(homeTodos).mockResolvedValue([]);
  vi.mocked(syncMaintenanceTodos).mockResolvedValue();
  vi.mocked(loadShopping).mockResolvedValue({ listId: "s1", items: [] });
  vi.mocked(memberOptionsOf).mockResolvedValue([{ id: "c-me", name: "Casey", fullName: "Casey Becker" }]);
  vi.mocked(prisma.mealPlanEntry.findFirst).mockResolvedValue(null);
});

describe("HomePage", () => {
  it("waits for the browser's time zone before showing anything, and reads nothing meanwhile", async () => {
    await run(null);
    expect(screen.getByTestId("local-today")).toHaveAttribute("data-today", "none");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(calendarEntries).not.toHaveBeenCalled();
  });

  it("greets by the time of day, under the date", async () => {
    const { unmount } = await run(9 * 60);
    expect(screen.getByText("Thursday, October 15")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Good morning, Casey.");
    expect(screen.getByTestId("local-today")).toHaveAttribute("data-today", TODAY);
    unmount();
    const second = await run(13 * 60);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Good afternoon, Casey.");
    second.unmount();
    await run(19 * 60);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Good evening, Casey.");
  });

  it("reads what the calendar shows for today and the next two days, in the household's zone (meals as the calendar has them)", async () => {
    settings({ showMeals: true, timeZone: "Europe/Paris" });
    await run();
    expect(calendarEntries).toHaveBeenCalledWith("h1", { start: TODAY, end: "2026-10-17" }, { timeZone: "Europe/Paris", includeMeals: true });
  });

  it("hands the bell what needs attention, and Today's New event the date and members (no Google calendar until one is chosen)", async () => {
    const attention = [{ key: "a", title: "Weekend plans has 2 unread messages", support: "In Messages.", href: "/messages/c1" }];
    vi.mocked(loadAttention).mockResolvedValue(attention);
    await run();
    expect(seen.actions).toEqual({ attention });
    expect(seen.newEvent).toEqual({ today: TODAY, assignees: [{ id: "c-me", name: "Casey", fullName: "Casey Becker" }], googleCalendarName: null });
    expect(within(section("Today")).getByRole("button", { name: "New event" })).toBeInTheDocument();
  });

  it("names the household's Google calendar for the New event form once Google is set up and one is chosen", async () => {
    vi.mocked(googleConfigured).mockReturnValue(true);
    settings({ googleCalendarId: "fam", googleCalendarName: "Family" });
    const { unmount } = await run();
    expect(seen.newEvent.googleCalendarName).toBe("Family");
    unmount();
    settings({ googleCalendarId: "fam" });
    await run();
    expect(seen.newEvent.googleCalendarName).toBe("Google Calendar");
  });

  describe("today", () => {
    it("says when there is nothing on the calendar", async () => {
      await run();
      expect(within(section("Today")).getByText("Nothing on the calendar today.")).toBeInTheDocument();
      expect(within(section("Today")).getByRole("link", { name: "Open calendar" })).toHaveAttribute("href", `/calendar?view=day&date=${TODAY}`);
    });

    it("puts what has no time along the top, each linking where it lives", async () => {
      entries([birthday(TODAY), google(TODAY, "Sam out of office", { color: null }), birthday(TODAY, { title: "Anniversary", turns: null }), item(TODAY, "Picture day")]);
      await run();
      const chips = within(section("Today")).getByRole("list", { name: "All day" });
      expect(within(chips).getAllByRole("link").map((l) => l.textContent)).toEqual(["Jo's birthday · turns 9", "Sam out of office · Google", "Anniversary", "Picture day"]);
      expect(within(chips).getByRole("link", { name: /Sam out of office/ })).toHaveAttribute("href", "https://calendar.google.com/e");
      expect(within(chips).getByRole("link", { name: "Picture day" })).toHaveAttribute("href", `/calendar?view=day&date=${TODAY}`);
      expect(within(section("Today")).getByText("Nothing else at a set time today.")).toBeInTheDocument();
    });

    it("lists timed things in order: done ones quieter, the one on now marked, and the free time ahead", async () => {
      entries([
        item(TODAY, "School drop-off", { startTime: "07:30", endTime: "08:00", assigneeName: "Casey" }),
        google(TODAY, "Team standup", { startTime: "09:00", endTime: "10:00" }),
        item(TODAY, "Dentist", { startTime: "10:30", endTime: "11:30", assigneeName: "Sam" }),
        item(TODAY, "School pickup", { startTime: "15:00" }),
        meal(TODAY, "Tacos", "18:00"),
      ]);
      await run();
      const rows = timelineRows();
      expect(rows.map((r) => r.querySelector("strong")!.textContent)).toEqual(["School drop-off", "Team standup", "Dentist", "Free · 3.5 hours", "School pickup", "Free · 2.5 hours", "Dinner: Tacos"]);
      expect(rows[0]).toHaveAttribute("data-state", "past");
      expect(rows[1]).toHaveAttribute("data-state", "now");
      expect(rows[1]).toHaveTextContent("Now");
      expect(rows[1]).toHaveTextContent("Until 10:00 AM · Casey's Work · Google");
      expect(rows[1].querySelector("a")).toHaveAttribute("href", "https://calendar.google.com/e");
      expect(rows[2]).toHaveAttribute("data-state", "later");
      expect(rows[2]).toHaveTextContent("10:30 AM");
      expect(rows[2]).toHaveTextContent("Sam");
      expect(rows[3]).toHaveTextContent("11:30 AMFree · 3.5 hoursUntil 3:00 PM");
      expect(rows[3]).not.toHaveAttribute("data-now"); // later free time isn't marked as now
      expect(rows[4].querySelector(".home-detail")).toBeNull();
      expect(rows[6]).toHaveTextContent("From the meal plan");
    });
  });

  it("calls free time that starts now \"Now\"", async () => {
    entries([item(TODAY, "Lunch", { startTime: "12:00" })]);
    await run(10 * 60 + 2);
    expect(timelineRows()[0]).toHaveTextContent("NowFree · 1 hour 55 minUntil 12:00 PM");
    expect(timelineRows()[0]).toHaveAttribute("data-now");
  });

  describe("the next two days", () => {
    it("shows each with its entries, linking the day to the calendar, and says when nothing is planned", async () => {
      entries([item("2026-10-16", "Garbage & recycling", { startTime: "07:00" }), google("2026-10-16", "Conference", { startTime: "19:00", link: null }), birthday("2026-10-16")]);
      await run();
      const cards = [...section("Next 2 days").querySelectorAll(".home-card")] as HTMLElement[];
      expect(cards).toHaveLength(2);
      expect(within(cards[0]).getByRole("link", { name: "Friday Oct 16" })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-16");
      expect(cards[0]).toHaveTextContent("7:00 AMGarbage & recycling");
      expect(cards[0]).toHaveTextContent("7:00 PMConference · Google");
      expect(cards[0]).toHaveTextContent("All dayJo's birthday · turns 9");
      // A Google event without a link opens its day on the calendar.
      expect(within(cards[0]).getByRole("link", { name: "Conference · Google" })).toHaveAttribute("href", "/calendar?view=day&date=2026-10-16");
      expect(cards[1]).toHaveTextContent("Saturday Oct 17");
      expect(cards[1]).toHaveTextContent("Nothing planned.");
    });
  });

  describe("the side column", () => {
    it("passes the member's to-dos (theirs and Anyone's) by the browser's date, after due maintenance joins the list", async () => {
      const items = [todo({ text: "Renew passport" })];
      vi.mocked(homeTodos).mockResolvedValue(items);
      await run();
      expect(syncMaintenanceTodos).toHaveBeenCalledWith("h1", TODAY);
      expect(homeTodos).toHaveBeenCalledWith("h1", "c-me", TODAY);
      expect(seen.todos).toEqual({ items, today: TODAY });
    });

    it("asks for no member's to-dos when the user has no contact", async () => {
      vi.mocked(pageMember).mockResolvedValue({ ...me, contactId: null } as any);
      await run();
      expect(homeTodos).toHaveBeenCalledWith("h1", null, TODAY);
    });

    it("says what's left to buy and what's for dinner tonight", async () => {
      vi.mocked(loadShopping).mockResolvedValue({ listId: "s1", items: [{ checked: false }, { checked: true }, { checked: false }] as any });
      vi.mocked(prisma.mealPlanEntry.findFirst).mockResolvedValue({ text: null, meal: { name: "Tacos" } } as any);
      const { unmount } = await run();
      const also = section("Also today");
      expect(within(also).getByRole("link", { name: /Shopping list/ })).toHaveTextContent("2 items");
      expect(within(also).getByRole("link", { name: /Shopping list/ })).toHaveAttribute("href", "/meals/shopping");
      expect(within(also).getByRole("link", { name: /Dinner tonight/ })).toHaveTextContent("Tacos");
      expect(vi.mocked(prisma.mealPlanEntry.findFirst).mock.calls[0][0]!.where).toEqual({ householdId: "h1", date: new Date(`${TODAY}T00:00:00Z`), slot: "DINNER" });
      unmount();
      vi.mocked(loadShopping).mockResolvedValue({ listId: "s1", items: [{ checked: false }] as any });
      vi.mocked(prisma.mealPlanEntry.findFirst).mockResolvedValue({ text: "Leftovers", meal: null } as any);
      await run();
      expect(within(section("Also today")).getByRole("link", { name: /Shopping list/ })).toHaveTextContent("1 item");
      expect(within(section("Also today")).getByRole("link", { name: /Dinner tonight/ })).toHaveTextContent("Leftovers");
    });

    it("says when nothing is left to buy and dinner isn't planned", async () => {
      await run();
      expect(within(section("Also today")).getByRole("link", { name: /Shopping list/ })).toHaveTextContent("Nothing to buy");
      expect(within(section("Also today")).getByRole("link", { name: /Dinner tonight/ })).toHaveTextContent("Not planned");
    });

    it("lists what needs attention last, each linking where the work is", async () => {
      vi.mocked(loadAttention).mockResolvedValue([
        { key: "a", title: "Weekend plans has 2 unread messages", support: "In Messages.", href: "/messages/c1" },
        { key: "b", title: "Ann Ray asked to join your household", support: "On the Household page.", href: "/household" },
      ]);
      await run();
      const attention = section("Needs attention · 2");
      expect(within(attention).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/messages/c1", "/household"]);
    });

    it("says when nothing needs attention", async () => {
      await run();
      expect(within(section("Needs attention")).getByText("Nothing needs attention.")).toBeInTheDocument();
    });
  });
});
