"use client";

import { useState } from "react";
import { Alert, App, Button, Card, Input, Popconfirm, Space, Typography } from "antd";
import { createResetLinkAction, emailResetLinkAction, setSuperuserAction } from "@/app/admin/actions";

export default function AdminUserActions({
  userId,
  email,
  isSelf,
  isSuperuser,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
  isSuperuser: boolean;
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [superError, setSuperError] = useState<string | null>(null);

  async function emailLink() {
    setBusy(true);
    try {
      const result = await emailResetLinkAction(userId);
      if (result.ok) message.success(`Reset link emailed to ${email}`);
      else message.error(result.error);
    } finally {
      setBusy(false);
    }
  }

  async function createLink() {
    setBusy(true);
    try {
      const result = await createResetLinkAction(userId);
      if (result.ok) setLink(`${window.location.origin}${result.path}`);
      else message.error(result.error);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link as string);
      message.success("Link copied");
    } catch {
      message.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  async function setSuperuser(make: boolean) {
    setBusy(true);
    setSuperError(null);
    try {
      const result = await setSuperuserAction(userId, make, password);
      if (result.ok) {
        setPassword("");
        message.success(make ? "Superuser access granted" : "Superuser access revoked");
        window.location.reload();
      } else {
        setSuperError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small" title="Reset their password">
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            You never see or choose their password. They open a one-time link and choose their own; that also signs out
            every device they are logged in on.
          </Typography.Text>
          <Space wrap>
            <Button onClick={emailLink} loading={busy}>
              Email them a reset link
            </Button>
            <Button onClick={createLink} disabled={busy}>
              Create a link to copy
            </Button>
          </Space>
          {link && (
            <Alert
              type="info"
              showIcon
              title="Send them this link"
              description={
                <Space orientation="vertical" style={{ width: "100%" }}>
                  <Typography.Text type="secondary">
                    It is shown only once, works once, and expires in 24 hours. Making another link replaces this one.
                  </Typography.Text>
                  <Space.Compact style={{ width: "100%" }}>
                    <Input readOnly value={link} aria-label="Reset link" onFocus={(e) => e.target.select()} />
                    <Button onClick={copy}>Copy</Button>
                  </Space.Compact>
                </Space>
              }
            />
          )}
        </Space>
      </Card>

      <Card size="small" title="Superuser access" style={{ borderColor: "#ffccc7" }}>
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            Superusers can see every account and start password resets. This should be very rare. Enter your own password to
            {isSuperuser ? " revoke" : " grant"} it{isSelf ? " (you are changing your own access)" : ""}.
          </Typography.Text>
          {superError && <Alert type="error" showIcon title={superError} />}
          <Input.Password
            aria-label="Your password"
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <div>
            <Popconfirm
              title={isSuperuser ? `Revoke superuser access from ${email}?` : `Make ${email} a superuser?`}
              okText={isSuperuser ? "Revoke" : "Grant"}
              okButtonProps={{ danger: true }}
              onConfirm={() => setSuperuser(!isSuperuser)}
            >
              <Button danger disabled={busy || !password}>
                {isSuperuser ? "Revoke superuser access" : "Grant superuser access"}
              </Button>
            </Popconfirm>
          </div>
        </Space>
      </Card>
    </Space>
  );
}
