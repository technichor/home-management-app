"use client";

import { useActionState } from "react";
import { Alert, Button, Card, Input, Space, Typography } from "antd";
import { changePasswordAction, type ChangePasswordState } from "@/app/(app)/account/actions";

export default function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState<ChangePasswordState, FormData>(changePasswordAction, null);
  return (
    <Card size="small" title="Change your password">
      <form action={formAction} key={state && "ok" in state ? "done" : "form"}>
        <Space orientation="vertical" size="small" style={{ width: "100%", maxWidth: 360 }}>
          {state && "error" in state && <Alert type="error" showIcon title={state.error} />}
          {state && "ok" in state && <Alert type="success" showIcon title="Password changed." />}
          <div>
            <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
              Current password
            </Typography.Text>
            <Input.Password name="currentPassword" required autoComplete="current-password" />
          </div>
          <div>
            <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
              New password
            </Typography.Text>
            <Input.Password name="newPassword" required minLength={8} autoComplete="new-password" />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              At least 8 characters.
            </Typography.Text>
          </div>
          <div>
            <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
              Confirm new password
            </Typography.Text>
            <Input.Password name="confirmPassword" required autoComplete="new-password" />
          </div>
          <Button type="primary" htmlType="submit" loading={isPending} style={{ alignSelf: "flex-start" }}>
            Change password
          </Button>
        </Space>
      </form>
    </Card>
  );
}
