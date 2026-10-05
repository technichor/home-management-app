import { addDays } from "@/lib/dates";

export type SuggestionMeal = { id: string; name: string; lastMade: string | null; timesMade: number };

/** A meal made on or after this many days ago is left out of suggestions (it was just on the table). */
export const RECENT_DAYS = 14;
/** How many suggestions each list shows. */
export const SHOWN = 4;
/** Shuffle draws from this many of the best candidates, so it varies without suggesting poor ones. */
export const POOL_SIZE = 12;

/**
 * Meals worth suggesting: not already planned in the week being viewed, and not made in the last 14 days. A meal
 * counts as made only up to `today` (the browser's date), never for a future plan.
 */
export function eligibleMeals(meals: SuggestionMeal[], today: string, weekMealIds: ReadonlySet<string>): SuggestionMeal[] {
  const cutoff = addDays(today, -RECENT_DAYS);
  return meals.filter((m) => !weekMealIds.has(m.id) && !(m.lastMade !== null && m.lastMade >= cutoff));
}

const byName = (a: SuggestionMeal, b: SuggestionMeal) => a.name.localeCompare(b.name);

/** Not made for the longest: meals never made first, then the oldest "last made". Best candidates first. */
export function dueForRepeat(eligible: SuggestionMeal[]): SuggestionMeal[] {
  return [...eligible].sort((a, b) => {
    if (a.lastMade === null || b.lastMade === null) return Number(b.lastMade === null) - Number(a.lastMade === null) || byName(a, b);
    return a.lastMade.localeCompare(b.lastMade) || byName(a, b);
  });
}

/** The family's staples: most made overall (meals never made aren't staples). Best candidates first. */
export function familyStaples(eligible: SuggestionMeal[]): SuggestionMeal[] {
  return eligible.filter((m) => m.timesMade > 0).sort((a, b) => b.timesMade - a.timesMade || byName(a, b));
}

/** A small seeded random number generator, so a shuffle can be repeated in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * What to show: with no seed, the best `SHOWN`. With a seed (the user pressed shuffle), `SHOWN` drawn at random
 * from the best `POOL_SIZE`, in a random order.
 */
export function pickSuggestions(ranked: SuggestionMeal[], seed: number | null): SuggestionMeal[] {
  if (seed === null) return ranked.slice(0, SHOWN);
  const random = seededRandom(seed);
  const pool = ranked.slice(0, POOL_SIZE);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, SHOWN);
}
