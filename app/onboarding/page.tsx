import { redirect } from "next/navigation";
import { Card, Button, Space } from "antd";
import { getSessionUser, homePathFor } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { prisma } from "@/lib/db";
import { cancelJoinRequestAction } from "./actions";
import CreateHouseholdForm from "@/components/CreateHouseholdForm";
import JoinRequestForm from "@/components/JoinRequestForm";

// Where a signed-in user with no household lands: create one here, or be added to an existing one.
export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const home = homePathFor(user);
  if (home !== "/onboarding") redirect(home);

  const requests = await prisma.joinRequest.findMany({
    where: { userId: user.id, status: "PENDING" },
    select: { id: true, household: { select: { displayName: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "var(--sidebar)" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <Card>
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 20, fontWeight: 600 }}>
                Welcome, {user.firstName}
              </h3>
              <span style={{ color: "var(--muted)", fontSize: 14 }}>
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
              <span style={{ display: "block", color: "var(--muted)", fontSize: 14, marginBottom: 8 }}>
                Open an invite link a member sent you, or enter the household&apos;s code to ask to join.
              </span>
              <JoinRequestForm />
              {requests.map((r) => (
                <form key={r.id} action={cancelJoinRequestAction.bind(null, r.id)} style={{ marginTop: 8 }}>
                  <span style={{ marginRight: 8 }}>Waiting for approval from {r.household.displayName}</span>
                  <Button htmlType="submit" size="small">
                    Cancel request
                  </Button>
                </form>
              ))}
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
