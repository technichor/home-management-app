"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { deleteMealKeepingEntries, mealKey } from "@/lib/meals";
import { mealSchema, planEntrySchema, planPositionSchema } from "@/lib/validations";
import { updatePlanSettings } from "@/lib/mealPlan";
import { stringToDate } from "@/lib/dates";
import type { MealSlot } from "@prisma/client";

// Server actions are public endpoints: each one takes the household from the session and only ever touches
// meals of that household. A meal id from the client that belongs to another household is "not found".

async function loadMeal(householdId: string, id: string) {
  const meal = await prisma.meal.findFirst({ where: { id, householdId } });
  if (!meal) throw new UserError("Meal not found");
  return meal;
}

function parseMeal(name: string, description: string | null | undefined) {
  const parsed = mealSchema.safeParse({ name, description });
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  return parsed.data;
}

/** Another meal in the household with this name, ignoring case and surrounding spaces. */
async function assertNameFree(householdId: string, name: string, exceptId?: string) {
  const existing = await prisma.meal.findUnique({ where: { householdId_nameKey: { householdId, nameKey: mealKey(name) } } });
  if (existing && existing.id !== exceptId) throw new UserError(`"${existing.name}" is already in your library`);
}

const isUniqueViolation = (e: unknown) => (e as { code?: string }).code === "P2002";

function refresh(id?: string) {
  revalidatePath("/meals/library");
  if (id) revalidatePath(`/meals/library/${id}`);
}

export async function createMealAction(name: string, description: string | null) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const data = parseMeal(name, description);
    await assertNameFree(householdId, data.name);
    try {
      const meal = await prisma.meal.create({
        data: { householdId, name: data.name, nameKey: mealKey(data.name), description: data.description },
      });
      refresh();
      return { id: meal.id };
    } catch (e) {
      // Two people adding the same name at the same moment.
      if (isUniqueViolation(e)) throw new UserError(`"${data.name}" is already in your library`);
      throw e;
    }
  });
}

export async function updateMealAction(id: string, name: string, description: string | null) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await loadMeal(householdId, id);
    const data = parseMeal(name, description);
    await assertNameFree(householdId, data.name, id);
    try {
      await prisma.meal.update({
        where: { id },
        data: { name: data.name, nameKey: mealKey(data.name), description: data.description },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserError(`"${data.name}" is already in your library`);
      throw e;
    }
    refresh(id);
    revalidatePath("/meals");
  });
}

/**
 * Hard-delete a meal. Planned entries that used it stay on the plan as one-off entries carrying the meal's name
 * (copied first, in the same transaction). Returns how many entries that was.
 */
export async function deleteMealAction(id: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const meal = await loadMeal(householdId, id);
    const converted = await prisma.$transaction((tx) => deleteMealKeepingEntries(tx, meal));
    refresh(id);
    revalidatePath("/meals");
    return { converted };
  });
}

// ---------- The plan ----------

async function loadEntry(householdId: string, id: string) {
  const entry = await prisma.mealPlanEntry.findFirst({ where: { id, householdId } });
  if (!entry) throw new UserError("That entry isn't on your plan any more");
  return entry;
}

function parseEntry(input: { date: string; slot: string; mealId?: string | null; text?: string | null }) {
  const parsed = planEntrySchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  return parsed.data;
}

const entryData = (householdId: string, e: { date: string; slot: MealSlot; mealId: string | null; text: string | null }) => ({
  householdId,
  date: stringToDate(e.date),
  slot: e.slot,
  mealId: e.mealId,
  text: e.text,
});

function refreshPlan() {
  revalidatePath("/meals");
}

/** Put a library meal on a date and slot. A slot can hold several entries. */
export async function addPlanEntryAction(date: string, slot: MealSlot, mealId: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const entry = parseEntry({ date, slot, mealId });
    await loadMeal(householdId, entry.mealId as string);
    const created = await prisma.mealPlanEntry.create({ data: entryData(householdId, entry) });
    refreshPlan();
    return { entryId: created.id };
  });
}

/** Put a one-off text ("leftovers") on a date and slot, without saving it to the library. */
export async function addOneOffEntryAction(date: string, slot: MealSlot, text: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const entry = parseEntry({ date, slot, text });
    const created = await prisma.mealPlanEntry.create({ data: entryData(householdId, entry) });
    refreshPlan();
    return { entryId: created.id };
  });
}

/**
 * Create a library meal and put it on the plan in one transaction. A name that already exists (ignoring case)
 * selects that meal instead of making a duplicate.
 */
export async function createMealAndAddAction(date: string, slot: MealSlot, name: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const position = planPositionSchema.safeParse({ date, slot });
    if (!position.success) throw new UserError(position.error.issues[0].message);
    const meal = parseMeal(name, null);
    const key = mealKey(meal.name);

    const run = () =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.meal.findUnique({ where: { householdId_nameKey: { householdId, nameKey: key } } });
        const target =
          existing ?? (await tx.meal.create({ data: { householdId, name: meal.name, nameKey: key, description: null } }));
        const entry = parseEntry({ date, slot, mealId: target.id });
        const created = await tx.mealPlanEntry.create({ data: entryData(householdId, entry) });
        return { entryId: created.id, mealId: target.id, created: !existing };
      });
    let result;
    try {
      result = await run();
    } catch (e) {
      // Someone added the same name a moment ago: now it exists, so this picks it.
      if (!isUniqueViolation(e)) throw e;
      result = await run();
    }
    refreshPlan();
    revalidatePath("/meals/library");
    return result;
  });
}

/** Change an entry's date and/or slot. */
export async function moveEntryAction(id: string, date: string, slot: MealSlot) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await loadEntry(householdId, id);
    const position = planPositionSchema.safeParse({ date, slot });
    if (!position.success) throw new UserError(position.error.issues[0].message);
    await prisma.mealPlanEntry.update({ where: { id }, data: { date: stringToDate(date), slot } });
    refreshPlan();
  });
}

/** Take an entry off the plan (hard delete). The meal itself stays in the library. */
export async function removeEntryAction(id: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await loadEntry(householdId, id);
    await prisma.mealPlanEntry.delete({ where: { id } });
    refreshPlan();
    revalidatePath("/meals/library");
  });
}

/** Household-wide planner settings. At least one slot must stay visible. */
export async function updateMealPlanSettingsAction(patch: {
  weekStartsOn?: "SUNDAY" | "MONDAY";
  showBreakfast?: boolean;
  showLunch?: boolean;
  showDinner?: boolean;
}) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const result = await updatePlanSettings(householdId, patch);
    if (!result.ok) throw new UserError(result.error);
    refreshPlan();
  });
}
