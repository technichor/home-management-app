import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { toMaintenanceView } from "@/lib/maintenance";
import MaintenanceForm from "../../MaintenanceForm";

export default async function EditMaintenanceItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const item = await prisma.maintenanceItem.findFirst({ where: { id, householdId } });
  if (!item) notFound();
  return <MaintenanceForm item={toMaintenanceView(item)} />;
}
