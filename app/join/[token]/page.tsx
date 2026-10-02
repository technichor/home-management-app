import Link from "next/link";
import { Button, Card } from "antd";
import { prisma } from "@/lib/db";
import { getSessionUser, isUnverified } from "@/lib/auth";
import { hashInviteToken } from "@/lib/syncToken";
import AcceptInvite from "./AcceptInvite";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "#f5f5f5" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <Card>
          <h4 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>{title}</h4>
          {children}
        </Card>
      </div>
    </div>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.householdInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: { status: true, expiresAt: true, household: { select: { displayName: true, deletedAt: true } } },
  });

  if (!invite || invite.household.deletedAt) {
    return (
      <Shell title="Invite not found">
        <p>This link is not valid. Ask the person who sent it for a new one.</p>
      </Shell>
    );
  }
  if (invite.status !== "PENDING") {
    return (
      <Shell title={invite.household.displayName}>
        <p>This invite was already used or withdrawn. Ask for a new one.</p>
      </Shell>
    );
  }
  if (invite.expiresAt <= new Date()) {
    return (
      <Shell title={invite.household.displayName}>
        <p>This invite has expired. Ask for a new one.</p>
      </Shell>
    );
  }

  const user = await getSessionUser();
  if (!user) {
    const next = encodeURIComponent(`/join/${token}`);
    return (
      <Shell title={`Join ${invite.household.displayName}`}>
        <p>Log in, or create an account, to accept this invite.</p>
        <Link href={`/login?next=${next}`}>
          <Button type="primary">Log in</Button>
        </Link>{" "}
        <Link href={`/signup?next=${next}`}>
          <Button>Create an account</Button>
        </Link>
      </Shell>
    );
  }
  if (isUnverified(user)) {
    return (
      <Shell title={`Join ${invite.household.displayName}`}>
        <p>Confirm your email address first, then open this invite link again.</p>
        <Link href="/verify-email">
          <Button type="primary">Confirm your email</Button>
        </Link>
      </Shell>
    );
  }
  if (user.household && !user.household.deletedAt) {
    return (
      <Shell title={`Join ${invite.household.displayName}`}>
        <p>You already belong to a household, so you can&apos;t accept this invite.</p>
      </Shell>
    );
  }
  return (
    <Shell title={`Join ${invite.household.displayName}`}>
      <p>You&apos;re signed in as {user.email}.</p>
      <AcceptInvite token={token} />
    </Shell>
  );
}
