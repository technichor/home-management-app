import type { MealSlot } from "@prisma/client";
import { dayOfWeek, weekDates } from "@/lib/dates";
import { SLOT_LABELS } from "@/lib/mealPlan";

/** What the home page's weekly brief says about a week, built from the household's real data. */

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type BriefEntry = { date: string; slot: MealSlot; label: string };
/** A birthday, anniversary or other important date of a contact that falls in the week. */
export type BriefDate = { date: string; name: string; label: string };

export type BriefDay = {
  date: string;
  weekday: string;
  weekdayLong: string;
  dayOfMonth: number;
  isToday: boolean;
  /** How much is on: planned meals plus important dates. */
  load: number;
  /** The day's main thing, or "Open". */
  title: string;
  support: string;
};

export type DrawingPoint = { x: number; y: number; r: number; label: string; isToday: boolean; load: number };
export type Drawing = { width: number; height: number; baseline: number; path: string; points: DrawingPoint[] };

export type Brief = {
  days: BriefDay[];
  total: number;
  headline: string;
  groups: { range: string; text: string }[];
  drawing: Drawing;
};

export const DRAWING = { width: 840, height: 170, baseline: 128, amplitude: 92 } as const;

const round = (n: number) => Math.round(n * 10) / 10;

/** "Monday", "Monday and Tuesday", "Monday, Tuesday and Friday". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * One unbroken line across the week: its height is that day's load, a dot sits on each day with something
 * on (sized by how much), and a week with nothing in it is a flat line. It never invents a peak.
 */
export function buildDrawing(loads: number[], labels: string[], todayIndex: number): Drawing {
  const { width, height, baseline, amplitude } = DRAWING;
  const max = Math.max(0, ...loads);
  const step = width / loads.length;
  const points: DrawingPoint[] = loads.map((load, i) => ({
    x: round(step * (i + 0.5)),
    y: round(baseline - (max > 0 ? (load / max) * amplitude : 0)),
    r: load > 0 ? round(4 + 4 * (load / max)) : 0,
    label: labels[i],
    isToday: i === todayIndex,
    load,
  }));

  // Level at each end, and flat tangents at every point: smooth, and never overshooting a day's height.
  const nodes = [{ x: 0, y: baseline }, ...points, { x: width, y: baseline }];
  let path = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    const mid = round((a.x + b.x) / 2);
    path += ` C ${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`;
  }
  return { width, height, baseline, path, points };
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

const possessive = (name: string) => `${name}'s`;

function headlineFor(firstName: string, loads: number[], days: BriefDay[]): string {
  const total = loads.reduce((a, b) => a + b, 0);
  if (total === 0) return `Nothing is planned this week yet, ${firstName}.`;
  const adjective = total <= 4 ? "A light week" : total >= 14 ? "A full week" : "A steady week";
  const max = Math.max(...loads);
  const busiest = days.filter((d) => d.load === max);
  if (busiest.length === days.length) return `${adjective}, ${firstName}, planned evenly across the days.`;
  if (busiest.length > 3) return `${adjective}, ${firstName}, with plans spread across the week.`;
  return `${adjective}, ${firstName}, with the most planned on ${joinList(busiest.map((d) => d.weekdayLong))}.`;
}

/** The week split into three stretches (first two days, middle three, last two), each with one observation. */
function groupSummaries(days: BriefDay[], entries: BriefEntry[], dates: BriefDate[], slots: MealSlot[]) {
  const spans = [days.slice(0, 2), days.slice(2, 5), days.slice(5)];
  return spans.map((span) => {
    const inSpan = new Set(span.map((d) => d.date));
    const meals = entries.filter((e) => inSpan.has(e.date)).length;
    const events = dates.filter((d) => inSpan.has(d.date));
    const range = span.length === 1 ? span[0].weekday : `${span[0].weekday} – ${span[span.length - 1].weekday}`;
    if (meals === 0 && events.length === 0) return { range, text: "Nothing planned." };

    const sentences: string[] = [];
    if (meals > 0) sentences.push(`${count(meals, "meal")} planned.`);
    if (slots.includes("DINNER")) {
      const withoutDinner = span.filter((d) => !entries.some((e) => e.date === d.date && e.slot === "DINNER"));
      if (meals > 0 && withoutDinner.length > 0) sentences.push(`Dinner is open on ${joinList(withoutDinner.map((d) => d.weekday))}.`);
    }
    for (const e of events.slice(0, 2)) {
      sentences.push(`${possessive(e.name)} ${e.label.toLowerCase()} is on ${days.find((d) => d.date === e.date)!.weekday}.`);
    }
    if (events.length > 2) sentences.push(`${count(events.length - 2, "more date")} ${events.length === 3 ? "follows" : "follow"}.`);
    return { range, text: sentences.join(" ") };
  });
}

export function buildBrief(input: {
  firstName: string;
  weekStart: string;
  today: string;
  slots: MealSlot[];
  entries: BriefEntry[];
  dates: BriefDate[];
}): Brief {
  const { firstName, weekStart, today, slots, entries, dates } = input;

  const days: BriefDay[] = weekDates(weekStart).map((date) => {
    const meals = entries.filter((e) => e.date === date);
    const events = dates.filter((d) => d.date === date);
    const dinner = meals.find((e) => e.slot === "DINNER");
    const lines = slots.flatMap((slot) => {
      const here = meals.filter((e) => e.slot === slot).map((e) => e.label);
      return here.length ? [`${SLOT_LABELS[slot]}: ${here.join(", ")}.`] : [];
    });
    const eventLines = events.map((e) => `${possessive(e.name)} ${e.label.toLowerCase()}.`);
    const main = dinner?.label ?? meals[0]?.label ?? (events[0] ? `${possessive(events[0].name)} ${events[0].label.toLowerCase()}` : null);

    return {
      date,
      weekday: SHORT[dayOfWeek(date)],
      weekdayLong: LONG[dayOfWeek(date)],
      dayOfMonth: Number(date.slice(8)),
      isToday: date === today,
      load: meals.length + events.length,
      title: main ?? "Open",
      support: main ? [...lines, ...eventLines].join(" ") : "Nothing planned.",
    };
  });

  const loads = days.map((d) => d.load);
  const todayIndex = days.findIndex((d) => d.isToday);
  return {
    days,
    total: loads.reduce((a, b) => a + b, 0),
    headline: headlineFor(firstName, loads, days),
    groups: groupSummaries(days, entries, dates, slots),
    drawing: buildDrawing(loads, days.map((d) => d.weekday), todayIndex),
  };
}
