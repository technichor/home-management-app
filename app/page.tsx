import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, Button, Space, Typography } from "antd";

export default async function RootPage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (session.householdId && session.householdSlug) {
    redirect(`/${session.householdSlug}/contacts`);
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
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Typography.Title level={2} style={{ marginBottom: 8 }}>
              Home Management
            </Typography.Title>
            <Typography.Text type="secondary">
              Visit your household&apos;s URL to log in, or set up a new household account below.
            </Typography.Text>
          </div>

          <Card>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Link href="/setup" style={{ display: "block" }}>
                <Button type="primary" block>
                  Set up a new household account
                </Button>
              </Link>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Already have an account? Go to{" "}
                <Typography.Text code>/your-household-slug</Typography.Text>
              </Typography.Text>
            </Space>
          </Card>
        </Space>
      </div>
    </div>
  );
}
