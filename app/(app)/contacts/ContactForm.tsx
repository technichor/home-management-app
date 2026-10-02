"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input, Popconfirm, Select, Space, Switch } from "antd";
import {
  createContactAction,
  deleteContactAction,
  updateContactAction,
  type ContactResult,
} from "./contactActions";
import type { ContactFormInput } from "@/lib/validations";

const CATEGORY_OPTIONS = [
  { value: "FAMILY_FRIEND", label: "Family & Friend" },
  { value: "SERVICE_PROVIDER", label: "Service Provider" },
  { value: "MEDICAL_SCHOOL", label: "Medical / School" },
  { value: "HOUSEHOLD_ADMIN", label: "Household Admin" },
];

interface Props {
  households: { id: string; displayName: string }[];
  // Present when editing; absent when adding.
  contact?: { id: string; values: ContactFormInput };
}

export default function ContactForm({ households, contact }: Props) {
  const router = useRouter();
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const category = Form.useWatch("category", form);
  const isFamilyFriend = category === "FAMILY_FRIEND";

  async function onFinish(values: ContactFormInput) {
    setSaving(true);
    setError(null);
    const result: ContactResult = contact
      ? await updateContactAction(contact.id, values)
      : await createContactAction(values);
    setSaving(false);
    if (result.ok) {
      router.push(`/contacts/${result.id}`);
      return;
    }
    setError(result.error);
    if (result.fieldErrors) {
      form.setFields(Object.entries(result.fieldErrors).map(([name, message]) => ({ name, errors: [message] })));
    }
  }

  async function onDelete() {
    const result = await deleteContactAction(contact!.id);
    if (result.ok) router.push("/contacts");
    else setError(result.error);
  }

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark="optional"
      onFinish={onFinish}
      initialValues={contact?.values ?? { category: "FAMILY_FRIEND", favorite: false, tags: [] }}
      style={{ maxWidth: 640 }}
    >
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Form.Item label="First name" name="firstName" rules={[{ required: true, message: "First name is required" }]} style={{ flex: 1, minWidth: 200 }}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label="Last name" name="lastName" rules={[{ required: true, message: "Last name is required" }]} style={{ flex: 1, minWidth: 200 }}>
          <Input autoComplete="off" />
        </Form.Item>
      </div>

      <Form.Item label="Nickname" name="nickname">
        <Input autoComplete="off" />
      </Form.Item>

      <Form.Item label="Category" name="category" rules={[{ required: true }]}>
        <Select options={CATEGORY_OPTIONS} />
      </Form.Item>

      <Form.Item
        label="Household"
        name="householdId"
        rules={isFamilyFriend ? [{ required: true, message: "Choose the household this person belongs to" }] : []}
        extra={isFamilyFriend ? "A Family & Friend contact uses their household's mailing address." : undefined}
      >
        <Select
          allowClear
          showSearch={{ optionFilterProp: "label" }}
          placeholder={isFamilyFriend ? "Choose a household" : "Optional"}
          options={households.map((h) => ({ value: h.id, label: h.displayName }))}
        />
      </Form.Item>

      {!isFamilyFriend && (
        <Form.Item label="Address" name="address">
          <Input.TextArea rows={2} />
        </Form.Item>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Form.Item label="Mobile phone" name="phoneMobile" style={{ flex: 1, minWidth: 180 }}>
          <Input type="tel" />
        </Form.Item>
        <Form.Item label="Home phone" name="phoneHome" style={{ flex: 1, minWidth: 180 }}>
          <Input type="tel" />
        </Form.Item>
        <Form.Item label="Work phone" name="phoneWork" style={{ flex: 1, minWidth: 180 }}>
          <Input type="tel" />
        </Form.Item>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Form.Item label="Primary email" name="emailPrimary" style={{ flex: 1, minWidth: 240 }}>
          <Input type="email" />
        </Form.Item>
        <Form.Item label="Secondary email" name="emailSecondary" style={{ flex: 1, minWidth: 240 }}>
          <Input type="email" />
        </Form.Item>
      </div>

      <Form.Item label="Tags" name="tags">
        <Select mode="tags" tokenSeparators={[","]} open={false} placeholder="Type a tag and press Enter" />
      </Form.Item>

      <Form.Item label="Favorite" name="favorite" valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label="Relationship notes" name="relationshipNotes" extra={'e.g. "Bailey\'s friend from soccer"'}>
        <Input autoComplete="off" />
      </Form.Item>

      <Form.Item label="Linked family member" name="linkedFamilyMember" extra="Which of your own household this contact is most associated with.">
        <Input autoComplete="off" />
      </Form.Item>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Form.Item label="Important date 1" name="importantDate1" style={{ flex: 1, minWidth: 180 }}>
          <Input type="date" />
        </Form.Item>
        <Form.Item label="Label" name="importantDate1Label" style={{ flex: 1, minWidth: 180 }}>
          <Input placeholder="e.g. Birthday" />
        </Form.Item>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Form.Item label="Important date 2" name="importantDate2" style={{ flex: 1, minWidth: 180 }}>
          <Input type="date" />
        </Form.Item>
        <Form.Item label="Label" name="importantDate2Label" style={{ flex: 1, minWidth: 180 }}>
          <Input placeholder="e.g. Anniversary" />
        </Form.Item>
      </div>

      <Form.Item label="Notes" name="notes">
        <Input.TextArea rows={4} />
      </Form.Item>

      <Space wrap>
        <Button type="primary" htmlType="submit" loading={saving}>
          {contact ? "Save changes" : "Add contact"}
        </Button>
        <Button onClick={() => router.push(contact ? `/contacts/${contact.id}` : "/contacts")}>Cancel</Button>
        {contact && (
          <Popconfirm
            title="Remove this contact?"
            description="It moves to Removed, where you can restore it."
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
