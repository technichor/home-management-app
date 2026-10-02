import Link from "next/link";
import { Card } from "antd";
import { findValidChangeToken } from "@/lib/emailChange";
import ConfirmEmailChangeForm from "@/components/ConfirmEmailChangeForm";

export default async function ChangeEmailTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await findValidChangeToken(token);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "#f5f5f5" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <Card>
          {valid ? (
            <>
              <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>Confirm your new email</h4>
              <p>
                From now on you&apos;ll log in with <strong>{valid.newEmail}</strong> instead of {valid.user.email}.
              </p>
              <ConfirmEmailChangeForm token={token} />
            </>
          ) : (
            <>
              <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>Link not valid</h4>
              <p>This link was already used or has expired. Request the change again from your account page.</p>
              <Link href="/login">Go to log in</Link>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
