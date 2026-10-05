"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, Input, Button, Space, Typography, Alert } from "antd";
import type { AuthState } from "@/app/signup/actions";
import { BRAND_NAME, TAGLINE } from "@/lib/brand";

const withNext = (path: string, next?: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);
const required = <span style={{ color: "#ff4d4f" }}>*</span>;

export default function AuthForm({
  mode,
  action,
  next,
  notice,
}: {
  mode: "login" | "signup";
  next?: string;
  notice?: string;
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
            <div style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 18 }}>{BRAND_NAME}</strong>
              <span style={{ marginLeft: 8, color: "rgba(0,0,0,.45)", fontSize: 13 }}>{TAGLINE}</span>
            </div>
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
            {notice && !state?.error && <Alert type="success" title={notice} showIcon style={{ marginBottom: 16 }} />}
            {state?.error && <Alert type="error" title={state.error} showIcon style={{ marginBottom: 16 }} />}
            <form action={formAction}>
              {next && <input type="hidden" name="next" value={next} />}
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
                  {signup ? (
                    <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                      At least 8 characters.
                    </Typography.Text>
                  ) : (
                    <Link href="/forgot-password" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                      Forgot your password?
                    </Link>
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
                Already have an account? <Link href={withNext("/login", next)}>Log in</Link>
              </>
            ) : (
              <>
                New here? <Link href={withNext("/signup", next)}>Create an account</Link>
              </>
            )}
          </Typography.Text>
        </Space>
      </div>
    </div>
  );
}
