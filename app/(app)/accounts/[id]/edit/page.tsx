import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { memberOptionsOf } from "@/lib/householdMembers";
import { OWNER_NAME, toAccountView } from "@/lib/accounts";
import AccountForm from "../../AccountForm";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const [record, owners] = await Promise.all([
    prisma.accountRecord.findFirst({ where: { id, householdId }, include: OWNER_NAME }),
    memberOptionsOf(householdId),
  ]);
  if (!record) notFound();
  return <AccountForm owners={owners} record={toAccountView(record)} />;
}
