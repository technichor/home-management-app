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
  /** "+2 more" when there is more on the day than its title, else empty. (For the narrow strip under the drawing.) */
  more: string;
  support: string;
};

export type DrawingPoint = { x: number; y: number; r: number; label: string; isToday: boolean; load: number };
export type Drawing = { width: number; height: number; baseline: number; path: string; points: DrawingPoint[] };

export type Brief = {
  days: BriefDay[];
  total: number;
  headline: string;
  drawing: Drawing;
};

// The day names sit in a strip of their own under the drawing (see the home page), so the drawing has no labels.
export const DRAWING = { width: 840, height: 140, baseline: 124, amplitude: 92 } as const;

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
      more: meals.length + events.length > 1 ? `+${meals.length + events.length - 1} more` : "",
      support: main ? [...lines, ...eventLines].join(" ") : "Nothing planned.",
    };
  });

  const loads = days.map((d) => d.load);
  const todayIndex = days.findIndex((d) => d.isToday);
  return {
    days,
    total: loads.reduce((a, b) => a + b, 0),
    headline: headlineFor(firstName, loads, days),
    drawing: buildDrawing(loads, days.map((d) => d.weekday), todayIndex),
  };
}
