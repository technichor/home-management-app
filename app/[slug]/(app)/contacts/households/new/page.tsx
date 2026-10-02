import Link from "next/link";
import { Breadcrumb } from "antd";
import HouseholdForm from "../HouseholdForm";

export default async function NewHouseholdPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[{ title: <Link href={`/${slug}/contacts/households`}>Households</Link> }, { title: "Add household" }]}
      />
      <HouseholdForm slug={slug} />
    </div>
  );
}
