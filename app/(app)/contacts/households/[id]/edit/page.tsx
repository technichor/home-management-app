import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "antd";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { householdIsIn } from "@/lib/scope";
import HouseholdForm from "../../HouseholdForm";

export default async function EditHouseholdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const myHouseholdId = await pageHouseholdId();

  const household = await prisma.household.findUnique({ where: { id } });
  if (!household || !householdIsIn(household, myHouseholdId) || household.deletedAt) notFound();

  const contactCount = await prisma.contact.count({
    where: { householdId: id, category: "FAMILY_FRIEND", deletedAt: null },
  });

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link href="/contacts/households">Households</Link> },
          { title: <Link href={`/contacts/households/${id}`}>{household.displayName}</Link> },
          { title: "Edit" },
        ]}
      />
      <HouseholdForm
        household={{
          id,
          isOurs: id === myHouseholdId,
          contactCount,
          values: {
            displayName: household.displayName,
            mailingAddress: household.mailingAddress ?? undefined,
            tags: household.tags,
            notes: household.notes ?? undefined,
          },
        }}
      />
    </div>
  );
}
