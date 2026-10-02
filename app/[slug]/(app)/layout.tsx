import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppNav from "@/components/AppNav";
import { logoutAction } from "@/app/login/actions";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  const household = user.household;
  if (!household || household.deletedAt) redirect("/onboarding");
  // The slug in the URL is only a label; the data shown always comes from the user's own household.
  if (household.urlSlug !== slug) redirect(`/${household.urlSlug}/contacts`);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <AppNav slug={slug} householdName={household.displayName} logoutAction={logoutAction} />
      <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        {children}
      </div>
    </div>
  );
}
