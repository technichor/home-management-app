import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import { loginAction } from "./actions";
import { Card, Button, Space, Alert } from "antd";

export default async function HouseholdLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const household = await prisma.household.findUnique({
    where: { urlSlug: slug },
    select: { id: true, displayName: true, passwordHash: true, deletedAt: true },
  });

  if (!household || !household.passwordHash || household.deletedAt) {
    notFound();
  }

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (session.householdId === household.id) {
    redirect(`/${slug}/contacts`);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "#f5f5f5",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 20, fontWeight: 600 }}>
              {household.displayName}
            </h3>
            <span style={{ color: "rgba(0,0,0,.45)", fontSize: 14 }}>
              Enter the household password to continue.
            </span>
          </div>

          <Card>
            {error && (
              <Alert
                type="error"
                title={error}
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <form action={loginAction.bind(null, slug)}>
              <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
                <div>
                  <strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>
                    Password
                  </strong>
                  <input
                    type="password"
                    name="password"
                    required
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "4px 11px",
                      border: "1px solid #d9d9d9",
                      borderRadius: 6,
                      fontSize: 14,
                      height: 32,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
                <Button type="primary" htmlType="submit" block>
                  Log in
                </Button>
              </Space>
            </form>
          </Card>
        </Space>
      </div>
    </div>
  );
}
