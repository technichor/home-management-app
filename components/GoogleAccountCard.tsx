"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Card, Checkbox, Popconfirm, Space, Typography } from "antd";
import type { GoogleAccountView } from "@/lib/googleCalendar";
import { disconnectGoogleAction, setSharedCalendarsAction } from "@/app/(app)/account/googleActions";

const OUTCOMES: Record<string, { type: "success" | "info" | "error"; text: string }> = {
  connected: { type: "success", text: "Google is linked. Choose which of your calendars the household sees." },
  cancelled: { type: "info", text: "Linking Google was cancelled." },
  failed: { type: "error", text: "Google couldn't be linked. Try again." },
  unavailable: { type: "error", text: "Google isn't set up for Domata yet." },
};

/**
 * A member's own Google link, on the Account page: link or unlink their Google account, and choose which of their
 * calendars show (read-only) on the household's calendar. `outcome` is what the return from Google reported.
 */
export default function GoogleAccountCard({ view, outcome }: { view: GoogleAccountView; outcome: string | null }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [shared, setShared] = useState<string[]>(view.shared);
  const [busy, setBusy] = useState(false);
  const notice = outcome ? OUTCOMES[outcome] : undefined;
  const changed = shared.length !== view.shared.length || shared.some((id) => !view.shared.includes(id));

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) return message.error(result.error);
      message.success(done);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card size="small" title="Google Calendar">
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        {notice && <Alert type={notice.type} showIcon title={notice.text} />}
        {!view.configured ? (
          <Typography.Text type="secondary">Google Calendar isn&apos;t set up for Domata yet.</Typography.Text>
        ) : !view.connection ? (
          <>
            <Typography.Text type="secondary">
              Link your Google account to show your Google calendars on the household calendar, and to be invited to the events Domata makes for you.
            </Typography.Text>
            <div>
              {/* A full page load (not client navigation): the route answers with a redirect to Google. */}
              <Button type="primary" href="/api/google/connect">
                Connect Google Calendar
              </Button>
            </div>
          </>
        ) : (
          <>
            <Typography.Text>
              Linked to <strong>{view.connection.email}</strong>.
            </Typography.Text>
            {view.connection.needsReconnect || view.calendars === null ? (
              <Alert
                type="warning"
                showIcon
                title={view.connection.needsReconnect ? "Google no longer accepts this link." : "Your Google calendars couldn't be read just now."}
                action={
                  <Button size="small" href="/api/google/connect">
                    Connect again
                  </Button>
                }
              />
            ) : (
              <div>
                <Typography.Text strong style={{ display: "block", marginBottom: 6 }}>
                  Show on the household calendar
                </Typography.Text>
                <Checkbox.Group value={shared} onChange={(v) => setShared(v as string[])} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {view.calendars.map((c) => (
                    <Checkbox key={c.id} value={c.id}>
                      <span className="google-swatch" style={{ background: c.color ?? "var(--accent)" }} aria-hidden="true" />
                      {c.name}
                      {c.primary && <Typography.Text type="secondary"> (your main calendar)</Typography.Text>}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: "6px 0 0" }}>
                  Everyone in your household will see these events (read-only) on the Domata calendar.
                </Typography.Paragraph>
              </div>
            )}
            <Space wrap>
              {view.calendars !== null && (
                <Button type="primary" disabled={!changed} loading={busy} onClick={() => run(() => setSharedCalendarsAction(shared), "Saved")}>
                  Save
                </Button>
              )}
              <Popconfirm
                title="Unlink Google?"
                description="Your calendars stop showing in Domata. If the household's Google calendar is yours, Domata stops adding events to it."
                okText="Unlink"
                okButtonProps={{ danger: true }}
                onConfirm={() => run(disconnectGoogleAction, "Google unlinked")}
              >
                <Button danger>Unlink Google</Button>
              </Popconfirm>
            </Space>
          </>
        )}
      </Space>
    </Card>
  );
}
