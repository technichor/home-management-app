"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";

export async function createListAction(slug: string, name: string, tags: string[]) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.householdId) throw new Error("Not authenticated");

  const list = await prisma.list.create({
    data: { householdId: session.householdId, name, tags },
  });

  revalidatePath(`/${slug}/lists`);
  return { id: list.id };
}

export async function renameListAction(id: string, name: string, slug: string) {
  await prisma.list.update({ where: { id }, data: { name } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
  revalidatePath(`/${slug}/lists/${id}`);
}

export async function archiveListAction(id: string, slug: string) {
  await prisma.list.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
}

export async function unarchiveListAction(id: string, slug: string) {
  await prisma.list.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
}

export async function deleteListAction(id: string, slug: string) {
  await prisma.list.delete({ where: { id } });
  revalidatePath(`/${slug}/lists`);
  revalidatePath(`/${slug}/lists/archived`);
}
