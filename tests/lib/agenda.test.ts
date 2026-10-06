import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { calendarItem: { findMany: vi.fn() }, contact: { findMany: vi.fn() }, mealPlanEntry: { findMany: vi.fn() }, mealPlanSettings: { upsert: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { getAgenda } from "@/lib/agenda";
import { entriesInRange } from "@/lib/mealPlan";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const row = (over: Record<string, unknown> = {}) => ({
  id: "i1", householdId: "h1", kind: "EVENT", title: "Dentist", notes: null, date: day("2026-10-08"),
  startTime: null, endTime: null, assigneeContactId: null, assignee: null,
  createdAt: new Date("2026-10-01T10:00:00Z"), updatedAt: new Date(), ...over,
});
const contactRow = (over: Record<string, unknown> = {}) => ({
  id: "c1", firstName: "Jo", nickname: null, birthdayMonth: null, birthdayDay: null, birthdayYear: null,
  importantDate1: null, importantDate1Label: null, importantDate2: null, importantDate2Label: null, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.calendarItem.findMany).mockResolvedValue([]);
  vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
  vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([]);
  vi.mocked(prisma.mealPlanSettings.upsert).mockResolvedValue({ weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: true, showDinner: true } as any);
});

const run = (over: Partial<Parameters<typeof getAgenda>[3]> = {}) => getAgenda("h1", "2026-10-04", "2026-10-10", { ...over });
const itemCalls = () => vi.mocked(prisma.calendarItem.findMany).mock.calls.map((c) => c[0]!);

describe("getAgenda: what it asks the database", () => {
  it("scopes every query to the household", async () => {
    await run({ includeMeals: true });
    const [inRangeCall, repeatingCall] = itemCalls();
    expect(inRangeCall.where).toMatchObject({ householdId: "h1", date: { gte: day("2026-10-04"), lte: day("2026-10-10") } });
    expect(repeatingCall.where).toMatchObject({ householdId: "h1" });
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]!.where).toMatchObject({ ownerHouseholdId: "h1", deletedAt: null });
    expect(vi.mocked(prisma.mealPlanEntry.findMany).mock.calls[0][0]!.where).toMatchObject({ householdId: "h1" });
    expect(prisma.mealPlanSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { householdId: "h1" } }));
  });

  it("only looks at contacts that have a date, and never soft-deleted ones", async () => {
    await run();
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]!.where).toEqual(
      expect.objectContaining({
        deletedAt: null,
        OR: [{ birthdayMonth: { not: null } }, { importantDate1: { not: null } }, { importantDate2: { not: null } }],
      })
    );
  });

  it("leaves meals out unless asked", async () => {
    await run();
    expect(prisma.mealPlanEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.mealPlanSettings.upsert).not.toHaveBeenCalled();
  });

  it("applies no assignee condition without a filter, and 'the member or nobody' with one", async () => {
    await run();
    expect(itemCalls()[0].where).not.toHaveProperty("OR");
    expect(itemCalls()[1].where).not.toHaveProperty("OR");
    vi.mocked(prisma.calendarItem.findMany).mockClear();
    await run({ assigneeContactId: "c9" });
    const member = { OR: [{ assigneeContactId: null }, { assigneeContactId: "c9" }] };
    expect(itemCalls()[0].where).toMatchObject(member);
    expect(itemCalls()[1].where!.AND).toContainEqual(member);
  });

  it("applies no assignee condition for an empty filter either", async () => {
    await run({ assigneeContactId: null });
    expect(itemCalls()[0].where).not.toHaveProperty("OR");
  });
});

describe("getAgenda: items", () => {
  it("turns rows into editable entries, in the day's order", async () => {
    vi.mocked(prisma.calendarItem.findMany).mockResolvedValueOnce([
      row({ id: "e", title: "Picture day" }),
      row({ id: "timed", title: "Dentist", startTime: "09:30", endTime: "10:15" }),
    ] as any);
    const { entries } = await run();
    expect(entries.map((e) => e.title)).toEqual(["Picture day", "Dentist"]);
    expect(entries[1]).toMatchObject({ source: "item", id: "timed", date: "2026-10-08", startTime: "09:30", endTime: "10:15", editable: true });
  });

  it("names the assignee by nickname, keeping the name after the contact was removed", async () => {
    vi.mocked(prisma.calendarItem.findMany).mockResolvedValueOnce([
      row({ id: "a", assigneeContactId: "c2", assignee: { firstName: "Elizabeth", nickname: "Ellie" } }),
      row({ id: "b", assigneeContactId: "c3", assignee: { firstName: "Sam", nickname: null } }),
      row({ id: "c" }),
    ] as any);
    const { entries } = await run();
    expect(Object.fromEntries(entries.map((e) => [(e as any).id, (e as any).assigneeName]))).toEqual({ a: "Ellie", b: "Sam", c: null });
    // The query doesn't filter out removed contacts' names: it includes the assignee whatever its state.
    expect(itemCalls()[0].include).toEqual({ assignee: { select: { firstName: true, nickname: true } } });
  });

});

describe("getAgenda: contact dates", () => {
  it("adds birthdays and important dates inside the range, read-only, and none outside it", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      contactRow({ id: "a", birthdayMonth: 10, birthdayDay: 8, birthdayYear: 1985 }),
      contactRow({ id: "b", firstName: "Bo", importantDate1: "2015-10-06", importantDate1Label: "Anniversary" }),
      contactRow({ id: "far", birthdayMonth: 3, birthdayDay: 3 }),
    ] as any);
    const { entries } = await run();
    expect(entries.map((e) => [e.source, e.title, e.date])).toEqual([
      ["contact_date", "Bo: Anniversary", "2026-10-06"],
      ["contact_date", "Jo's birthday", "2026-10-08"],
    ]);
    expect(entries[1]).toMatchObject({ contactId: "a", type: "birthday", turns: 41, editable: false });
  });

  it("finds dates across a year boundary", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      contactRow({ id: "dec", birthdayMonth: 12, birthdayDay: 30 }),
      contactRow({ id: "jan", birthdayMonth: 1, birthdayDay: 2 }),
    ] as any);
    const { entries } = await getAgenda("h1", "2026-12-28", "2027-01-03");
    expect(entries.map((e) => e.date)).toEqual(["2026-12-30", "2027-01-02"]);
  });

  it("puts a Feb 29 birthday on Feb 28 in a common year", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([contactRow({ birthdayMonth: 2, birthdayDay: 29 })] as any);
    const { entries } = await getAgenda("h1", "2027-02-22", "2027-02-28");
    expect(entries.map((e) => e.date)).toEqual(["2027-02-28"]);
  });

  it("gives every entry a distinct id, even for the same contact on the same day", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      contactRow({ birthdayMonth: 10, birthdayDay: 6, importantDate1: "2010-10-06", importantDate1Label: "Moved in" }),
    ] as any);
    const { entries } = await run();
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });

  it("is not affected by the assignee filter", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([contactRow({ birthdayMonth: 10, birthdayDay: 8 })] as any);
    expect((await run({ assigneeContactId: "someone-else" })).entries).toHaveLength(1);
  });
});

describe("getAgenda: meals", () => {
  const planned = (over: Record<string, unknown> = {}) => ({
    id: "e1", date: day("2026-10-08"), slot: "DINNER", mealId: "m1", text: null, createdAt: new Date("2026-10-02T00:00:00Z"),
    meal: { id: "m1", name: "BBQ chicken", description: null }, ...over,
  });

  it("adds planned meals, labelled with the slot, read-only, after everything else on the day", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([
      planned(),
      planned({ id: "e2", slot: "LUNCH", mealId: null, text: "Leftovers", meal: null }),
    ] as any);
    vi.mocked(prisma.calendarItem.findMany).mockResolvedValueOnce([row({ title: "Call the vet" })] as any);
    const { entries } = await run({ includeMeals: true });
    expect(entries.map((e) => e.title)).toEqual(["Call the vet", "Lunch: Leftovers", "Dinner: BBQ chicken"]);
    expect(entries[2]).toMatchObject({ source: "meal", slot: "DINNER", editable: false });
  });

  it("shows only the slots the household has switched on", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([
      planned({ id: "b", slot: "BREAKFAST", meal: { id: "m", name: "Eggs", description: null } }),
      planned({ id: "l", slot: "LUNCH", meal: { id: "m", name: "Soup", description: null } }),
    ] as any);
    expect((await run({ includeMeals: true })).entries.map((e) => e.title)).toEqual(["Lunch: Soup"]);
    vi.mocked(prisma.mealPlanSettings.upsert).mockResolvedValue({ weekStartsOn: "SUNDAY", showBreakfast: true, showLunch: false, showDinner: false } as any);
    expect((await run({ includeMeals: true })).entries.map((e) => e.title)).toEqual(["Breakfast: Eggs"]);
  });

  it("uses the meal's current name, and skips an entry with nothing to show", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([
      planned({ meal: { id: "m1", name: "Renamed", description: null } }),
      planned({ id: "blank", mealId: null, text: null, meal: null }),
    ] as any);
    expect((await run({ includeMeals: true })).entries.map((e) => e.title)).toEqual(["Dinner: Renamed"]);
  });

  it("is not affected by the assignee filter", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([planned()] as any);
    expect((await run({ includeMeals: true, assigneeContactId: "x" })).entries).toHaveLength(1);
  });
});

describe("entriesInRange (the meal query the agenda uses)", () => {
  it("asks for the household's entries inside the dates, oldest first, with each entry's creation time", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([
      { id: "e", date: day("2026-10-08"), slot: "LUNCH", mealId: null, text: "Soup", createdAt: new Date("2026-10-02T00:00:00Z"), meal: null },
    ] as any);
    const rows = await entriesInRange("h1", "2026-10-04", "2026-10-31");
    expect(vi.mocked(prisma.mealPlanEntry.findMany).mock.calls[0][0]).toMatchObject({
      where: { householdId: "h1", date: { gte: day("2026-10-04"), lte: day("2026-10-31") } },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toEqual([{ id: "e", date: "2026-10-08", slot: "LUNCH", mealId: null, label: "Soup", description: null, createdAt: "2026-10-02T00:00:00.000Z" }]);
  });

  it("labels an entry with neither a meal nor text as empty", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([
      { id: "e", date: day("2026-10-08"), slot: "LUNCH", mealId: null, text: null, createdAt: new Date(), meal: null },
    ] as any);
    expect((await entriesInRange("h1", "2026-10-08", "2026-10-08"))[0].label).toBe("");
  });

  it("carries a meal's description along", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([
      { id: "e", date: day("2026-10-08"), slot: "LUNCH", mealId: "m", text: null, createdAt: new Date(), meal: { id: "m", name: "Soup", description: "Simmer" } },
    ] as any);
    expect((await entriesInRange("h1", "2026-10-08", "2026-10-08"))[0]).toMatchObject({ label: "Soup", description: "Simmer" });
  });
});

describe("getAgenda: repeating events", () => {
  const weekly = (over: Record<string, unknown> = {}) =>
    row({ id: "r1", title: "Trash", date: day("2026-09-23"), repeatUnit: "WEEK", repeatEvery: 1, repeatUntil: null, ...over });
  const withRepeating = (...rows: unknown[]) =>
    vi.mocked(prisma.calendarItem.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce(rows as any);

  it("asks for repeating events however long ago they began, and leaves them out of the dated query", async () => {
    await run();
    const [dated, repeating] = itemCalls();
    expect(dated.where).toMatchObject({ repeatUnit: null });
    expect(repeating.where).toMatchObject({
      householdId: "h1", repeatUnit: { not: null }, date: { lte: day("2026-10-10") },
      AND: [{ OR: [{ repeatUntil: null }, { repeatUntil: { gte: day("2026-10-04") } }] }, {}],
    });
  });

  it("applies the assignee filter to repeating events too, without losing the end-date condition", async () => {
    await run({ assigneeContactId: "c9" });
    expect(itemCalls()[1].where!.AND).toEqual([
      { OR: [{ repeatUntil: null }, { repeatUntil: { gte: day("2026-10-04") } }] },
      { OR: [{ assigneeContactId: null }, { assigneeContactId: "c9" }] },
    ]);
  });

  it("shows one entry per occurrence in the range, each with its own id but the stored item's itemId", async () => {
    withRepeating(weekly({ repeatUntil: day("2026-10-09") }));
    const { entries } = await run();
    expect(entries.map((e) => [e.id, e.date])).toEqual([["r1@2026-10-07", "2026-10-07"]]);
    const e = entries[0] as any;
    expect(e.itemId).toBe("r1");
    expect(e.repeat).toEqual({ unit: "WEEK", every: 1, until: "2026-10-09", start: "2026-09-23" });
  });

  it("repeats on the series' own cadence", async () => {
    withRepeating(weekly({ date: day("2026-10-01"), repeatEvery: 1 }));
    const { entries } = await run();
    expect(entries.map((e) => e.date)).toEqual(["2026-10-08"]);
  });

  it("gives ordinary items no repeat and their own id", async () => {
    vi.mocked(prisma.calendarItem.findMany).mockResolvedValueOnce([row()] as any);
    const { entries } = await run();
    expect(entries[0]).toMatchObject({ id: "i1", itemId: "i1", repeat: null });
  });
});
