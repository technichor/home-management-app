import Link from "next/link";
import { Alert, Button, Card } from "antd";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { hashInviteToken } from "@/lib/syncToken";
import InviteResponse from "./InviteResponse";

function Shell({ children }: { children: React.ReactNode }) {
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
      <div style={{ width: "100%", maxWidth: 440 }}>
        <Card>{children}</Card>
      </div>
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getSessionUser();
  const household = user?.household && !user.household.deletedAt ? user.household : null;
  const householdId = household?.id;

  const sync = await prisma.sync.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    select: {
      status: true,
      counterpartEmail: true,
      initiatingHouseholdId: true,
      counterpartHouseholdId: true,
      initiatingHousehold: { select: { displayName: true } },
    },
  });

  if (!sync) {
    return (
      <Shell>
        <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>
          Invite not found
        </h4>
        <p>
          This link is not valid, or it was replaced by a newer one. Ask the person who sent it for a
          new link.
        </p>
      </Shell>
    );
  }

  const inviter = sync.initiatingHousehold.displayName;

  if (!householdId) {
    return (
      <Shell>
        <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>
          {inviter} invited you to sync
        </h4>
        <p>
          Log in and join or create a household first, then open this link again to answer.
        </p>
        <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
          <Button type="primary">Log in</Button>
        </Link>
      </Shell>
    );
  }

  if (sync.initiatingHouseholdId === householdId) {
    return (
      <Shell>
        <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>
          This is your own invite
        </h4>
        <p>
          Send this link to the person you invited. They answer it from their own household.
        </p>
      </Shell>
    );
  }

  if (sync.status !== "PENDING") {
    const syncedWithUs = sync.status === "ACTIVE" && sync.counterpartHouseholdId === householdId;
    const answered = syncedWithUs
      ? `You are synced with ${inviter}.`
      : sync.status === "ACTIVE"
          ? "This invite was already accepted."
          : sync.status === "DECLINED"
            ? "This invite was declined."
            : "This invite was revoked.";
    return (
      <Shell>
        <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>
          {inviter}
        </h4>
        <Alert type={sync.status === "ACTIVE" ? "success" : "info"} showIcon title={answered} />
        {syncedWithUs && (
          <Link href="/messages" style={{ display: "block", marginTop: 16 }}>
            <Button type="primary">Open messages</Button>
          </Link>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>
        {inviter} wants to sync with your household
      </h4>
      <p>
        Syncing lets both households message each other in shared conversations. This invite was
        addressed to <strong>{sync.counterpartEmail}</strong>.
      </p>
      <InviteResponse token={token} />
    </Shell>
  );
}
