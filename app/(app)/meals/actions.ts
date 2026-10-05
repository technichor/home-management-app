"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { deleteMealKeepingEntries, mealKey } from "@/lib/meals";
import { mealSchema } from "@/lib/validations";

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
