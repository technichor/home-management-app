"use client";

import { useRouter } from "next/navigation";

import { Input, Select, Checkbox, Button, Space, Form } from "antd";

const CATEGORY_LABELS = {
  FAMILY_FRIEND: "Family & Friend",
  SERVICE_PROVIDER: "Service Provider",
  MEDICAL_SCHOOL: "Medical / School",
  HOUSEHOLD_ADMIN: "Household Admin",
};

interface ContactsFilterProps {
  allTags: string[];
  defaults: { q?: string; category?: string; tag?: string; favorites?: string };
}

export default function ContactsFilter({ allTags, defaults }: ContactsFilterProps) {
  const router = useRouter();
  const [form] = Form.useForm();

  const hasFilters = defaults.q || defaults.category || defaults.tag || defaults.favorites;

  function onFinish(values: Record<string, string | boolean>) {
    const params = new URLSearchParams();
    if (values.q) params.set("q", String(values.q));
    if (values.category) params.set("category", String(values.category));
    if (values.tag) params.set("tag", String(values.tag));
    if (values.favorites) params.set("favorites", "1");
    const qs = params.toString();
    router.push(`/contacts${qs ? `?${qs}` : ""}`);
  }

  function onClear() {
    // resetFields() would restore the filters currently in the URL, not blank fields.
    form.setFieldsValue({ q: "", category: undefined, tag: undefined, favorites: false });
    router.push("/contacts");
  }

  return (
    <Form
      form={form}
      layout="inline"
      initialValues={{
        q: defaults.q ?? "",
        category: defaults.category ?? undefined,
        tag: defaults.tag ?? undefined,
        favorites: defaults.favorites === "1",
      }}
      onFinish={onFinish}
      style={{ marginBottom: 16, gap: 8 }}
    >
      <Form.Item name="q" className="fill-on-mobile" style={{ marginBottom: 0 }}>
        <Input.Search
          placeholder="Search by name…"
          style={{ width: 200 }}
          allowClear
        />
      </Form.Item>
      <Form.Item name="category" className="fill-on-mobile" style={{ marginBottom: 0 }}>
        <Select placeholder="All categories" allowClear style={{ width: 170 }}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <Select.Option key={value} value={value}>
              {label}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
      {allTags.length > 0 && (
        <Form.Item name="tag" className="fill-on-mobile" style={{ marginBottom: 0 }}>
          <Select placeholder="All tags" allowClear style={{ width: 140 }}>
            {allTags.map((tag) => (
              <Select.Option key={tag} value={tag}>
                {tag}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      )}
      <Form.Item name="favorites" valuePropName="checked" style={{ marginBottom: 0 }}>
        <Checkbox>Favorites only</Checkbox>
      </Form.Item>
      <Form.Item style={{ marginBottom: 0 }}>
        <Space>
          <Button type="primary" htmlType="submit">
            Filter
          </Button>
          {hasFilters && (
            <Button onClick={onClear}>Clear</Button>
          )}
        </Space>
      </Form.Item>
    </Form>
  );
}
