import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { dateOr, dateToString, utcDateString } from "@/lib/dates";
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
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          location: i.location,
          brand: i.brand,
          modelNumber: i.modelNumber,
          installedYear: i.installedYear,
          serviceEveryMonths: i.serviceEveryMonths,
          lastServicedOn: i.lastServicedOn ? dateToString(i.lastServicedOn) : null,
        }))}
      />
    </>
  );
}
