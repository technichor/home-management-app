import { prisma } from "@/lib/db";
import { memberOptionsOf } from "@/lib/householdMembers";

/** What a document's form can point at: the household's members, its Maintenance items (which are vehicles) and accounts. */
export async function documentFormOptions(householdId: string) {
  const [members, items, accounts] = await Promise.all([
    memberOptionsOf(householdId),
    prisma.maintenanceItem.findMany({ where: { householdId }, select: { id: true, name: true, category: true }, orderBy: { name: "asc" } }),
    prisma.accountRecord.findMany({ where: { householdId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    members: members.map((m) => ({ id: m.id, name: m.name })),
    items: items.map((i) => ({ id: i.id, name: i.name, isVehicle: i.category === "VEHICLE" })),
    accounts,
  };
}

export type DocumentFormOptions = Awaited<ReturnType<typeof documentFormOptions>>;
