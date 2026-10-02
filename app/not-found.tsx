import Link from "next/link";
import { Button, Card } from "antd";

// The page for any address that doesn't exist (and for records that belong to someone else, which
// look exactly the same). Old bookmarks from before the URLs lost their household name land here.
export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "#f5f5f5" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <Card>
          <h2 style={{ marginTop: 0, fontSize: 20, fontWeight: 600 }}>This page could not be found.</h2>
          <p style={{ color: "rgba(0,0,0,.45)" }}>
            The link may be old or mistyped. Page addresses no longer include your household&apos;s name.
          </p>
          <Link href="/home">
            <Button type="primary">Go to your home page</Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
