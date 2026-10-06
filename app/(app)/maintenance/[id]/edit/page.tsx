import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { dateToString } from "@/lib/dates";
import MaintenanceForm from "../../MaintenanceForm";

export default async function EditMaintenanceItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const item = await prisma.maintenanceItem.findFirst({ where: { id, householdId } });
  if (!item) notFound();
  return (
    <MaintenanceForm
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
  );
}
