import { pageHouseholdId } from "@/lib/auth";
import { assigneeOptionsOf } from "@/lib/calendarItem";
import AccountForm from "../AccountForm";

export default async function NewAccountPage() {
  const householdId = await pageHouseholdId();
  return <AccountForm owners={await assigneeOptionsOf(householdId)} />;
}
