import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { pageTodayOrUtc } from "@/lib/today";
import { toMaintenanceView } from "@/lib/maintenance";
import LocalToday from "@/components/LocalToday";
import MaintenanceDetailClient from "./MaintenanceDetailClient";

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

  return (
    <>
      <LocalToday today={today} />
      <MaintenanceDetailClient today={today} item={toMaintenanceView(item)} />
    </>
  );
}
