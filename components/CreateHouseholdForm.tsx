"use client";

import { useActionState } from "react";
import { Input, Button, Space, Typography, Alert } from "antd";
import { createHouseholdForUserAction } from "@/app/onboarding/actions";
import type { AuthState } from "@/app/signup/actions";

export default function CreateHouseholdForm() {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(createHouseholdForUserAction, null);

  return (
    <form action={formAction}>
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        {state?.error && <Alert type="error" title={state.error} showIcon />}
        <div>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            Household name <span style={{ color: "#ff4d4f" }}>*</span>
          </Typography.Text>
          <Input name="displayName" required placeholder="e.g. The Reynolds Family" />
        </div>
        <div>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            Mailing address
          </Typography.Text>
          <Input.TextArea name="mailingAddress" rows={2} />
        </div>
        <Button type="primary" htmlType="submit" loading={isPending} block>
          Create household
        </Button>
      </Space>
    </form>
  );
}
