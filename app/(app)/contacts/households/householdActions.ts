"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { householdIsIn } from "@/lib/scope";
import { householdFormSchema, type HouseholdFormInput } from "@/lib/validations";

export type HouseholdResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function parseForm(input: HouseholdFormInput) {
  const parsed = householdFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false as const, error: Object.values(fieldErrors).join(", "), fieldErrors };
  }
  const f = parsed.data;
  return {
    ok: true as const,
    data: {
      displayName: f.displayName,
      mailingAddress: f.mailingAddress ?? null,
      tags: [...new Set(f.tags)],
      notes: f.notes ?? null,
    },
  };
}

function revalidateHouseholds(id?: string) {
  revalidatePath("/contacts/households");
  if (id) revalidatePath(`/contacts/households/${id}`);
}

/** Record a household (a family or group) in this household's directory. */
export async function createHouseholdAction(input: HouseholdFormInput): Promise<HouseholdResult> {
  const myHouseholdId = await requireHouseholdId();
  const parsed = parseForm(input);
  if (!parsed.ok) return parsed;

  const created = await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({ data: { ...parsed.data, ownerHouseholdId: myHouseholdId } });
    await tx.activityLogEntry.create({
      data: { entityType: "HOUSEHOLD", entityId: household.id, action: "CREATED", source: "MANUAL" },
    });
    return household;
  });
  revalidateHouseholds();
  return { ok: true, id: created.id };
}

/** Edit the data fields. (Account fields are never touched here.) */
export async function updateHouseholdAction(id: string, input: HouseholdFormInput): Promise<HouseholdResult> {
  const myHouseholdId = await requireHouseholdId();
  const existing = await prisma.household.findUnique({ where: { id } });
  if (!existing || !householdIsIn(existing, myHouseholdId)) return { ok: false, error: "Household not found." };
  if (existing.deletedAt) return { ok: false, error: "Restore this household before editing it." };

  const parsed = parseForm(input);
  if (!parsed.ok) return parsed;

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    const old = (existing as Record<string, unknown>)[key];
    if (JSON.stringify(old) !== JSON.stringify(value)) {
      before[key] = old;
      after[key] = value;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.household.update({ where: { id }, data: parsed.data });
    await tx.activityLogEntry.create({
      data: {
        entityType: "HOUSEHOLD",
        entityId: id,
        action: "UPDATED",
        source: "MANUAL",
        changedFields: { before, after } as unknown as Prisma.InputJsonValue,
      },
    });
  });
  revalidateHouseholds(id);
  return { ok: true, id };
}

/**
 * Soft delete: the household moves to Removed, where it can be restored. Its Family & Friend
 * contacts stay (and lose their inherited address until it is restored).
 */
export async function deleteHouseholdAction(id: string): Promise<HouseholdResult> {
  const myHouseholdId = await requireHouseholdId();
  const existing = await prisma.household.findUnique({ where: { id } });
  if (!existing || !householdIsIn(existing, myHouseholdId) || existing.deletedAt) {
    return { ok: false, error: "Household not found." };
  }
  if (existing.id === myHouseholdId) return { ok: false, error: "You can't remove your own household." };

  await prisma.$transaction(async (tx) => {
    await tx.household.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.activityLogEntry.create({
      data: { entityType: "HOUSEHOLD", entityId: id, action: "DELETED", source: "MANUAL" },
    });
  });
  revalidateHouseholds(id);
  revalidatePath("/contacts/removed");
  return { ok: true, id };
}
