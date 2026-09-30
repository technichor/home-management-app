import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Breadcrumb } from "antd";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const list = await prisma.list.findUnique({ where: { id } });
  if (!list) notFound();

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link href={`/${slug}/lists`}>Lists</Link> },
          { title: list.name },
        ]}
      />
      <h3 style={{ marginTop: 0, fontSize: 20, fontWeight: 600 }}>{list.name}</h3>
      <p style={{ color: "rgba(0,0,0,.45)" }}>Items coming in the next build stage.</p>
    </div>
  );
}
