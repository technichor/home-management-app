import { describe, it, expect } from "vitest";
import { OVERDUE_SHOWN, UPCOMING_DAYS, UPCOMING_SHOWN, buildTodayPanel } from "@/lib/homePanel";
import type { AgendaContactDateEntry, AgendaEntry, AgendaItemEntry, AgendaMealEntry } from "@/lib/agendaOrder";

const TODAY = "2026-10-07";
let n = 0;
const item = (date: string, over: Partial<AgendaItemEntry> = {}): AgendaItemEntry => ({
  source: "item", id: `i${++n}`, itemId: "item", kind: "EVENT", date, title: `Item ${n}`, notes: null, startTime: null, endTime: null, assigneeContactId: null,
  assigneeName: null, completed: false, overdue: false, createdAt: "2026-10-01T00:00:00Z", repeat: null, editable: true, ...over,
});
const date = (day: string, title = "Jo's birthday"): AgendaContactDateEntry => ({
  source: "contact_date", id: `c${++n}`, date: day, title, type: "birthday", contactId: "c", turns: null, editable: false,
});
const meal = (day: string): AgendaMealEntry => ({ source: "meal", id: `m${++n}`, date: day, slot: "DINNER", title: "Dinner: Tacos", createdAt: "", editable: false });
const panel = (entries: AgendaEntry[], overdue: AgendaItemEntry[] = []) => buildTodayPanel({ today: TODAY, entries, overdue });
const ids = (entries: AgendaEntry[]) => entries.map((e) => e.id);

describe("buildTodayPanel", () => {
  it("looks a week ahead", () => {
    expect(UPCOMING_DAYS).toBe(7);
  });

  it("is empty when there is nothing", () => {
    expect(panel([])).toEqual({ overdue: [], overdueMore: 0, today: [], upcoming: [], upcomingMore: 0 });
  });

  it("puts everything on today in the today list, whatever it is", () => {
    const a = date(TODAY);
    const b = item(TODAY, { kind: "TASK" });
    const c = meal(TODAY);
    const d = item(TODAY);
    expect(ids(panel([a, d, b, c]).today)).toEqual(ids([a, d, b, c]));
  });

  it("keeps the order it was given (the agenda's order)", () => {
    const first = date(TODAY);
    const second = item(TODAY);
    expect(ids(panel([first, second]).today)).toEqual([first.id, second.id]);
  });

  it("lists only events and contact dates for the days after today", () => {
    const event = item("2026-10-08");
    const birthday = date("2026-10-09");
    const task = item("2026-10-09", { kind: "TASK" });
    const dish = meal("2026-10-10");
    const { upcoming, today } = panel([event, birthday, task, dish]);
    expect(ids(upcoming)).toEqual([event.id, birthday.id]);
    expect(today).toEqual([]);
  });

  it("doesn't repeat today's entries in the upcoming list, nor include earlier days", () => {
    const todays = item(TODAY);
    const earlier = item("2026-10-06");
    const { upcoming, today } = panel([earlier, todays]);
    expect(ids(today)).toEqual([todays.id]);
    expect(upcoming).toEqual([]);
  });

  it("caps the upcoming list and counts the rest", () => {
    const events = Array.from({ length: UPCOMING_SHOWN + 3 }, (_, i) => item(`2026-10-${String(8 + (i % 6)).padStart(2, "0")}`));
    const { upcoming, upcomingMore } = panel(events);
    expect(upcoming).toHaveLength(UPCOMING_SHOWN);
    expect(upcomingMore).toBe(3);
    expect(ids(upcoming)).toEqual(ids(events).slice(0, UPCOMING_SHOWN));
  });

  it("shows exactly the cap with nothing left over", () => {
    const events = Array.from({ length: UPCOMING_SHOWN }, () => item("2026-10-08"));
    expect(panel(events)).toMatchObject({ upcomingMore: 0 });
  });

  it("shows overdue tasks, capped, with the rest counted", () => {
    const late = Array.from({ length: OVERDUE_SHOWN + 2 }, (_, i) => item("2026-10-01", { kind: "TASK", overdue: true, title: `Late ${i}` }));
    const p = panel([], late);
    expect(p.overdue.map((t) => t.title)).toEqual(late.slice(0, OVERDUE_SHOWN).map((t) => t.title));
    expect(p.overdueMore).toBe(2);
    expect(panel([], late.slice(0, OVERDUE_SHOWN)).overdueMore).toBe(0);
  });
});
