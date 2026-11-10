import { pageHouseholdId } from "@/lib/auth";
import { planPositionSchema } from "@/lib/validations";
import MealForm from "../MealForm";

/**
 * Add a meal. From the planner (`?date=&slot=&name=`) the meal is also put on that date and slot, and saving or
 * cancelling goes back to the planner; a date or slot that isn't valid is ignored.
 */
export default async function NewMealPage({ searchParams }: { searchParams: Promise<{ date?: string; slot?: string; name?: string }> }) {
  await pageHouseholdId();
  const { date, slot, name } = await searchParams;
  const position = planPositionSchema.safeParse({ date, slot });
  return <MealForm addTo={position.success ? position.data : undefined} initialName={name} />;
}
