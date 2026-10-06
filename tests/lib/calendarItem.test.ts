import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { contact: { findMany: vi.fn() }, calendarSettings: { upsert: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { MAX_NOTES, MAX_TITLE, TIME_PATTERN, calendarItemSchema, getCalendarSettings } from "@/lib/calendarItem";

beforeEach(() => vi.resetAllMocks());

const base = { title: "Dentist", date: "2026-10-08" };
const event = (over: object = {}) => calendarItemSchema.safeParse({ ...base, ...over });
const firstError = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) => r.error!.issues[0];

describe("the time format", () => {
  it.each(["00:00", "09:30", "12:00", "19:59", "23:59"])("accepts %s", (t) => expect(TIME_PATTERN.test(t)).toBe(true));
  it.each(["24:00", "9:30", "12:60", "12:5", "1230", "12:30:00", "noon", "", "7pm", "-1:00"])("rejects %s", (t) => expect(TIME_PATTERN.test(t)).toBe(false));
});

describe("common fields", () => {
  it("trims the title and requires one", () => {
    expect(event({ title: "  Dentist  " }).data?.title).toBe("Dentist");
    expect(firstError(event({ title: "   " }))).toMatchObject({ message: "Give it a title", path: ["title"] });
    expect(firstError(calendarItemSchema.safeParse({ date: "2026-10-08" }))).toMatchObject({ path: ["title"] });
  });

  it("limits the title to 200 characters", () => {
    expect(MAX_TITLE).toBe(200);
    expect(event({ title: "a".repeat(200) }).success).toBe(true);
    expect(firstError(event({ title: "a".repeat(201) })).message).toBe("Titles can be at most 200 characters");
  });

  it("keeps notes exactly as typed, with line breaks, and turns a blank note into none", () => {
    expect(event({ notes: "Bring the form\n  and the card\n" }).data?.notes).toBe("Bring the form\n  and the card\n");
    for (const blank of ["", "  \n ", null, undefined]) expect(event({ notes: blank }).data?.notes).toBeNull();
  });

  it("limits notes to 5,000 characters", () => {
    expect(MAX_NOTES).toBe(5000);
    expect(event({ notes: "a".repeat(5000) }).success).toBe(true);
    expect(firstError(event({ notes: "a".repeat(5001) })).message).toBe("Notes can be at most 5,000 characters");
  });

  it("needs a real calendar date", () => {
    expect(event().success).toBe(true);
    for (const bad of ["2026-02-30", "10/08/2026", "", "tomorrow", "2026-13-01"]) {
      expect(firstError(event({ date: bad }))).toMatchObject({ message: "Choose a valid date", path: ["date"] });
    }
  });

  it("treats a blank or missing assignee as the whole household", () => {
    for (const v of [undefined, null, ""]) expect(event({ assigneeContactId: v }).data?.assigneeContactId).toBeNull();
    expect(event({ assigneeContactId: "c1" }).data?.assigneeContactId).toBe("c1");
  });
});

describe("an event", () => {
  it("may have no time (a reminder), a start time, or a start and an end", () => {
    expect(event().data).toMatchObject({ startTime: null, endTime: null });
    expect(event({ startTime: "09:00" }).data).toMatchObject({ startTime: "09:00", endTime: null });
    expect(event({ startTime: "09:00", endTime: "10:15" }).data).toMatchObject({ startTime: "09:00", endTime: "10:15" });
  });

  it("treats blank times as none", () => {
    expect(event({ startTime: "", endTime: "  " }).data).toMatchObject({ startTime: null, endTime: null });
    expect(event({ startTime: null, endTime: null }).data).toMatchObject({ startTime: null, endTime: null });
  });

  it("only takes 24-hour HH:MM times", () => {
    for (const bad of ["9:00", "25:00", "09:60", "9am", "09:00:00"]) {
      expect(firstError(event({ startTime: bad }))).toMatchObject({ message: "Enter the time as HH:MM (24-hour)", path: ["startTime"] });
      expect(firstError(event({ startTime: "08:00", endTime: bad }))).toMatchObject({ message: "Enter the time as HH:MM (24-hour)", path: ["endTime"] });
    }
  });

  it("needs a start time before an end time", () => {
    expect(firstError(event({ endTime: "10:00" }))).toMatchObject({ message: "Add a start time before an end time", path: ["endTime"] });
  });

  it("needs the end to be after the start", () => {
    const message = "The end time must be after the start time";
    expect(firstError(event({ startTime: "10:00", endTime: "09:59" }))).toMatchObject({ message, path: ["endTime"] });
    expect(firstError(event({ startTime: "10:00", endTime: "10:00" })).message).toBe(message);
    expect(event({ startTime: "10:00", endTime: "10:01" }).success).toBe(true);
    expect(event({ startTime: "00:00", endTime: "23:59" }).success).toBe(true);
  });
});


describe("getCalendarSettings", () => {
  it("creates the household's row with defaults on first read (meals hidden)", async () => {
    vi.mocked(prisma.calendarSettings.upsert).mockResolvedValue({ householdId: "h1", showMeals: false } as any);
    expect(await getCalendarSettings("h1")).toEqual({ showMeals: false });
    expect(prisma.calendarSettings.upsert).toHaveBeenCalledWith({ where: { householdId: "h1" }, create: { householdId: "h1" }, update: {} });
  });

  it("survives two first reads at once (the loser of the create race reads the row instead)", async () => {
    vi.mocked(prisma.calendarSettings.upsert).mockRejectedValueOnce({ code: "P2002" }).mockResolvedValueOnce({ householdId: "h1", showMeals: false } as any);
    expect(await getCalendarSettings("h1")).toEqual({ showMeals: false });
    expect(prisma.calendarSettings.upsert).toHaveBeenCalledTimes(2);
  });

  it("returns what is saved", async () => {
    vi.mocked(prisma.calendarSettings.upsert).mockResolvedValue({ householdId: "h1", showMeals: true } as any);
    expect(await getCalendarSettings("h1")).toEqual({ showMeals: true });
  });
});
