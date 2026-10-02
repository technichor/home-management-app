import Link from "next/link";
import { Card } from "antd";
import { findValidVerificationToken } from "@/lib/emailVerification";
import ConfirmEmailForm from "@/components/ConfirmEmailForm";

export default async function VerifyEmailTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await findValidVerificationToken(token);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "#f5f5f5" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <Card>
          {valid ? (
            <>
              <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>Confirm your email</h4>
              <p>Confirm that this address is yours to finish setting up your account.</p>
              <ConfirmEmailForm token={token} />
            </>
          ) : (
            <>
              <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>Link not valid</h4>
              <p>This confirmation link was already used or has expired. Log in to request a new one.</p>
              <Link href="/login">Go to log in</Link>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
