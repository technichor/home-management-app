import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import Link from "next/link";
import { Card, Tag, Space, Empty } from "antd";

export default async function HouseholdsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  const myHouseholdId = session.householdId;

  const households = await prisma.household.findMany({
    where: { deletedAt: null },
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
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
        Households ({households.length})
      </h4>

      {households.length === 0 ? (
        <Empty description="No households yet. Use Import CSV to add households." />
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
                        <Tag color="blue" bordered={false} style={{ fontWeight: 400 }}>
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
                        <Tag key={tag} bordered={false} style={{ fontSize: 11 }}>
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
