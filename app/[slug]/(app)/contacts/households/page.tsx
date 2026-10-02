import { prisma } from "@/lib/db";
import { householdsOf } from "@/lib/scope";
import Link from "next/link";
import { Button, Card, Tag, Space, Empty } from "antd";
import { pageHouseholdId } from "@/lib/auth";

export default async function HouseholdsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const sessionHouseholdId = await pageHouseholdId();
  const myHouseholdId = sessionHouseholdId;

  const households = await prisma.household.findMany({
    where: { ...householdsOf(myHouseholdId), deletedAt: null },
    include: {
      contacts: {
        where: { deletedAt: null, category: "FAMILY_FRIEND" },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
    },
    orderBy: { displayName: "asc" },
  });

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="middle">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Households ({households.length})
        </h4>
        <Link href={`/${slug}/contacts/households/new`}>
          <Button type="primary">Add household</Button>
        </Link>
      </div>

      {households.length === 0 ? (
        <Empty description="No households yet. Add one with the button above, or use Import CSV." />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {households.map((h) => {
            const isOurs = h.id === myHouseholdId;
            return (
              <Link
                key={h.id}
                href={`/${slug}/contacts/households/${h.id}`}
                style={{ display: "block" }}
              >
                <Card
                  size="small"
                  hoverable
                  title={
                    <Space size="small">
                      <span>{h.displayName}</span>
                      {isOurs && (
                        <Tag color="blue" variant="filled" style={{ fontWeight: 400 }}>
                          Our household
                        </Tag>
                      )}
                    </Space>
                  }
                >
                  {h.mailingAddress && (
                    <span style={{ display: "block", fontSize: 13, color: "rgba(0,0,0,.45)" }}>
                      {h.mailingAddress}
                    </span>
                  )}
                  {h.contacts.length > 0 && (
                    <span style={{ display: "block", fontSize: 12, marginTop: 4, color: "rgba(0,0,0,.45)" }}>
                      {h.contacts.map((c) => `${c.firstName} ${c.lastName}`).join(", ")}
                    </span>
                  )}
                  {h.tags.length > 0 && (
                    <Space wrap size={4} style={{ marginTop: 8 }}>
                      {h.tags.map((tag) => (
                        <Tag key={tag} variant="filled" style={{ fontSize: 11 }}>
                          {tag}
                        </Tag>
                      ))}
                    </Space>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </Space>
  );
}
