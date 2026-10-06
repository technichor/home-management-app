import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { calendarName } from "@/lib/contactDates";
import AccountsClient from "./AccountsClient";

export default async function AccountsPage() {
  const householdId = await pageHouseholdId();
  const records = await prisma.accountRecord.findMany({
    where: { householdId },
    include: { owner: { select: { firstName: true, nickname: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <AccountsClient
      accounts={records.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        status: r.status,
        institution: r.institution,
        lastFour: r.lastFour,
        ownerName: r.owner ? calendarName(r.owner) : null,
      }))}
    />
  );
}
