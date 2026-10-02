"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Card, Input, Select, Space, Typography } from "antd";
import { linkAccountContactAction, createAccountContactAction } from "./actions";

type Member = { id: string; name: string };

export default function AccountClient({
  slug,
  current,
  members,
}: {
  slug: string;
  current: Member | null;
  members: Member[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [choice, setChoice] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setChoice(null);
      setFirstName("");
      setLastName("");
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 560 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        Account
      </Typography.Title>

      {current ? (
        <Alert
          type="success"
          showIcon
          title={`This account acts as ${current.name}.`}
          description="Messages sent from this household show this person as the sender, and this person answers sync invites."
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          title="No contact is linked to this account yet."
          description="Choose or create the person this household login acts as. Everyone who uses the shared password will appear as them."
        />
      )}

      {members.length > 0 && (
        <Card size="small" title="Use an existing household member">
          <Space.Compact style={{ width: "100%" }}>
            <Select
              placeholder="Choose a contact"
              value={choice}
              onChange={setChoice}
              options={members.map((m) => ({ value: m.id, label: m.name }))}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              loading={busy}
              disabled={!choice || choice === current?.id}
              onClick={() => run(() => linkAccountContactAction(slug, choice as string))}
            >
              Use this contact
            </Button>
          </Space.Compact>
        </Card>
      )}

      <Card size="small" title="Or add a new household member">
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Space.Compact style={{ width: "100%" }}>
            <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Space.Compact>
          <Button
            type="primary"
            loading={busy}
            disabled={!firstName.trim() || !lastName.trim()}
            onClick={() => run(() => createAccountContactAction(slug, firstName, lastName))}
          >
            Create and use
          </Button>
        </Space>
      </Card>
    </Space>
  );
}
