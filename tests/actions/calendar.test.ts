import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: {
    calendarItem: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    calendarSettings: { upsert: vi.fn(), update: vi.fn() },
    contact: { findMany: vi.fn() },
    mealPlanSettings: { upsert: vi.fn(), update: vi.fn() },
  },
}));

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  createCalendarItemAction,
  deleteCalendarItemAction,
  moveTaskToTodayAction,
  setShowMealsAction,
  setTaskCompletedAction,
  setWeekStartAction,
  updateCalendarItemAction,
} from "@/app/(app)/calendar/actions";
import { getMealPlanSettings } from "@/lib/mealPlan";
import { resolveCalendarRange } from "@/lib/dates";
import { updateMealPlanSettingsAction } from "@/app/(app)/meals/actions";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const item = (over: Record<string, unknown> = {}) => ({
  id: "i1", householdId: "h1", kind: "EVENT", title: "Dentist", notes: null, date: day("2026-10-08"),
  startTime: null, endTime: null, assigneeContactId: null, completedAt: null, ...over,
});
const members = [{ id: "m1", firstName: "Sam", lastName: "Doe", nickname: null }, { id: "m2", firstName: "Ann", lastName: "Doe", nickname: "Annie" }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item() as any);
  vi.mocked(prisma.calendarItem.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.calendarItem.update).mockResolvedValue({} as any);
  vi.mocked(prisma.calendarItem.delete).mockResolvedValue({} as any);
  vi.mocked(prisma.calendarSettings.upsert).mockResolvedValue({ householdId: "h1", showMeals: false } as any);
  vi.mocked(prisma.calendarSettings.update).mockResolvedValue({} as any);
  vi.mocked(prisma.contact.findMany).mockResolvedValue(members as any);
});

const fields = { title: "Dentist", date: "2026-10-08" };

describe("authentication", () => {
  it.each([
    ["create", () => createCalendarItemAction("EVENT", fields)],
    ["update", () => updateCalendarItemAction("i1", fields)],
    ["delete", () => deleteCalendarItemAction("i1")],
    ["complete", () => setTaskCompletedAction("i1", true)],
    ["move to today", () => moveTaskToTodayAction("i1", "2026-10-07")],
    ["show meals", () => setShowMealsAction(true)],
    ["week start", () => setWeekStartAction("MONDAY")],
  ])("%s refuses a caller with no session, touching nothing", async (_n, call) => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.calendarItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.calendarItem.create).not.toHaveBeenCalled();
    expect(prisma.calendarItem.update).not.toHaveBeenCalled();
    expect(prisma.calendarItem.delete).not.toHaveBeenCalled();
    expect(prisma.calendarSettings.update).not.toHaveBeenCalled();
    expect(prisma.mealPlanSettings.update).not.toHaveBeenCalled();
  });
});

describe("createCalendarItemAction", () => {
  it("adds an event in the session's household, with trimmed fields and a date-only value", async () => {
    const result = await createCalendarItemAction("EVENT", { title: "  Picture day ", notes: "Wear blue\nsmile", date: "2026-10-08", startTime: "09:00", endTime: "10:00" });
    expect(result).toEqual({ ok: true, id: "new1" });
    expect(prisma.calendarItem.create).toHaveBeenCalledWith({
      data: { householdId: "h1", kind: "EVENT", title: "Picture day", notes: "Wear blue\nsmile", date: day("2026-10-08"), startTime: "09:00", endTime: "10:00", assigneeContactId: null },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(revalidatePath).toHaveBeenCalledWith("/home");
  });

  it("adds a reminder (an event with no time) and a task", async () => {
    await createCalendarItemAction("EVENT", fields);
    expect(vi.mocked(prisma.calendarItem.create).mock.calls[0][0].data).toMatchObject({ kind: "EVENT", startTime: null, endTime: null });
    await createCalendarItemAction("TASK", fields);
    expect(vi.mocked(prisma.calendarItem.create).mock.calls[1][0].data).toMatchObject({ kind: "TASK", startTime: null });
  });

  it("starts a task not completed (it has no completion in its data)", async () => {
    await createCalendarItemAction("TASK", fields);
    expect(vi.mocked(prisma.calendarItem.create).mock.calls[0][0].data).not.toHaveProperty("completedAt");
  });

  it("rejects a kind that isn't event or task", async () => {
    expect(await createCalendarItemAction("MEETING" as any, fields)).toEqual({ ok: false, error: "Choose event or task" });
    expect(prisma.calendarItem.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a task with a time", () => createCalendarItemAction("TASK", { ...fields, startTime: "09:00" }), "Tasks don't have a time"],
    ["an end time without a start", () => createCalendarItemAction("EVENT", { ...fields, endTime: "10:00" }), "Add a start time before an end time"],
    ["an end before the start", () => createCalendarItemAction("EVENT", { ...fields, startTime: "10:00", endTime: "09:00" }), "The end time must be after the start time"],
    ["a blank title", () => createCalendarItemAction("EVENT", { ...fields, title: " " }), "Give it a title"],
    ["a bad date", () => createCalendarItemAction("EVENT", { ...fields, date: "2026-02-30" }), "Choose a valid date"],
    ["a bad time", () => createCalendarItemAction("EVENT", { ...fields, startTime: "9am" }), "Enter the time as HH:MM (24-hour)"],
  ])("rejects %s, writing nothing", async (_n, call, error) => {
    expect(await call()).toEqual({ ok: false, error });
    expect(prisma.calendarItem.create).not.toHaveBeenCalled();
  });

  it("assigns to one of the household's own members, found only through the session's household", async () => {
    await createCalendarItemAction("EVENT", { ...fields, assigneeContactId: "m1" });
    expect(vi.mocked(prisma.calendarItem.create).mock.calls[0][0].data).toMatchObject({ assigneeContactId: "m1" });
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]!.where).toMatchObject({ ownerHouseholdId: "h1", householdId: "h1", category: "FAMILY_FRIEND", deletedAt: null });
  });

  it("refuses an assignee who isn't one of the household's members (another household's contact, a service provider, a removed member)", async () => {
    expect(await createCalendarItemAction("EVENT", { ...fields, assigneeContactId: "someone-elses" })).toEqual({
      ok: false, error: "Choose one of your household's members",
    });
    expect(prisma.calendarItem.create).not.toHaveBeenCalled();
  });

  it("doesn't look anyone up when there is no assignee", async () => {
    await createCalendarItemAction("EVENT", fields);
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });
});

describe("updateCalendarItemAction", () => {
  it("finds the item only through the session's household, and changes its fields", async () => {
    expect(await updateCalendarItemAction("i1", { title: "Dentist (moved)", date: "2026-10-09", startTime: "14:00" })).toEqual({ ok: true });
    expect(prisma.calendarItem.findFirst).toHaveBeenCalledWith({ where: { id: "i1", householdId: "h1" } });
    expect(prisma.calendarItem.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { title: "Dentist (moved)", notes: null, date: day("2026-10-09"), startTime: "14:00", endTime: null, assigneeContactId: null },
    });
  });

  it("treats another household's item as gone, changing nothing", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(null);
    expect(await updateCalendarItemAction("theirs", fields)).toEqual({ ok: false, error: "That item isn't on your calendar any more" });
    expect(prisma.calendarItem.update).not.toHaveBeenCalled();
  });

  it("never changes the kind or the completion", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ kind: "TASK", completedAt: new Date() }) as any);
    await updateCalendarItemAction("i1", { ...fields, title: "Renamed" });
    const data = vi.mocked(prisma.calendarItem.update).mock.calls[0][0].data;
    expect(data).not.toHaveProperty("kind");
    expect(data).not.toHaveProperty("completedAt");
  });

  it("validates against the item's own kind: a task can't gain a time", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ kind: "TASK" }) as any);
    expect(await updateCalendarItemAction("i1", { ...fields, startTime: "09:00" })).toEqual({ ok: false, error: "Tasks don't have a time" });
    expect(prisma.calendarItem.update).not.toHaveBeenCalled();
  });

  it("clears the times of an event when they are removed", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ startTime: "09:00", endTime: "10:00" }) as any);
    await updateCalendarItemAction("i1", { ...fields, startTime: "", endTime: "" });
    expect(vi.mocked(prisma.calendarItem.update).mock.calls[0][0].data).toMatchObject({ startTime: null, endTime: null });
  });

  it("checks a new assignee against the household's members", async () => {
    expect(await updateCalendarItemAction("i1", { ...fields, assigneeContactId: "stranger" })).toEqual({ ok: false, error: "Choose one of your household's members" });
    await updateCalendarItemAction("i1", { ...fields, assigneeContactId: "m2" });
    expect(vi.mocked(prisma.calendarItem.update).mock.calls[0][0].data).toMatchObject({ assigneeContactId: "m2" });
  });

  it("lets an item keep an assignee who has since been removed, but not choose them anew", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ assigneeContactId: "removed" }) as any);
    expect(await updateCalendarItemAction("i1", { ...fields, title: "Edited", assigneeContactId: "removed" })).toEqual({ ok: true });
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ assigneeContactId: null }) as any);
    expect(await updateCalendarItemAction("i1", { ...fields, assigneeContactId: "removed" })).toMatchObject({ ok: false });
  });

  it("can hand an assigned item back to the whole household", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ assigneeContactId: "m1" }) as any);
    await updateCalendarItemAction("i1", { ...fields, assigneeContactId: null });
    expect(vi.mocked(prisma.calendarItem.update).mock.calls[0][0].data).toMatchObject({ assigneeContactId: null });
  });

  it("can edit an item in the past", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ date: day("2020-01-01") }) as any);
    expect(await updateCalendarItemAction("i1", { ...fields, date: "2020-01-02" })).toEqual({ ok: true });
  });
});

describe("deleteCalendarItemAction", () => {
  it("hard-deletes an item of the household", async () => {
    expect(await deleteCalendarItemAction("i1")).toEqual({ ok: true });
    expect(prisma.calendarItem.findFirst).toHaveBeenCalledWith({ where: { id: "i1", householdId: "h1" } });
    expect(prisma.calendarItem.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });

  it("treats another household's item as gone", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(null);
    expect(await deleteCalendarItemAction("theirs")).toEqual({ ok: false, error: "That item isn't on your calendar any more" });
    expect(prisma.calendarItem.delete).not.toHaveBeenCalled();
  });
});

describe("setTaskCompletedAction", () => {
  beforeEach(() => vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ kind: "TASK", date: day("2026-10-01") }) as any));

  it("completes a task now, without touching its date", async () => {
    expect(await setTaskCompletedAction("i1", true)).toEqual({ ok: true });
    const call = vi.mocked(prisma.calendarItem.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "i1" });
    expect(call.data).toEqual({ completedAt: expect.any(Date) });
    expect(call.data).not.toHaveProperty("date");
  });

  it("unchecks it", async () => {
    await setTaskCompletedAction("i1", false);
    expect(vi.mocked(prisma.calendarItem.update).mock.calls[0][0].data).toEqual({ completedAt: null });
  });

  it("only works on a task", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ kind: "EVENT" }) as any);
    expect(await setTaskCompletedAction("i1", true)).toEqual({ ok: false, error: "Only a task can be checked off" });
    expect(prisma.calendarItem.update).not.toHaveBeenCalled();
  });

  it("treats another household's task as gone", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(null);
    expect(await setTaskCompletedAction("theirs", true)).toEqual({ ok: false, error: "That item isn't on your calendar any more" });
    expect(prisma.calendarItem.update).not.toHaveBeenCalled();
  });
});

describe("moveTaskToTodayAction", () => {
  beforeEach(() => vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ kind: "TASK", date: day("2026-10-01") }) as any));

  it("moves an open task to the browser's today (not the server's)", async () => {
    expect(await moveTaskToTodayAction("i1", "2026-10-07")).toEqual({ ok: true });
    expect(prisma.calendarItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { date: day("2026-10-07") } });
  });

  it("refuses a bad date, an event, and a completed task", async () => {
    expect(await moveTaskToTodayAction("i1", "yesterday")).toEqual({ ok: false, error: "Choose a valid date" });
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ kind: "EVENT" }) as any);
    expect(await moveTaskToTodayAction("i1", "2026-10-07")).toEqual({ ok: false, error: "Only a task can be moved to today" });
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(item({ kind: "TASK", completedAt: new Date() }) as any);
    expect(await moveTaskToTodayAction("i1", "2026-10-07")).toEqual({ ok: false, error: "A completed task stays on its date" });
    expect(prisma.calendarItem.update).not.toHaveBeenCalled();
  });

  it("treats another household's task as gone", async () => {
    vi.mocked(prisma.calendarItem.findFirst).mockResolvedValue(null);
    expect(await moveTaskToTodayAction("theirs", "2026-10-07")).toMatchObject({ ok: false });
    expect(prisma.calendarItem.update).not.toHaveBeenCalled();
  });
});

describe("setShowMealsAction", () => {
  it("saves the household's choice, creating the settings row first if needed", async () => {
    expect(await setShowMealsAction(true)).toEqual({ ok: true });
    expect(prisma.calendarSettings.upsert).toHaveBeenCalledWith({ where: { householdId: "h1" }, create: { householdId: "h1" }, update: {} });
    expect(prisma.calendarSettings.update).toHaveBeenCalledWith({ where: { householdId: "h1" }, data: { showMeals: true } });
  });

  it("rejects anything that isn't true or false", async () => {
    expect(await setShowMealsAction("yes" as any)).toEqual({ ok: false, error: "Invalid setting" });
    expect(prisma.calendarSettings.update).not.toHaveBeenCalled();
  });
});

describe("the week's first day is shared with the meal planner", () => {
  // One in-memory settings row, read and written by both modules through their own entry points.
  let row: { weekStartsOn: "SUNDAY" | "MONDAY"; showBreakfast: boolean; showLunch: boolean; showDinner: boolean };
  beforeEach(() => {
    row = { weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: true, showDinner: true };
    vi.mocked(prisma.mealPlanSettings.upsert).mockImplementation((async () => ({ householdId: "h1", ...row })) as any);
    vi.mocked(prisma.mealPlanSettings.update).mockImplementation((async ({ data }: any) => Object.assign(row, data)) as any);
  });

  it("writes the Meal Planning setting, so the planner reads the new value", async () => {
    expect(await setWeekStartAction("MONDAY")).toEqual({ ok: true });
    expect(prisma.mealPlanSettings.update).toHaveBeenCalledWith({ where: { householdId: "h1" }, data: { weekStartsOn: "MONDAY" } });
    expect((await getMealPlanSettings("h1")).weekStartsOn).toBe("MONDAY");
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(revalidatePath).toHaveBeenCalledWith("/meals");
  });

  it("changes in the planner are seen by the calendar", async () => {
    await updateMealPlanSettingsAction({ weekStartsOn: "MONDAY" });
    const { weekStartsOn } = await getMealPlanSettings("h1");
    // 4 Oct 2026 is a Sunday: the calendar's week containing it starts on Monday 28 Sep once the planner says Monday.
    expect(resolveCalendarRange({ today: "2026-10-04", weekStartsOn }).anchor).toBe("2026-09-28");
    await setWeekStartAction("SUNDAY");
    expect(resolveCalendarRange({ today: "2026-10-04", weekStartsOn: (await getMealPlanSettings("h1")).weekStartsOn }).anchor).toBe("2026-10-04");
  });

  it("leaves the planner's meal toggles alone", async () => {
    await setWeekStartAction("MONDAY");
    expect(row).toMatchObject({ showBreakfast: false, showLunch: true, showDinner: true });
  });

  it("rejects a value that isn't a week start", async () => {
    expect(await setWeekStartAction("FRIDAY" as any)).toEqual({ ok: false, error: "Invalid setting" });
    expect(row.weekStartsOn).toBe("SUNDAY");
  });
});
