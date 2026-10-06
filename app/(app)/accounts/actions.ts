"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { assertMemberChoice } from "@/lib/householdMembers";
import { accountRecordSchema, type AccountRecordFields } from "@/lib/accounts";

// Server actions are public endpoints: each one takes the household from the session and only ever touches that
// household's records. An id from the browser that isn't the household's is "not found".

async function loadRecord(householdId: string, id: string) {
  const record = await prisma.accountRecord.findFirst({ where: { id, householdId } });
  if (!record) throw new UserError("That account isn't in your list any more");
  return record;
}

function parseFields(fields: AccountRecordFields) {
  const parsed = accountRecordSchema.safeParse(fields);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  return parsed.data;
}

const dataOf = (f: ReturnType<typeof parseFields>) => ({
  name: f.name,
  kind: f.kind,
  status: f.status,
  institution: f.institution,
  lastFour: f.lastFour,
  ownerContactId: f.ownerContactId,
  website: f.website,
  phone: f.phone,
  notes: f.notes,
});

function refresh(id?: string) {
  revalidatePath("/accounts");
  if (id) revalidatePath(`/accounts/${id}`);
}

export async function createAccountRecordAction(fields: AccountRecordFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const data = parseFields(fields);
    await assertMemberChoice(householdId, data.ownerContactId);
    const created = await prisma.accountRecord.create({ data: { householdId, ...dataOf(data) } });
    refresh();
    return { id: created.id };
  });
}

export async function updateAccountRecordAction(id: string, fields: AccountRecordFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const record = await loadRecord(householdId, id);
    const data = parseFields(fields);
    await assertMemberChoice(householdId, data.ownerContactId, record.ownerContactId);
    await prisma.accountRecord.update({ where: { id }, data: dataOf(data) });
    refresh(id);
  });
}

/** Hard delete (no undo, no history). Closing an account (status Closed) keeps it on record instead. */
export async function deleteAccountRecordAction(id: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await loadRecord(householdId, id);
    await prisma.accountRecord.delete({ where: { id } });
    refresh(id);
  });
}
