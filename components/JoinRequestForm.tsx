"use client";

import { useActionState } from "react";
import { Input, Button, Space, Alert } from "antd";
import { requestJoinAction } from "@/app/onboarding/actions";
import type { AuthState } from "@/app/signup/actions";

export default function JoinRequestForm() {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(requestJoinAction, null);
  return (
    <form action={formAction}>
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        {state?.error && <Alert type="error" title={state.error} showIcon />}
        <Space.Compact style={{ width: "100%" }}>
          <Input name="joinCode" required placeholder="Household code" autoComplete="off" />
          <Button htmlType="submit" loading={isPending}>
            Ask to join
          </Button>
        </Space.Compact>
      </Space>
    </form>
  );
}
