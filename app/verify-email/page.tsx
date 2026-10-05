import { redirect } from "next/navigation";
import { Card } from "antd";
import { getSessionUser, homePathFor } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import VerifyEmailPending from "@/components/VerifyEmailPending";

// Where a signed-in user who hasn't confirmed their email waits.
export default async function VerifyEmailPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.emailVerifiedAt) redirect(homePathFor(user));

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "var(--sidebar)" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <Card>
          <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 20, fontWeight: 600 }}>Check your email</h3>
          <p style={{ color: "var(--muted)" }}>
            We sent a confirmation link to {user.email}. Open it to finish setting up your account. Until
            then you can&apos;t create or join a household.
          </p>
          <VerifyEmailPending logoutAction={logoutAction} />
        </Card>
      </div>
    </div>
  );
}
