"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Card, Popconfirm, Select, Space, Typography } from "antd";
import type { HouseholdGoogleView } from "@/lib/googleCalendar";
import { setHouseholdGoogleCalendarAction, setHouseholdTimeZoneAction, stopHouseholdGoogleCalendarAction } from "@/app/(app)/household/googleActions";

const NEW = "new";

/**
 * The household's Google calendar (where Domata's events are created) and time zone, on the Household page. Owners
 * change them; everyone else sees them.
 */
export default function HouseholdGoogleCard({ view, isOwner, timeZones }: { view: HouseholdGoogleView; isOwner: boolean; timeZones: readonly string[] }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [choice, setChoice] = useState<string>(view.myWritable?.[0]?.id ?? NEW);
  const [busy, setBusy] = useState(false);

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
        <div>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            Time zone
          </Typography.Text>
          {isOwner ? (
            <Select
              showSearch
              value={view.timeZone}
              onChange={(tz) => run(() => setHouseholdTimeZoneAction(tz), "Time zone saved")}
              options={timeZones.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
              aria-label="Time zone"
              style={{ width: 280 }}
            />
          ) : (
            <Typography.Text>{view.timeZone.replace(/_/g, " ")}</Typography.Text>
          )}
        </div>

        {!view.configured ? (
          <Typography.Text type="secondary">Google Calendar isn&apos;t set up for Domata yet.</Typography.Text>
        ) : (
          <div>
            <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
              Household Google calendar
            </Typography.Text>
            {view.calendar ? (
              <Space orientation="vertical" style={{ width: "100%" }}>
                <Typography.Text>
                  Events made in Domata go to <strong>{view.calendar.name}</strong>
                  {view.calendar.ownerEmail && <> in {view.calendar.mine ? "your" : `${view.calendar.ownerEmail}'s`} Google account</>}, with the people they&apos;re for invited.
                </Typography.Text>
                {view.calendar.needsReconnect && (
                  <Alert
                    type="warning"
                    showIcon
                    title={`Domata can't add events right now: ${view.calendar.mine ? "connect Google again on your Account page" : "its owner needs to connect Google again"}.`}
                  />
                )}
              </Space>
            ) : (
              <Typography.Text type="secondary">Not chosen: events made in Domata stay in Domata.</Typography.Text>
            )}
            {isOwner && (
              <div style={{ marginTop: 10 }}>
                {view.myWritable === null ? (
                  <Typography.Text type="secondary">
                    To choose one, first <Link href="/account">connect your Google account</Link>.
                  </Typography.Text>
                ) : (
                  <Space wrap>
                    <Select
                      value={choice}
                      onChange={setChoice}
                      aria-label="Household Google calendar"
                      style={{ minWidth: 260 }}
                      options={[...view.myWritable.map((c) => ({ value: c.id, label: c.name })), { value: NEW, label: "Create a new calendar for the household" }]}
                    />
                    <Button loading={busy} onClick={() => run(() => setHouseholdGoogleCalendarAction(choice), "Household Google calendar saved")}>
                      Use this calendar
                    </Button>
                    {view.calendar && (
                      <Popconfirm title="Stop adding Domata's events to Google?" description="Events already in Google stay there." okText="Stop" onConfirm={() => run(stopHouseholdGoogleCalendarAction, "Stopped")}>
                        <Button>Stop using Google</Button>
                      </Popconfirm>
                    )}
                  </Space>
                )}
              </div>
            )}
          </div>
        )}
      </Space>
    </Card>
  );
}
