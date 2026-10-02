"use client";

import { useActionState } from "react";
import { Alert, Button, Card, Input, Space, Typography } from "antd";
import { resetPasswordAction } from "@/app/reset-password/[token]/actions";
import type { AuthState } from "@/app/signup/actions";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    (prev, formData) => resetPasswordAction(token, prev, formData),
    null
  );
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "#f5f5f5" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Choose a new password
          </Typography.Title>
          <Card>
            <form action={formAction}>
              <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
                {state?.error && <Alert type="error" showIcon title={state.error} />}
                <div>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    New password
                  </Typography.Text>
                  <Input.Password name="newPassword" required minLength={8} autoComplete="new-password" autoFocus />
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
                <Button type="primary" htmlType="submit" loading={isPending} block>
                  Change password
                </Button>
              </Space>
            </form>
          </Card>
        </Space>
      </div>
    </div>
  );
}
