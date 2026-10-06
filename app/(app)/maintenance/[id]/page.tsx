import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { dateOr, dateToString, utcDateString } from "@/lib/dates";
import LocalToday from "@/components/LocalToday";
import MaintenanceDetailClient from "./MaintenanceDetailClient";

export default async function MaintenanceItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ today?: string }>;
}) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const today = dateOr((await searchParams).today, utcDateString());
  const item = await prisma.maintenanceItem.findFirst({ where: { id, householdId } });
  if (!item) notFound();

  return (
    <>
      <LocalToday />
      <MaintenanceDetailClient
        today={today}
        item={{
          id: item.id,
          name: item.name,
          category: item.category,
          location: item.location,
          brand: item.brand,
          modelNumber: item.modelNumber,
          serialNumber: item.serialNumber,
          installedYear: item.installedYear,
          warrantyUntil: item.warrantyUntil ? dateToString(item.warrantyUntil) : null,
          serviceEveryMonths: item.serviceEveryMonths,
          lastServicedOn: item.lastServicedOn ? dateToString(item.lastServicedOn) : null,
          manualUrl: item.manualUrl,
          notes: item.notes,
        }}
      />
    </>
  );
}
