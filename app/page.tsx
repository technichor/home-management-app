import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, Button, Space } from "antd";

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
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 24, fontWeight: 600 }}>
              Home Management
            </h2>
            <span style={{ color: "rgba(0,0,0,.45)", fontSize: 14 }}>
              Visit your household&apos;s URL to log in, or set up a new household account below.
            </span>
          </div>

          <Card>
            <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
              <Link href="/setup" style={{ display: "block" }}>
                <Button type="primary" block>
                  Set up a new household account
                </Button>
              </Link>
              <span style={{ fontSize: 13, color: "rgba(0,0,0,.45)" }}>
                Already have an account? Go to{" "}
                <code>/your-household-slug</code>
              </span>
            </Space>
          </Card>
        </Space>
      </div>
    </div>
  );
}
