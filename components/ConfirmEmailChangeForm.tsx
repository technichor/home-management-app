"use client";

import { useActionState } from "react";
import { Alert, Button } from "antd";
import { confirmEmailChangeAction } from "@/app/change-email/[token]/actions";
import type { AuthState } from "@/app/signup/actions";

export default function ConfirmEmailChangeForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(() => confirmEmailChangeAction(token), null);
  return (
    <form action={formAction}>
      {state?.error && <Alert type="error" showIcon title={state.error} style={{ marginBottom: 12 }} />}
      <Button type="primary" htmlType="submit" loading={isPending}>
        Confirm new email
      </Button>
    </form>
  );
}
