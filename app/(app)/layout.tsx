import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { totalUnread } from "@/lib/messaging";
import AppNav from "@/components/AppNav";
import { logoutAction } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const household = user.household;
  if (!household || household.deletedAt) redirect("/onboarding");

  const unreadMessages = await totalUnread(user.id);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <AppNav householdName={household.displayName} isSuperuser={user.isSuperuser} unreadMessages={unreadMessages} logoutAction={logoutAction} />
      <div className="app-container">
        {children}
      </div>
    </div>
  );
}
