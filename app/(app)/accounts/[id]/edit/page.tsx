import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { assigneeOptionsOf } from "@/lib/calendarItem";
import { calendarName } from "@/lib/contactDates";
import AccountForm from "../../AccountForm";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const [record, owners] = await Promise.all([
    prisma.accountRecord.findFirst({ where: { id, householdId }, include: { owner: { select: { firstName: true, nickname: true } } } }),
    assigneeOptionsOf(householdId),
  ]);
  if (!record) notFound();
  return (
    <AccountForm
      owners={owners}
      record={{
        id: record.id,
        name: record.name,
        kind: record.kind,
        status: record.status,
        institution: record.institution,
        lastFour: record.lastFour,
        ownerContactId: record.ownerContactId,
        ownerName: record.owner ? calendarName(record.owner) : null,
        website: record.website,
        phone: record.phone,
        notes: record.notes,
      }}
    />
  );
}
