"use client";

import { useActionState } from "react";
import { Alert, Button, Card, Input, Space, Typography } from "antd";
import { requestEmailChangeAction, type ChangeEmailState } from "@/app/(app)/account/actions";

export default function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, isPending] = useActionState<ChangeEmailState, FormData>(requestEmailChangeAction, null);
  return (
    <Card size="small" title="Change your email">
      <form action={formAction} key={state && "sentTo" in state ? "sent" : "form"}>
        <Space orientation="vertical" size="small" style={{ width: "100%", maxWidth: 360 }}>
          <Typography.Text type="secondary">
            You log in with <strong>{currentEmail}</strong>. We&apos;ll email a link to the new address; the change happens when you
            open it.
          </Typography.Text>
          {state && "error" in state && <Alert type="error" showIcon title={state.error} />}
          {state && "sentTo" in state && (
            <Alert type="success" showIcon title={`Check ${state.sentTo}`} description="Open the link we sent there within an hour to finish. Until then you still log in with your current email." />
          )}
          <div>
            <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
              New email
            </Typography.Text>
            <Input name="newEmail" type="email" required autoComplete="email" />
          </div>
          <div>
            <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
              Your password
            </Typography.Text>
            <Input.Password name="password" required autoComplete="current-password" />
          </div>
          <Button type="primary" htmlType="submit" loading={isPending} style={{ alignSelf: "flex-start" }}>
            Send confirmation link
          </Button>
        </Space>
      </form>
    </Card>
  );
}
