import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import Link from "next/link";
import { Alert, Button, Card, Typography } from "antd";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
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
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

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
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Invite not found
        </Typography.Title>
        <Typography.Text>
          This link is not valid, or it was replaced by a newer one. Ask the person who sent it for a
          new link.
        </Typography.Text>
      </Shell>
    );
  }

  const inviter = sync.initiatingHousehold.displayName;

  if (!session.householdId) {
    return (
      <Shell>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          {inviter} invited you to sync
        </Typography.Title>
        <Typography.Paragraph>
          Log in to your household first, then open this link again to answer. If your household does
          not have an account yet, someone there needs to set one up.
        </Typography.Paragraph>
        <Link href="/">
          <Button type="primary">Go to log in</Button>
        </Link>
      </Shell>
    );
  }

  if (sync.initiatingHouseholdId === session.householdId) {
    return (
      <Shell>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          This is your own invite
        </Typography.Title>
        <Typography.Text>
          Send this link to the person you invited. They answer it from their own household.
        </Typography.Text>
      </Shell>
    );
  }

  if (sync.status !== "PENDING") {
    const answered =
      sync.status === "ACTIVE" && sync.counterpartHouseholdId === session.householdId
        ? `You are synced with ${inviter}.`
        : sync.status === "ACTIVE"
          ? "This invite was already accepted."
          : sync.status === "DECLINED"
            ? "This invite was declined."
            : "This invite was revoked.";
    return (
      <Shell>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          {inviter}
        </Typography.Title>
        <Alert type={sync.status === "ACTIVE" ? "success" : "info"} showIcon title={answered} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {inviter} wants to sync with your household
      </Typography.Title>
      <Typography.Paragraph>
        Syncing lets both households message each other in shared conversations. This invite was
        addressed to <strong>{sync.counterpartEmail}</strong>.
      </Typography.Paragraph>
      <InviteResponse token={token} />
    </Shell>
  );
}
