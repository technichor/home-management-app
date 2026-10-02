"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Space } from "antd";
import { resendVerificationAction, type ResendState } from "@/app/verify-email/actions";

export default function VerifyEmailPending({ logoutAction }: { logoutAction: () => Promise<void> }) {
  const [state, setState] = useState<ResendState>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Space orientation="vertical" style={{ width: "100%" }}>
      {state && "error" in state && <Alert type="error" showIcon title={state.error} />}
      {state && "sent" in state && <Alert type="success" showIcon title="Sent. Check your inbox." />}
      <Space>
        <Button loading={isPending} onClick={() => startTransition(async () => setState(await resendVerificationAction()))}>
          Send a new link
        </Button>
        <form action={logoutAction}>
          <Button type="link" htmlType="submit">
            Log out
          </Button>
        </form>
      </Space>
    </Space>
  );
}
