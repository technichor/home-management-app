import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import { loginAction } from "./actions";
import { Card, Input, Button, Space, Typography, Alert } from "antd";

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
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              {household.displayName}
            </Typography.Title>
            <Typography.Text type="secondary">
              Enter the household password to continue.
            </Typography.Text>
          </div>

          <Card>
            {error && (
              <Alert
                type="error"
                message={error}
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <form action={loginAction.bind(null, slug)}>
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    Password
                  </Typography.Text>
                  <Input.Password
                    name="password"
                    required
                    autoFocus
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
