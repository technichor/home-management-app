import { pageHouseholdId } from "@/lib/auth";
import { memberOptionsOf } from "@/lib/householdMembers";
import AccountForm from "../AccountForm";

export default async function NewAccountPage() {
  const householdId = await pageHouseholdId();
  return <AccountForm owners={await memberOptionsOf(householdId)} />;
}
