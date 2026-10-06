import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { OWNER_NAME, toAccountView } from "@/lib/accounts";
import AccountsClient from "./AccountsClient";

export default async function AccountsPage() {
  const householdId = await pageHouseholdId();
  const records = await prisma.accountRecord.findMany({
    where: { householdId },
    include: OWNER_NAME,
    orderBy: { name: "asc" },
  });

  return (
    <AccountsClient
      accounts={records.map(toAccountView)}
    />
  );
}
