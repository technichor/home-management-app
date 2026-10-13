import { prisma } from "@/lib/db";
import AccountClient from "./AccountClient";
import ChangeEmailForm from "@/components/ChangeEmailForm";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { pageMember } from "@/lib/auth";
import { googleAccountView } from "@/lib/googleCalendar";
import GoogleAccountCard from "@/components/GoogleAccountCard";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { id: userId, householdId, email } = await pageMember();

  const { google } = await searchParams;
  const [me, members, googleView] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { contact: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.contact.findMany({
      where: { householdId, deletedAt: null, category: "FAMILY_FRIEND" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    googleAccountView(userId),
  ]);

  const current = me?.contact;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <AccountClient
        current={current ? { id: current.id, name: `${current.firstName} ${current.lastName}` } : null}
        members={members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` }))}
      />
      <GoogleAccountCard view={googleView} outcome={google ?? null} />
      <ChangeEmailForm currentEmail={email} />
      <ChangePasswordForm />
    </div>
  );
}
