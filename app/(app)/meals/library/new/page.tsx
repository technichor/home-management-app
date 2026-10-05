import { pageHouseholdId } from "@/lib/auth";
import MealForm from "../MealForm";

export default async function NewMealPage() {
  await pageHouseholdId();
  return <MealForm />;
}
