"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { isDateString, stringToDate } from "@/lib/dates";
import { maintenanceItemSchema, type MaintenanceItemFields } from "@/lib/maintenance";

// Server actions are public endpoints: each one takes the household from the session and only ever touches that
// household's items. An id from the browser that isn't the household's is "not found".

async function loadItem(householdId: string, id: string) {
  const item = await prisma.maintenanceItem.findFirst({ where: { id, householdId } });
  if (!item) throw new UserError("That item isn't in your inventory any more");
  return item;
}

function parseFields(fields: MaintenanceItemFields) {
  const parsed = maintenanceItemSchema.safeParse(fields);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  return parsed.data;
}

const dataOf = (f: ReturnType<typeof parseFields>) => ({
  name: f.name,
  category: f.category,
  location: f.location,
  brand: f.brand,
  modelNumber: f.modelNumber,
  serialNumber: f.serialNumber,
  installedYear: f.installedYear,
  warrantyUntil: f.warrantyUntil ? stringToDate(f.warrantyUntil) : null,
  serviceEveryMonths: f.serviceEveryMonths,
  lastServicedOn: f.lastServicedOn ? stringToDate(f.lastServicedOn) : null,
  manualUrl: f.manualUrl,
  notes: f.notes,
});

// The to-do list and home page show the maintenance to-dos (lib/maintenanceTodos.ts), so they are refreshed too.
function refresh(id?: string) {
  revalidatePath("/maintenance");
  if (id) revalidatePath(`/maintenance/${id}`);
  revalidatePath("/todo");
  revalidatePath("/home");
}

export async function createMaintenanceItemAction(fields: MaintenanceItemFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const created = await prisma.maintenanceItem.create({ data: { householdId, ...dataOf(parseFields(fields)) } });
    refresh();
    return { id: created.id };
  });
}

export async function updateMaintenanceItemAction(id: string, fields: MaintenanceItemFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await loadItem(householdId, id);
    await prisma.maintenanceItem.update({ where: { id }, data: dataOf(parseFields(fields)) });
    refresh(id);
  });
}

/** Hard delete (no undo, no history). Its open to-do goes too; done ones stay on the to-do list's done items. */
export async function deleteMaintenanceItemAction(id: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await loadItem(householdId, id);
    await prisma.$transaction([
      prisma.listItem.deleteMany({ where: { maintenanceItemId: id, checked: false } }),
      prisma.maintenanceItem.delete({ where: { id } }),
    ]);
    refresh(id);
  });
}

/**
 * Record that the item was serviced on a date (the browser's today, or one chosen), which moves the next service on.
 * Its open to-do is checked off at the same time (keeping the previous date, so unchecking it there undoes this).
 */
export async function markServicedAction(id: string, date: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    if (!isDateString(date)) throw new UserError("Choose a valid date");
    const item = await loadItem(householdId, id);
    await prisma.$transaction([
      prisma.listItem.updateMany({
        where: { maintenanceItemId: id, checked: false },
        data: { checked: true, checkedAt: new Date(), previousServicedOn: item.lastServicedOn },
      }),
      prisma.maintenanceItem.update({ where: { id }, data: { lastServicedOn: stringToDate(date) } }),
    ]);
    refresh(id);
  });
}
