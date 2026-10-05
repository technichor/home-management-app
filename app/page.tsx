import { getSessionUser, homePathFor } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, Button, Space } from "antd";
import { BRAND_NAME, TAGLINE } from "@/lib/brand";

export default async function RootPage() {
  const user = await getSessionUser();
  if (user) redirect(homePathFor(user));

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "var(--sidebar)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 24, fontWeight: 600 }}>
              {BRAND_NAME}
            </h2>
            <div style={{ fontSize: 16, marginBottom: 8 }}>{TAGLINE}</div>
            <span style={{ color: "var(--muted)", fontSize: 14 }}>
              Log in with your email address, or create an account.
            </span>
          </div>

          <Card>
            <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
              <Link href="/login" style={{ display: "block" }}>
                <Button type="primary" block>
                  Log in
                </Button>
              </Link>
              <Link href="/signup" style={{ display: "block" }}>
                <Button block>Create an account</Button>
              </Link>
            </Space>
          </Card>
        </Space>
      </div>
    </div>
  );
}
