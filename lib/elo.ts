export const ELO_K = 32;
export const DEFAULT_RATING = 1500;

export type ComparisonOutcome = "A" | "B" | "EQUAL";

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Standard Elo update, applied symmetrically. "A" = A judged more important. */
export function updateRatings(
  ratingA: number,
  ratingB: number,
  outcome: ComparisonOutcome
): { a: number; b: number } {
  const scoreA = outcome === "A" ? 1 : outcome === "B" ? 0 : 0.5;
  const expectedA = expectedScore(ratingA, ratingB);
  return {
    a: ratingA + ELO_K * (scoreA - expectedA),
    b: ratingB + ELO_K * (1 - scoreA - (1 - expectedA)),
  };
}

export interface RankedItem {
  id: string;
  rating: number;
  comparisonCount: number;
}

/**
 * Choose the next pair to compare: an item from among the least-compared, paired
 * with the item closest to it in rating (close ratings are the most informative),
 * never repeating `lastPair`. Returns null if fewer than two items are available.
 * `rand` is injectable for testing.
 */
export function pickPair<T extends RankedItem>(
  items: T[],
  lastPair: [string, string] | null = null,
  rand: () => number = Math.random
): [T, T] | null {
  if (items.length < 2) return null;
  const isLast = (x: T, y: T) =>
    !!lastPair && ((x.id === lastPair[0] && y.id === lastPair[1]) || (x.id === lastPair[1] && y.id === lastPair[0]));

  const minCount = Math.min(...items.map((i) => i.comparisonCount));
  const leastCompared = items.filter((i) => i.comparisonCount === minCount);
  // Shuffle-by-random-start so ties don't always pick the first item.
  const start = Math.floor(rand() * leastCompared.length);
  const ordered = [...leastCompared.slice(start), ...leastCompared.slice(0, start)];

  for (const a of ordered) {
    const candidates = items
      .filter((b) => b.id !== a.id && !isLast(a, b))
      .sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating));
    if (candidates.length > 0) {
      // Among equally-close candidates prefer the less-compared one.
      const best = Math.abs(candidates[0].rating - a.rating);
      const tied = candidates.filter((c) => Math.abs(c.rating - a.rating) === best);
      tied.sort((x, y) => x.comparisonCount - y.comparisonCount);
      return [a, tied[0]];
    }
  }
  // Only the last pair is possible (exactly two items): allow the repeat.
  return [items[0], items[1]];
}
