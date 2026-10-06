import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { totalUnread } from "@/lib/messaging";
import AppNav from "@/components/AppNav";
import { logoutAction } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const household = user.household;
  if (!household || household.deletedAt) redirect("/onboarding");

  const unreadMessages = await totalUnread(user.id);

  return (
    <div className="app-shell">
      <AppNav householdName={household.displayName} isSuperuser={user.isSuperuser} unreadMessages={unreadMessages} logoutAction={logoutAction} />
      <main className="app-main">
        <div className="app-container">{children}</div>
      </main>
    </div>
  );
}
