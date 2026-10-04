import Link from "next/link";
import { Button } from "antd";
import { pageSuperuser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";

// Everything under /admin is for superusers only. Anyone else (signed in or not) gets the ordinary
// "page not found", so the area can't be found by trying the address.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await pageSuperuser();
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <div className="app-nav">
        <div className="app-nav-top">
          <span className="app-nav-title">Admin</span>
          <div className="app-nav-links">
            <Link href="/admin">Users</Link>
            <Link href="/admin/email">Email</Link>
            <Link href="/home">Back to the app</Link>
            <form action={logoutAction} style={{ display: "inline" }}>
              <Button type="link" htmlType="submit" size="small" style={{ padding: 0 }}>
                Log out
              </Button>
            </form>
          </div>
        </div>
      </div>
      <div className="app-container">{children}</div>
    </div>
  );
}
