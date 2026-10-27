import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { pageTodayOrUtc } from "@/lib/today";
import { toMaintenanceView } from "@/lib/maintenance";
import LocalToday from "@/components/LocalToday";
import MaintenanceDetailClient from "./MaintenanceDetailClient";
import DocumentsPanel from "@/components/DocumentsPanel";
import { documentsPanel } from "@/lib/documentPanels";

export default async function MaintenanceItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const today = await pageTodayOrUtc();
  const item = await prisma.maintenanceItem.findFirst({ where: { id, householdId } });
  if (!item) notFound();
  const panel = await documentsPanel(householdId, { kind: "item", id: item.id, name: item.name, isVehicle: item.category === "VEHICLE" });

  return (
    <>
      <LocalToday today={today} />
      <MaintenanceDetailClient today={today} item={toMaintenanceView(item)} />
      <div style={{ marginTop: 24 }}>
        <DocumentsPanel panel={panel} />
      </div>
    </>
  );
}
