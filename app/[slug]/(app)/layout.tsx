import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import AppNav from "@/components/AppNav";
import { logoutAction } from "../actions";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const household = await prisma.household.findUnique({
    where: { urlSlug: slug },
    select: {
      id: true,
      displayName: true,
      passwordHash: true,
      deletedAt: true,
    },
  });

  if (!household || !household.passwordHash || household.deletedAt) {
    notFound();
  }

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (session.householdId !== household.id) {
    redirect(`/${slug}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <AppNav
        slug={slug}
        householdName={household.displayName}
        logoutAction={logoutAction}
      />
      <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        {children}
      </div>
    </div>
  );
}
