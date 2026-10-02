"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Space } from "antd";
import { respondToInviteAction } from "./actions";

export default function InviteResponse({ token }: { token: string }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  async function respond(decision: "accept" | "decline") {
    setBusy(decision);
    try {
      const result = await respondToInviteAction(token, decision);
      if (!result.ok) message.error(result.error);
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Space>
      <Button type="primary" loading={busy === "accept"} disabled={busy !== null} onClick={() => respond("accept")}>
        Accept
      </Button>
      <Button loading={busy === "decline"} disabled={busy !== null} onClick={() => respond("decline")}>
        Decline
      </Button>
    </Space>
  );
}
