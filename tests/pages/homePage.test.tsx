// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ pageMember: vi.fn() }));
vi.mock("@/lib/agenda", () => ({ getAgenda: vi.fn() }));
vi.mock("@/lib/mealPlan", () => ({ getMealPlanSettings: vi.fn() }));
vi.mock("@/lib/calendarItem", () => ({ getCalendarSettings: vi.fn() }));
vi.mock("@/lib/homeAttention", () => ({ loadAttention: vi.fn() }));
vi.mock("@/components/LocalToday", () => ({ default: () => <i data-testid="local-today" /> }));

import { pageMember } from "@/lib/auth";
import { getAgenda } from "@/lib/agenda";
import { getMealPlanSettings } from "@/lib/mealPlan";
import { getCalendarSettings } from "@/lib/calendarItem";
import { loadAttention } from "@/lib/homeAttention";
import HomePage from "@/app/(app)/home/page";
import type { AgendaContactDateEntry, AgendaEntry, AgendaItemEntry, AgendaMealEntry } from "@/lib/agendaOrder";

const me = (role = "OWNER") => ({ id: "u1", firstName: "Sam", role, householdId: "h1", household: { displayName: "The Smiths" } });
const run = async (sp: object = { today: "2026-10-07" }) => render(await HomePage({ searchParams: Promise.resolve(sp) }));

let n = 0;
const item = (date: string, over: Partial<AgendaItemEntry> = {}): AgendaItemEntry => ({
  source: "item", id: `i${++n}`, itemId: "item", kind: "EVENT", date, title: "Item", notes: null, startTime: null, endTime: null, assigneeContactId: null,
  assigneeName: null, completed: false, overdue: false, createdAt: "2026-10-01T00:00:00Z", repeat: null, editable: true, ...over,
});
const birthday = (date: string, over: Partial<AgendaContactDateEntry> = {}): AgendaContactDateEntry => ({
  source: "contact_date", id: `c${++n}`, date, title: "Jo's birthday", type: "birthday", contactId: "c9", turns: null, editable: false, ...over,
});
const meal = (date: string, dish = "Tacos"): AgendaMealEntry => ({ source: "meal", id: `m${++n}`, date, slot: "DINNER", title: `Dinner: ${dish}`, createdAt: "", editable: false });

/** getAgenda is called twice: for the week, then for the panel (today through a week ahead). */
function agendas(week: AgendaEntry[], panel: AgendaEntry[] = [], overdue: AgendaItemEntry[] = []) {
  vi.mocked(getAgenda).mockImplementation((async (_h: string, start: string) =>
    start === "2026-10-07" ? { entries: panel, overdue } : { entries: week, overdue: [] }) as any);
}
const section = (title: string) => screen.getByText(title).closest("section") as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(pageMember).mockResolvedValue(me() as any);
  vi.mocked(getMealPlanSettings).mockResolvedValue({ weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: true, showDinner: true });
  vi.mocked(getCalendarSettings).mockResolvedValue({ showMeals: false });
  vi.mocked(loadAttention).mockResolvedValue([]);
  agendas([]);
});

describe("HomePage: the week", () => {
  it("waits for the browser's date before showing a week", async () => {
    await run({});
    expect(screen.getByTestId("local-today")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    await run({ today: "yesterday" });
    expect(getAgenda).not.toHaveBeenCalled();
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
    vi.mocked(getMealPlanSettings).mockResolvedValue({ weekStartsOn: "MONDAY", showBreakfast: false, showLunch: true, showDinner: true });
    await run({ today: "2026-10-04" });
    expect(screen.getByText("Week of Sep 28 – Oct 4, 2026")).toBeInTheDocument();
    expect(vi.mocked(getAgenda).mock.calls[0].slice(1, 3)).toEqual(["2026-09-28", "2026-10-04"]);
  });

  it("asks the shared agenda for the week with meals always on, scoped to the household", async () => {
    await run();
    const [householdId, start, end, options] = vi.mocked(getAgenda).mock.calls[0];
    expect([householdId, start, end]).toEqual(["h1", "2026-10-04", "2026-10-10"]);
    expect(options).toEqual({ today: "2026-10-07", includeMeals: true });
  });

  it("builds the headline, drawing and day rows from every kind of entry", async () => {
    agendas([birthday("2026-10-08"), item("2026-10-08", { title: "Dentist", startTime: "09:30" }), item("2026-10-08", { kind: "TASK", title: "Call the vet" }), meal("2026-10-05")]);
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

  it("breaks every day out, marking today and linking each day to the planner's week", async () => {
    await run();
    const days = [...document.querySelectorAll(".brief-strip .brief-day")];
    expect(days.map((d) => d.querySelector(".brief-day-initial")!.textContent)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(days[3]).toHaveAttribute("data-today");
    const row = section("Day by day").querySelector("a[data-today]") as HTMLElement;
    expect(row).toHaveTextContent("(today)");
    expect(row).toHaveAttribute("href", "/meals?week=2026-10-04&today=2026-10-07");
  });

  it("treats a day with only finished tasks as not empty but not weighing on the week", async () => {
    agendas([item("2026-10-06", { kind: "TASK", title: "Pay bill", completed: true })]);
    await run();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nothing is planned this week yet");
    const row = [...section("Day by day").querySelectorAll("a")].find((a) => a.textContent?.startsWith("Tue"))!;
    expect(row).not.toHaveAttribute("data-open");
    expect(row).toHaveTextContent("Done: Pay bill.");
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

describe("HomePage: today & coming up", () => {
  it("asks for today through a week ahead, and includes meals only when the calendar shows them", async () => {
    await run();
    const panelCall = vi.mocked(getAgenda).mock.calls[1];
    expect(panelCall.slice(0, 3)).toEqual(["h1", "2026-10-07", "2026-10-14"]);
    expect(panelCall[3]).toEqual({ today: "2026-10-07", includeMeals: false });
    vi.mocked(getCalendarSettings).mockResolvedValue({ showMeals: true });
    vi.mocked(getAgenda).mockClear();
    await run();
    expect(vi.mocked(getAgenda).mock.calls[1][3]).toMatchObject({ includeMeals: true });
  });

  it("says plainly when there is nothing today or ahead, and always offers the calendar", async () => {
    await run();
    const panel = within(section("Today & coming up"));
    expect(panel.getByText("Nothing today, and nothing in the next 7 days")).toBeInTheDocument();
    expect(panel.getByRole("link", { name: "View calendar" })).toHaveAttribute("href", "/calendar?view=week&today=2026-10-07");
  });

  it("lists today in full: contact dates, events with times, tasks, and meals", async () => {
    agendas([], [
      birthday("2026-10-07", { turns: 41 }),
      item("2026-10-07", { title: "Picture day" }),
      item("2026-10-07", { title: "Dentist", startTime: "09:30", endTime: "10:15", assigneeName: "Sam" }),
      item("2026-10-07", { kind: "TASK", title: "Call the vet" }),
      item("2026-10-07", { kind: "TASK", title: "Pay bill", completed: true }),
      meal("2026-10-07"),
    ]);
    await run();
    const panel = within(section("Today & coming up"));
    expect(panel.getByText("Today", { selector: ".brief-sub" })).toBeInTheDocument();
    expect(panel.getByText("Turns 41.")).toBeInTheDocument();
    expect(panel.getByText("9:30 AM – 10:15 AM · Sam.")).toBeInTheDocument();
    expect(panel.getByText("Event")).toBeInTheDocument(); // an untimed one
    expect(panel.getByText("9:30 AM", { selector: ".brief-index" })).toBeInTheDocument();
    expect(panel.getByText("To do · Whole household.")).toBeInTheDocument();
    expect(panel.getByText("Done · Whole household.")).toBeInTheDocument();
    expect(panel.getByText("Dinner: Tacos")).toBeInTheDocument();
    expect(panel.getByText("Planned meal.")).toBeInTheDocument();
    expect(panel.getByText("Pay bill").closest("a")).toHaveAttribute("data-done");
  });

  it("shows a contact date without a year as coming from the contacts", async () => {
    agendas([], [birthday("2026-10-07")]);
    await run();
    expect(within(section("Today & coming up")).getByText("From your contacts.")).toBeInTheDocument();
  });

  it("links each entry to where it lives: the calendar's day, the contact, or the planner", async () => {
    agendas([], [item("2026-10-07", { title: "Picture day" }), birthday("2026-10-07"), meal("2026-10-07")]);
    await run();
    const hrefs = within(section("Today & coming up")).getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/calendar?view=day&date=2026-10-07&today=2026-10-07");
    expect(hrefs).toContain("/contacts/c9");
    expect(hrefs).toContain("/meals?week=2026-10-07&today=2026-10-07");
  });

  it("lists the next seven days' events and contact dates by weekday, not tasks or meals", async () => {
    agendas([], [
      item("2026-10-09", { title: "Soccer", startTime: "17:00" }),
      birthday("2026-10-12", { title: "Kim's birthday" }),
      item("2026-10-09", { kind: "TASK", title: "Hidden task" }),
      meal("2026-10-09"),
    ]);
    await run();
    const panel = within(section("Today & coming up"));
    expect(panel.getByText("Next 7 days")).toBeInTheDocument();
    expect(panel.getByText("Fri 9")).toBeInTheDocument();
    expect(panel.getByText("Mon 12")).toBeInTheDocument();
    expect(panel.getByText("Soccer")).toBeInTheDocument();
    expect(panel.getByText("Kim's birthday")).toBeInTheDocument();
    expect(panel.queryByText("Hidden task")).toBeNull();
    expect(panel.queryByText("Dinner: Tacos")).toBeNull();
  });

  it("caps the upcoming list and links to the calendar for the rest", async () => {
    agendas([], Array.from({ length: 9 }, (_, i) => item("2026-10-09", { title: `Event ${i}` })));
    await run();
    const panel = within(section("Today & coming up"));
    expect(panel.getAllByText(/^Event \d$/)).toHaveLength(6);
    expect(panel.getByRole("link", { name: "+3 more" })).toHaveAttribute("href", "/calendar?view=week&today=2026-10-07");
  });

  it("lists overdue tasks first, in red, with the date they were due, and counts any beyond the cap", async () => {
    const late = (day: string, title: string) => item(day, { kind: "TASK", title, overdue: true, assigneeName: title === "Renew passport" ? "Sam" : null });
    agendas([], [], [
      late("2026-10-01", "Renew passport"), late("2026-10-02", "B"), late("2026-10-03", "C"),
      late("2026-10-04", "D"), late("2026-10-05", "E"), late("2026-10-06", "F"), late("2026-10-06", "G"),
    ]);
    await run();
    const panel = within(section("Today & coming up"));
    expect(panel.getByText("Overdue", { selector: ".brief-sub" })).toBeInTheDocument();
    expect(panel.getByText("Overdue task · Sam.")).toBeInTheDocument();
    expect(panel.getByText("Oct 1")).toBeInTheDocument();
    expect(panel.getByText("Renew passport").closest("a")).toHaveAttribute("data-overdue");
    expect(panel.getByRole("link", { name: "+2 more overdue" })).toHaveAttribute("href", "/calendar?view=week&today=2026-10-07");
    expect(panel.queryByText("Nothing today, and nothing in the next 7 days")).toBeNull();
  });

  it("leaves out the sub-headings of lists that are empty", async () => {
    agendas([], [item("2026-10-07", { title: "Only today" })]);
    await run();
    const panel = within(section("Today & coming up"));
    expect(panel.queryByText("Overdue")).toBeNull();
    expect(panel.queryByText("Next 7 days")).toBeNull();
    expect(panel.queryByText("+1 more")).toBeNull();
  });
});
