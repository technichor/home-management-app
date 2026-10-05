import { useMemo, useState } from "react";
import { dueForRepeat, eligibleMeals, familyStaples, pickSuggestions, type SuggestionMeal } from "@/lib/suggestions";

/** The two suggestion lists for the week being viewed, and a shuffle that redraws both. */
export function useSuggestions(meals: SuggestionMeal[], today: string, weekMealIds: ReadonlySet<string>) {
  const [seed, setSeed] = useState<number | null>(null);
  // The ids are compared as a sorted string so a new Set with the same contents doesn't recompute.
  const weekKey = [...weekMealIds].sort().join(",");

  return useMemo(() => {
    const eligible = eligibleMeals(meals, today, weekMealIds);
    return {
      due: pickSuggestions(dueForRepeat(eligible), seed),
      staples: pickSuggestions(familyStaples(eligible), seed === null ? null : seed + 1),
      shuffle: () => setSeed(Math.floor(Math.random() * 2 ** 31)),
    };
    // weekMealIds is represented by weekKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals, today, weekKey, seed]);
}
