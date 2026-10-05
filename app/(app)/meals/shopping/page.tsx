import { pageHouseholdId } from "@/lib/auth";
import { loadShopping } from "@/lib/shopping";
import ShoppingList from "./ShoppingList";

export default async function ShoppingPage() {
  const householdId = await pageHouseholdId();
  const { items } = await loadShopping(householdId);
  return <ShoppingList items={items} variant="page" />;
}
