"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { assertMemberChoice, memberOptionsOf } from "@/lib/householdMembers";
import { typeByKey, type DocumentScope } from "@/lib/documentCatalog";
import { documentSchema, type DocumentData, type DocumentFields } from "@/lib/documents";

// Server actions are public endpoints: each one takes the household from the session and only ever touches that
// household's records. Whose a document is, its item and its account must all be the household's own; an id from the
// browser that isn't is refused. Nothing is shared across households, synced or not (docs/domains/documents.md).

async function loadDocument(householdId: string, id: string) {
  const doc = await prisma.document.findFirst({ where: { id, householdId } });
  if (!doc) throw new UserError("That document isn't in your list any more");
  return doc;
}

function parseFields(fields: DocumentFields) {
  const parsed = documentSchema.safeParse(fields);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  return parsed.data;
}

/** Whose it is must be a current member (or the one it already had), and the item and account must be the household's. */
async function assertRelations(householdId: string, data: DocumentData, currentOwner: string | null = null) {
  await assertMemberChoice(householdId, data.ownerContactId, currentOwner);
  if (data.maintenanceItemId) {
    const item = await prisma.maintenanceItem.findFirst({ where: { id: data.maintenanceItemId, householdId }, select: { category: true } });
    if (!item) throw new UserError("That item isn't in your Maintenance list");
    if (typeByKey(data.typeKey)?.scope === "VEHICLE" && item.category !== "VEHICLE") throw new UserError("Choose one of your vehicles");
  }
  if (data.accountRecordId) {
    const account = await prisma.accountRecord.findFirst({ where: { id: data.accountRecordId, householdId }, select: { id: true } });
    if (!account) throw new UserError("That account isn't in your Accounts list");
  }
}

const dataOf = (d: DocumentData) => ({
  title: d.title,
  category: d.category,
  typeKey: d.typeKey,
  ownerContactId: d.ownerContactId,
  maintenanceItemId: d.maintenanceItemId,
  accountRecordId: d.accountRecordId,
  originalLocation: d.originalLocation,
  notes: d.notes,
});

const linksOf = (d: DocumentData) => d.links.map((l, position) => ({ url: l.url, label: l.label, position }));

function refresh(id?: string) {
  revalidatePath("/documents");
  if (id) revalidatePath(`/documents/${id}`);
}

export async function createDocumentAction(fields: DocumentFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const data = parseFields(fields);
    await assertRelations(householdId, data);
    const created = await prisma.document.create({ data: { householdId, ...dataOf(data), links: { create: linksOf(data) } } });
    refresh();
    return { id: created.id };
  });
}

export async function updateDocumentAction(id: string, fields: DocumentFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const doc = await loadDocument(householdId, id);
    const data = parseFields(fields);
    await assertRelations(householdId, data, doc.ownerContactId);
    // The links are replaced as a whole, in the same write.
    await prisma.document.update({ where: { id }, data: { ...dataOf(data), links: { deleteMany: {}, create: linksOf(data) } } });
    refresh(id);
  });
}

/** Hard delete (no undo, no history): the file itself lives elsewhere and isn't touched. */
export async function deleteDocumentAction(id: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await loadDocument(householdId, id);
    await prisma.document.delete({ where: { id } });
    refresh(id);
  });
}

// ---- "Doesn't apply" for a suggestion slot ----

/** Whether the slot's subject is the household itself, one of its current members or one of its vehicles, as the type needs. */
async function isOurSubject(householdId: string, scope: DocumentScope, subjectKey: string) {
  const [kind, id] = subjectKey.split(":");
  if (scope === "HOUSEHOLD") return subjectKey === "household";
  if (scope === "PERSON") return kind === "contact" && (await memberOptionsOf(householdId)).some((m) => m.id === id);
  if (kind !== "item") return false;
  return (await prisma.maintenanceItem.findFirst({ where: { id, householdId, category: "VEHICLE" }, select: { id: true } })) !== null;
}

/** That the slot is one of the household's: a suggested type, for the household, a current member or one of its vehicles. */
async function assertSlot(householdId: string, typeKey: string, subjectKey: string) {
  const type = typeByKey(typeKey);
  if (!type?.suggested) throw new UserError("That isn't one of the suggested documents");
  if (!(await isOurSubject(householdId, type.scope, subjectKey))) throw new UserError("That suggestion isn't one of yours");
}

export async function dismissSuggestionAction(typeKey: string, subjectKey: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await assertSlot(householdId, typeKey, subjectKey);
    await prisma.documentDismissal.upsert({
      where: { householdId_typeKey_subjectKey: { householdId, typeKey, subjectKey } },
      create: { householdId, typeKey, subjectKey },
      update: {},
    });
    refresh();
  });
}

export async function restoreSuggestionAction(typeKey: string, subjectKey: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await prisma.documentDismissal.deleteMany({ where: { householdId, typeKey, subjectKey } });
    refresh();
  });
}
