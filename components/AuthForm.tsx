"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, Input, Button, Space, Typography, Alert } from "antd";
import type { AuthState } from "@/app/signup/actions";

const required = <span style={{ color: "#ff4d4f" }}>*</span>;

export default function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(action, null);
  const signup = mode === "signup";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "#f5f5f5",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              {signup ? "Create your account" : "Log in"}
            </Typography.Title>
            <Typography.Text type="secondary">
              {signup
                ? "Anyone can sign up. You'll create a household or join one after."
                : "Use your email address and password."}
            </Typography.Text>
          </div>

          <Card>
            {state?.error && <Alert type="error" title={state.error} showIcon style={{ marginBottom: 16 }} />}
            <form action={formAction}>
              <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
                {signup && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                        First name {required}
                      </Typography.Text>
                      <Input name="firstName" required autoComplete="given-name" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                        Last name {required}
                      </Typography.Text>
                      <Input name="lastName" required autoComplete="family-name" />
                    </div>
                  </div>
                )}
                <div>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    Email {required}
                  </Typography.Text>
                  <Input name="email" type="email" required autoComplete="email" autoFocus={!signup} />
                </div>
                <div>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    Password {required}
                  </Typography.Text>
                  <Input.Password
                    name="password"
                    required
                    minLength={signup ? 8 : undefined}
                    autoComplete={signup ? "new-password" : "current-password"}
                  />
                  {signup && (
                    <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                      At least 8 characters.
                    </Typography.Text>
                  )}
                </div>
                <Button type="primary" htmlType="submit" loading={isPending} block>
                  {signup ? "Create account" : "Log in"}
                </Button>
              </Space>
            </form>
          </Card>

          <Typography.Text type="secondary">
            {signup ? (
              <>
                Already have an account? <Link href="/login">Log in</Link>
              </>
            ) : (
              <>
                New here? <Link href="/signup">Create an account</Link>
              </>
            )}
          </Typography.Text>
        </Space>
      </div>
    </div>
  );
}
