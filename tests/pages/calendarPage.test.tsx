// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }) }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/agenda", () => ({ getAgenda: vi.fn() }));
vi.mock("@/lib/calendarItem", () => ({ getCalendarSettings: vi.fn() }));
vi.mock("@/lib/householdMembers", () => ({ memberOptionsOf: vi.fn() }));
vi.mock("@/lib/mealPlan", () => ({ getMealPlanSettings: vi.fn() }));
vi.mock("@/lib/google", () => ({ googleConfigured: vi.fn(() => false) }));
vi.mock("@/lib/googleEvents", () => ({ googleAgenda: vi.fn() }));
vi.mock("@/components/LocalToday", () => ({ default: () => <i data-testid="local-today" /> }));
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/calendar/CalendarClient", () => ({ default: (p: any) => ((seen.client = p), <div>calendar client</div>) }));

const clock = vi.hoisted(() => ({ today: null as string | null }));
vi.mock("@/lib/today", () => ({ pageToday: async () => clock.today }));
import { getAgenda } from "@/lib/agenda";
import { getCalendarSettings } from "@/lib/calendarItem";
import { memberOptionsOf } from "@/lib/householdMembers";
import { getMealPlanSettings } from "@/lib/mealPlan";
import { googleConfigured } from "@/lib/google";
import { googleAgenda } from "@/lib/googleEvents";
import CalendarPage from "@/app/(app)/calendar/page";

const settings = (over: object = {}) =>
  ({ householdId: "h1", showMeals: false, timeZone: "America/Chicago", googleCalendarId: null, googleCalendarName: null, googleCalendarUserId: null, updatedAt: new Date(), ...over }) as any;

const members = [{ id: "m1", name: "Sam", fullName: "Sam Doe" }, { id: "m2", name: "Ann", fullName: "Ann Doe" }];
const run = async ({ today = "2026-10-07", ...sp }: { today?: string | null; [param: string]: unknown } = {}) => {
  clock.today = today;
  return render(await CalendarPage({ searchParams: Promise.resolve(sp) }));
};
const agendaArgs = () => vi.mocked(getAgenda).mock.calls.at(-1)!;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(getMealPlanSettings).mockResolvedValue({ weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: true, showDinner: true, breakfastTime: null, lunchTime: null, dinnerTime: null });
  vi.mocked(getCalendarSettings).mockResolvedValue(settings());
  vi.mocked(memberOptionsOf).mockResolvedValue(members);
  vi.mocked(getAgenda).mockResolvedValue({ entries: [] });
});

describe("CalendarPage", () => {
  it("waits for the browser's date before showing anything, and reads nothing meanwhile", async () => {
    const { getByTestId } = await run({ today: null });
    expect(getByTestId("local-today")).toBeInTheDocument();
    expect(seen.client).toBeUndefined();
    expect(getAgenda).not.toHaveBeenCalled();
  });

  it("defaults to the week containing the browser's today", async () => {
    await run();
    expect(seen.client).toMatchObject({ view: "week", anchor: "2026-10-04", prev: "2026-09-27", next: "2026-10-11", today: "2026-10-07", weekStartsOn: "SUNDAY" });
    expect(seen.client.dates).toEqual(["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
    expect(agendaArgs().slice(0, 3)).toEqual(["h1", "2026-10-04", "2026-10-10"]);
  });

  it("honors the household's week start (the planner's setting)", async () => {
    vi.mocked(getMealPlanSettings).mockResolvedValue({ weekStartsOn: "MONDAY", showBreakfast: false, showLunch: true, showDinner: true, breakfastTime: null, lunchTime: null, dinnerTime: null });
    await run({ today: "2026-10-04" });
    expect(seen.client).toMatchObject({ anchor: "2026-09-28", weekStartsOn: "MONDAY" });
  });

  it("shows the day, week or month asked for, normalized to the range's start", async () => {
    await run({ view: "day", date: "2026-10-09" });
    expect(seen.client).toMatchObject({ view: "day", anchor: "2026-10-09" });
    expect(seen.client.dates).toEqual(["2026-10-09"]);
    await run({ view: "month", date: "2026-10-20" });
    expect(seen.client).toMatchObject({ view: "month", anchor: "2026-10-01", prev: "2026-09-01", next: "2026-11-01" });
    expect(agendaArgs().slice(1, 3)).toEqual(["2026-09-27", "2026-10-31"]);
    expect(seen.client.dates).toHaveLength(35);
    await run({ view: "week", date: "2026-10-20" });
    expect(seen.client.anchor).toBe("2026-10-18");
  });

  it("falls back to this week for an unknown view or a bad date", async () => {
    await run({ view: "year", date: "garbage" });
    expect(seen.client).toMatchObject({ view: "week", anchor: "2026-10-04" });
  });

  it("goes anywhere in time", async () => {
    await run({ view: "week", date: "1999-12-26" });
    expect(seen.client.dates[6]).toBe("2000-01-01");
    await run({ view: "month", date: "2099-02-10" });
    expect(seen.client.anchor).toBe("2099-02-01");
  });

  describe("the assignee filter", () => {
    it("filters to a current member", async () => {
      await run({ who: "m1" });
      expect(seen.client.assigneeFilter).toBe("m1");
      expect(agendaArgs()[3]).toMatchObject({ assigneeContactId: "m1" });
    });

    it("ignores anyone who isn't a current member (someone removed, or another household's contact)", async () => {
      await run({ who: "someone-else" });
      expect(seen.client.assigneeFilter).toBeNull();
      expect(agendaArgs()[3]).toMatchObject({ assigneeContactId: null });
    });

    it("shows everyone by default, and offers the members", async () => {
      await run();
      expect(seen.client.assigneeFilter).toBeNull();
      expect(seen.client.assignees).toEqual(members);
    });
  });

  describe("meals", () => {
    it("are left out by default", async () => {
      await run();
      expect(agendaArgs()[3]).toMatchObject({ includeMeals: false });
      expect(seen.client.showMeals).toBe(false);
    });

    it("are included on the week and day views when the household turned them on", async () => {
      vi.mocked(getCalendarSettings).mockResolvedValue(settings({ showMeals: true }));
      await run();
      expect(agendaArgs()[3]).toMatchObject({ includeMeals: true });
      await run({ view: "day" });
      expect(agendaArgs()[3]).toMatchObject({ includeMeals: true });
    });

    it("are never included on the month view, though the setting stays on", async () => {
      vi.mocked(getCalendarSettings).mockResolvedValue(settings({ showMeals: true }));
      await run({ view: "month" });
      expect(agendaArgs()[3]).toMatchObject({ includeMeals: false });
      expect(seen.client.showMeals).toBe(true);
    });
  });

  it("passes the agenda's entries through", async () => {
    const entries = [{ source: "item", id: "i1" }];
    vi.mocked(getAgenda).mockResolvedValue({ entries: entries as any });
    await run();
    expect(seen.client.entries).toEqual(entries);
  });

  describe("Google", () => {
    const g = (id: string, over: object = {}) => ({ source: "google", id, date: "2026-10-07", title: id, startTime: null, ownerContactId: "m1", ...over });

    it("reads nothing from Google and offers no Google calendar until Google is set up", async () => {
      vi.mocked(getCalendarSettings).mockResolvedValue(settings({ googleCalendarId: "cal", googleCalendarName: "Family" }));
      await run();
      expect(googleAgenda).not.toHaveBeenCalled();
      expect(seen.client).toMatchObject({ googleProblems: [], googleCalendarName: null });
    });

    describe("once set up", () => {
      beforeEach(() => {
        vi.mocked(googleConfigured).mockReturnValue(true);
        vi.mocked(googleAgenda).mockResolvedValue({ entries: [], problems: [] });
      });

      it("reads members' calendars for the range in the household's time zone", async () => {
        vi.mocked(getCalendarSettings).mockResolvedValue(settings({ timeZone: "Europe/Paris" }));
        await run();
        expect(googleAgenda).toHaveBeenCalledWith("h1", { start: "2026-10-04", end: "2026-10-10" }, "Europe/Paris");
      });

      it("merges Google's entries in order with Domata's, and passes on calendars that couldn't be read", async () => {
        vi.mocked(getAgenda).mockResolvedValue({ entries: [{ source: "item", id: "i1", date: "2026-10-07", startTime: null, createdAt: "" }] as any });
        vi.mocked(googleAgenda).mockResolvedValue({ entries: [g("g1", { date: "2026-10-05" })] as any, problems: ["Sam's Work"] });
        await run();
        expect(seen.client.entries.map((e: any) => e.id)).toEqual(["g1", "i1"]);
        expect(seen.client.googleProblems).toEqual(["Sam's Work"]);
      });

      it("shows only the member's own Google calendars in their view", async () => {
        vi.mocked(googleAgenda).mockResolvedValue({ entries: [g("mine"), g("theirs", { ownerContactId: "m2" })] as any, problems: [] });
        await run({ who: "m1" });
        expect(seen.client.entries.map((e: any) => e.id)).toEqual(["mine"]);
      });

      it("names the household's Google calendar, when there is one", async () => {
        await run();
        expect(seen.client.googleCalendarName).toBeNull();
        vi.mocked(getCalendarSettings).mockResolvedValue(settings({ googleCalendarId: "cal", googleCalendarName: "Family" }));
        await run();
        expect(seen.client.googleCalendarName).toBe("Family");
        vi.mocked(getCalendarSettings).mockResolvedValue(settings({ googleCalendarId: "cal" }));
        await run();
        expect(seen.client.googleCalendarName).toBe("Google Calendar");
      });
    });
  });
});
