import { pageHouseholdId } from "@/lib/auth";
import MaintenanceForm from "../MaintenanceForm";

export default async function NewMaintenanceItemPage() {
  await pageHouseholdId();
  return <MaintenanceForm />;
}
