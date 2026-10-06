import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { dateOr, utcDateString } from "@/lib/dates";
import { toMaintenanceView } from "@/lib/maintenance";
import LocalToday from "@/components/LocalToday";
import MaintenanceClient from "./MaintenanceClient";

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const householdId = await pageHouseholdId();
  const today = dateOr((await searchParams).today, utcDateString());
  const items = await prisma.maintenanceItem.findMany({ where: { householdId }, orderBy: { name: "asc" } });

  return (
    <>
      <LocalToday />
      <MaintenanceClient
        today={today}
        items={items.map(toMaintenanceView)}
      />
    </>
  );
}
