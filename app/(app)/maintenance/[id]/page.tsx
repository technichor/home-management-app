import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { dateOr, utcDateString } from "@/lib/dates";
import { toMaintenanceView } from "@/lib/maintenance";
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
      <MaintenanceDetailClient today={today} item={toMaintenanceView(item)} />
    </>
  );
}
