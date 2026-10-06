import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  compareAgenda,
  orderAgenda,
  sectionOf,
  visibleToAssignee,
  type AgendaContactDateEntry,
  type AgendaEntry,
  type AgendaItemEntry,
  type AgendaMealEntry,
} from "@/lib/agendaOrder";

const D = "2026-10-07";
let n = 0;
const created = () => `2026-10-01T00:00:${String(n++).padStart(2, "0")}.000Z`;

const item = (over: Partial<AgendaItemEntry> = {}): AgendaItemEntry => ({
  source: "item", id: `i${n}`, itemId: "item", date: D, title: "Item", notes: null, startTime: null, endTime: null,
  assigneeContactId: null, assigneeName: null, createdAt: created(), repeat: null, editable: true, ...over,
});
const contactDate = (over: Partial<AgendaContactDateEntry> = {}): AgendaContactDateEntry => ({
  source: "contact_date", id: `c${n++}`, date: D, title: "Date", type: "birthday", contactId: "c", turns: null, editable: false, ...over,
});
const meal = (over: Partial<AgendaMealEntry> = {}): AgendaMealEntry => ({
  source: "meal", id: `m${n++}`, date: D, slot: "DINNER", title: "Dinner: X", createdAt: created(), editable: false, ...over,
});
const titles = (entries: AgendaEntry[]) => entries.map((e) => e.title);

describe("the order of a day", () => {
  it("is contact dates, untimed events, timed events, then meals", () => {
    const entries = orderAgenda([
      meal({ title: "Dinner: Tacos" }),
      item({ title: "Timed", startTime: "09:00" }),
      item({ title: "Untimed" }),
      contactDate({ title: "Jo's birthday" }),
    ]);
    expect(titles(entries)).toEqual(["Jo's birthday", "Untimed", "Timed", "Dinner: Tacos"]);
  });

  it("names each section", () => {
    expect(sectionOf(contactDate())).toBe(0);
    expect(sectionOf(item())).toBe(1);
    expect(sectionOf(item({ startTime: "08:00" }))).toBe(2);
    expect(sectionOf(meal())).toBe(3);
  });

  it("puts birthdays before other important dates, then by title", () => {
    const entries = orderAgenda([
      contactDate({ type: "important", title: "Al: Anniversary" }),
      contactDate({ type: "birthday", title: "Zed's birthday" }),
      contactDate({ type: "birthday", title: "Amy's birthday" }),
      contactDate({ type: "important", title: "Bo: Moved in" }),
    ]);
    expect(titles(entries)).toEqual(["Amy's birthday", "Zed's birthday", "Al: Anniversary", "Bo: Moved in"]);
  });

  it("keeps untimed events in the order they were added", () => {
    const a = item({ title: "First" });
    const b = item({ title: "Second" });
    const c = item({ title: "Third" });
    expect(titles(orderAgenda([c, a, b]))).toEqual(["First", "Second", "Third"]);
  });

  it("orders timed events by start time, ties in the order added", () => {
    const entries = orderAgenda([
      item({ title: "Late", startTime: "17:30" }),
      item({ title: "Early", startTime: "07:15" }),
      item({ title: "Tie A", startTime: "12:00" }),
      item({ title: "Tie B", startTime: "12:00" }),
    ]);
    expect(titles(entries)).toEqual(["Early", "Tie A", "Tie B", "Late"]);
  });

  it("orders meals breakfast, lunch, dinner, then the order added", () => {
    const entries = orderAgenda([
      meal({ slot: "DINNER", title: "Dinner: A" }),
      meal({ slot: "BREAKFAST", title: "Breakfast: B" }),
      meal({ slot: "DINNER", title: "Dinner: C" }),
      meal({ slot: "LUNCH", title: "Lunch: D" }),
    ]);
    expect(titles(entries)).toEqual(["Breakfast: B", "Lunch: D", "Dinner: A", "Dinner: C"]);
  });

  it("orders days first, so a later day never jumps ahead", () => {
    const entries = orderAgenda([
      item({ title: "Tuesday event", date: "2026-10-06" }),
      contactDate({ title: "Wednesday birthday", date: "2026-10-07" }),
      item({ title: "Monday event", date: "2026-10-05" }),
    ]);
    expect(titles(entries)).toEqual(["Monday event", "Tuesday event", "Wednesday birthday"]);
  });

  it("doesn't change the list it is given, and a lone entry is fine", () => {
    const list = [meal(), contactDate()];
    const before = list.map((e) => e.id);
    orderAgenda(list);
    expect(list.map((e) => e.id)).toEqual(before);
    expect(orderAgenda([])).toEqual([]);
    expect(compareAgenda(list[0], list[0])).toBe(0);
  });

  it("treats a timed event and an untimed one as different sections even with equal creation times", () => {
    const at = "2026-10-01T00:00:00.000Z";
    const entries = orderAgenda([item({ title: "Timed", startTime: "06:00", createdAt: at }), item({ title: "Untimed", createdAt: at })]);
    expect(titles(entries)).toEqual(["Untimed", "Timed"]);
  });

  it("falls back to creation order when only one of two events has a time", () => {
    // (Different sections, so the untimed one always comes first.)
    expect(compareAgenda(item({ startTime: "10:00" }), item())).toBeGreaterThan(0);
    expect(compareAgenda(item(), item({ startTime: "10:00" }))).toBeLessThan(0);
  });
});

describe("the assignee filter", () => {
  it("shows everything with no filter", () => {
    for (const filter of [undefined, null, ""]) {
      expect(visibleToAssignee({ assigneeContactId: "a" }, filter)).toBe(true);
      expect(visibleToAssignee({ assigneeContactId: null }, filter)).toBe(true);
    }
  });

  it("shows a member's own items and the household-wide ones, and hides items for others", () => {
    expect(visibleToAssignee({ assigneeContactId: "a" }, "a")).toBe(true);
    expect(visibleToAssignee({ assigneeContactId: null }, "a")).toBe(true);
    expect(visibleToAssignee({ assigneeContactId: "b" }, "a")).toBe(false);
  });
});
