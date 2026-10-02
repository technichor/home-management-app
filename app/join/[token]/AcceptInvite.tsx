"use client";

import { useActionState } from "react";
import { Alert, Button } from "antd";
import { acceptHouseholdInviteAction } from "./actions";
import type { AuthState } from "@/app/signup/actions";

export default function AcceptInvite({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    () => acceptHouseholdInviteAction(token),
    null
  );
  return (
    <form action={formAction}>
      {state?.error && <Alert type="error" showIcon title={state.error} style={{ marginBottom: 12 }} />}
      <Button type="primary" htmlType="submit" loading={isPending}>
        Join this household
      </Button>
    </form>
  );
}
