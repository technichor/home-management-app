import Link from "next/link";
import { Breadcrumb } from "antd";
import HouseholdForm from "../HouseholdForm";

export default async function NewHouseholdPage() {
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[{ title: <Link href="/contacts/households">Households</Link> }, { title: "Add household" }]}
      />
      <HouseholdForm />
    </div>
  );
}
