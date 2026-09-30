import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import Nav from "@/components/Nav";
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
    <div className="flex min-h-screen flex-col">
      <Nav
        slug={slug}
        householdName={household.displayName}
        logoutAction={logoutAction}
      />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
