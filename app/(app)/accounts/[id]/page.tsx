import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { OWNER_NAME, toAccountView } from "@/lib/accounts";
import AccountDetailClient from "./AccountDetailClient";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const record = await prisma.accountRecord.findFirst({ where: { id, householdId }, include: OWNER_NAME });
  if (!record) notFound();
  return <AccountDetailClient record={toAccountView(record)} />;
}
