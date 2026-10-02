import { redirect } from "next/navigation";
import { Card, Button, Space } from "antd";
import { getSessionUser, homePathFor } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import CreateHouseholdForm from "@/components/CreateHouseholdForm";

// Where a signed-in user with no household lands: create one here, or be added to an existing one.
export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const home = homePathFor(user);
  if (home !== "/onboarding") redirect(home);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "#f5f5f5" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <Card>
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 20, fontWeight: 600 }}>
                Welcome, {user.firstName}
              </h3>
              <span style={{ color: "rgba(0,0,0,.45)", fontSize: 14 }}>
                You&apos;re signed in as {user.email}. Contacts, lists and messages become available once you
                create a household or are added to one.
              </span>
            </div>
            <div>
              <strong style={{ display: "block", marginBottom: 8 }}>Create a household</strong>
              <CreateHouseholdForm />
            </div>
            <div>
              <strong style={{ display: "block", marginBottom: 4 }}>Join an existing household</strong>
              <span style={{ color: "rgba(0,0,0,.45)", fontSize: 14 }}>
                Ask a member of that household to send you an invite link.
              </span>
            </div>
            <form action={logoutAction}>
              <Button htmlType="submit">Log out</Button>
            </form>
          </Space>
        </Card>
      </div>
    </div>
  );
}
