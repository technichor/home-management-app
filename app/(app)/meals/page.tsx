import { redirect } from "next/navigation";

// The planner will live here; until then the library is the meals home.
export default function MealsPage() {
  redirect("/meals/library");
}
