import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { pageTodayOrUtc } from "@/lib/today";
import { toMaintenanceView } from "@/lib/maintenance";
import LocalToday from "@/components/LocalToday";
import MaintenanceClient from "./MaintenanceClient";

export default async function MaintenancePage() {
  const householdId = await pageHouseholdId();
  const today = await pageTodayOrUtc();
  const items = await prisma.maintenanceItem.findMany({ where: { householdId }, orderBy: { name: "asc" } });

  return (
    <>
      <LocalToday today={today} />
      <MaintenanceClient
        today={today}
        items={items.map(toMaintenanceView)}
      />
    </>
  );
}
