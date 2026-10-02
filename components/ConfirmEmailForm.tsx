"use client";

import { useActionState } from "react";
import { Alert, Button } from "antd";
import { verifyEmailAction } from "@/app/verify-email/[token]/actions";
import type { AuthState } from "@/app/signup/actions";

export default function ConfirmEmailForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    () => verifyEmailAction(token),
    null
  );
  return (
    <form action={formAction}>
      {state?.error && <Alert type="error" showIcon title={state.error} style={{ marginBottom: 12 }} />}
      <Button type="primary" htmlType="submit" loading={isPending}>
        Confirm email
      </Button>
    </form>
  );
}
