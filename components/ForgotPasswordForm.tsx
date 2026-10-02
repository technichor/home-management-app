"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Input, Space, Typography } from "antd";
import { requestPasswordResetAction, type ForgotState } from "@/app/forgot-password/actions";

export default function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState<ForgotState, FormData>(requestPasswordResetAction, null);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "#f5f5f5" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              Reset your password
            </Typography.Title>
            <Typography.Text type="secondary">Enter your email and we&apos;ll send you a link to choose a new password.</Typography.Text>
          </div>
          <Card>
            {state && "sent" in state ? (
              <Alert
                type="success"
                showIcon
                title="Check your email"
                description="If an account uses that address, a reset link is on its way. It works for one hour."
              />
            ) : (
              <form action={formAction}>
                <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
                  {state && "error" in state && <Alert type="error" showIcon title={state.error} />}
                  <div>
                    <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                      Email
                    </Typography.Text>
                    <Input name="email" type="email" required autoComplete="email" autoFocus />
                  </div>
                  <Button type="primary" htmlType="submit" loading={isPending} block>
                    Send reset link
                  </Button>
                </Space>
              </form>
            )}
          </Card>
          <Link href="/login">Back to log in</Link>
        </Space>
      </div>
    </div>
  );
}
