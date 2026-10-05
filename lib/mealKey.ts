/** The case-insensitive identity of a meal's name within a household. (Pure, so browser code can use it too.) */
export function mealKey(name: string): string {
  return name.trim().toLowerCase();
}
