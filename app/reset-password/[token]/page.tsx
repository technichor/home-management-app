import Link from "next/link";
import { Card } from "antd";
import { findValidResetToken } from "@/lib/passwordReset";
import ResetPasswordForm from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await findValidResetToken(token))) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "var(--sidebar)" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <Card>
            <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>Link not valid</h4>
            <p>This reset link is not valid or has expired.</p>
            <Link href="/forgot-password">Request a new link</Link>
          </Card>
        </div>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
