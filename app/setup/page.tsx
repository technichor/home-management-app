"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createHouseholdAction, SetupState } from "./actions";
import {
  Card,
  Input,
  Button,
  Space,
  Typography,
  Alert,
  Divider,
  Form,
} from "antd";

export default function SetupPage() {
  const [state, formAction, isPending] = useActionState<SetupState, FormData>(
    createHouseholdAction,
    null
  );
  const router = useRouter();

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
      <div style={{ width: "100%", maxWidth: 440 }}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              Set up your household account
            </Typography.Title>
            <Typography.Text type="secondary">
              This creates a login for your household. You can add contacts and other households
              via CSV import after setup.
            </Typography.Text>
          </div>

          <Card>
            {state?.error && (
              <Alert
                type="error"
                title={state.error}
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <form action={formAction}>
              <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
                <div>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    Household display name <span style={{ color: "#ff4d4f" }}>*</span>
                  </Typography.Text>
                  <Input
                    name="displayName"
                    type="text"
                    required
                    placeholder="e.g. The Reynolds Family"
                  />
                </div>

                <div>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    URL slug <span style={{ color: "#ff4d4f" }}>*</span>
                  </Typography.Text>
                  <Input
                    name="urlSlug"
                    type="text"
                    required
                    addonBefore="/"
                    pattern="[a-z0-9-]+"
                    placeholder="reynolds-family"
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                    Lowercase letters, numbers, and hyphens only.
                  </Typography.Text>
                </div>

                <div>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    Password <span style={{ color: "#ff4d4f" }}>*</span>
                  </Typography.Text>
                  <Input.Password name="password" required minLength={8} />
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                    Anyone with this password can read and write all household data.
                  </Typography.Text>
                </div>

                <Button
                  type="primary"
                  htmlType="submit"
                  loading={isPending}
                  block
                >
                  {isPending ? "Creating…" : "Create household account"}
                </Button>
              </Space>
            </form>
          </Card>

          <Card>
            <Typography.Text strong style={{ display: "block", marginBottom: 12 }}>
              Already have an account?
            </Typography.Text>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const slug = (
                  e.currentTarget.elements.namedItem("slug") as HTMLInputElement
                ).value.trim();
                if (slug) router.push(`/${slug}`);
              }}
              style={{ display: "flex", gap: 8 }}
            >
              <Input name="slug" addonBefore="/" placeholder="your-slug" style={{ flex: 1 }} />
              <Button htmlType="submit">Go to login</Button>
            </form>
          </Card>
        </Space>
      </div>
    </div>
  );
}
