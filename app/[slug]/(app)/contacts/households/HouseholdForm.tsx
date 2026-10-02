"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input, Popconfirm, Select, Space } from "antd";
import {
  createHouseholdAction,
  deleteHouseholdAction,
  updateHouseholdAction,
  type HouseholdResult,
} from "./householdActions";
import type { HouseholdFormInput } from "@/lib/validations";

interface Props {
  slug: string;
  // Present when editing; absent when adding.
  household?: {
    id: string;
    values: HouseholdFormInput;
    isOurs: boolean;
    // Family & Friend contacts that would lose their inherited address if it were removed.
    contactCount: number;
  };
}

export default function HouseholdForm({ slug, household }: Props) {
  const router = useRouter();
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onFinish(values: HouseholdFormInput) {
    setSaving(true);
    setError(null);
    const result: HouseholdResult = household
      ? await updateHouseholdAction(slug, household.id, values)
      : await createHouseholdAction(slug, values);
    setSaving(false);
    if (result.ok) {
      router.push(`/${slug}/contacts/households/${result.id}`);
    } else {
      setError(result.error);
      if (result.fieldErrors) {
        form.setFields(Object.entries(result.fieldErrors).map(([name, message]) => ({ name, errors: [message] })));
      }
    }
  }

  async function onDelete() {
    const result = await deleteHouseholdAction(slug, household!.id);
    if (result.ok) router.push(`/${slug}/contacts/households`);
    else setError(result.error);
  }

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark="optional"
      onFinish={onFinish}
      initialValues={household?.values ?? { tags: [] }}
      style={{ maxWidth: 560 }}
    >
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

      <Form.Item label="Household name" name="displayName" rules={[{ required: true, message: "Household name is required" }]}>
        <Input placeholder="e.g. The Reynolds Family" autoComplete="off" />
      </Form.Item>

      <Form.Item
        label="Mailing address"
        name="mailingAddress"
        extra="Every Family & Friend contact in this household shows this address."
      >
        <Input.TextArea rows={3} />
      </Form.Item>

      <Form.Item label="Tags" name="tags">
        <Select mode="tags" tokenSeparators={[","]} open={false} placeholder="Type a tag and press Enter" />
      </Form.Item>

      <Form.Item label="Notes" name="notes">
        <Input.TextArea rows={4} />
      </Form.Item>

      <Space wrap>
        <Button type="primary" htmlType="submit" loading={saving}>
          {household ? "Save changes" : "Add household"}
        </Button>
        <Button
          onClick={() =>
            router.push(household ? `/${slug}/contacts/households/${household.id}` : `/${slug}/contacts/households`)
          }
        >
          Cancel
        </Button>
        {household && !household.isOurs && (
          <Popconfirm
            title="Remove this household?"
            description={
              household.contactCount > 0
                ? `${household.contactCount} Family & Friend contact${household.contactCount === 1 ? "" : "s"} will lose their inherited address until it is restored.`
                : "It moves to Removed, where you can restore it."
            }
            okText="Remove"
            onConfirm={onDelete}
          >
            <Button danger>Remove</Button>
          </Popconfirm>
        )}
      </Space>
    </Form>
  );
}
