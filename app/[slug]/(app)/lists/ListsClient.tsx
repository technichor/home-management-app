"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Tag, Space, Modal, Input, Dropdown, Empty, Checkbox, Select } from "antd";
import { MoreOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import {
  createListAction,
  renameListAction,
  archiveListAction,
  deleteListAction,
} from "./actions";

type ListData = {
  id: string;
  name: string;
  tags: string[];
  totalItems: number;
  checkedItems: number;
};

export default function ListsClient({
  lists,
  slug,
}: {
  lists: ListData[];
  slug: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTags, setCreateTags] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createImport, setCreateImport] = useState(false);

  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreateLoading(true);
    try {
      const tags = createTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { id } = await createListAction(slug, createName.trim(), tags);
      setCreateOpen(false);
      setCreateName("");
      setCreateTags("");
      router.push(`/${slug}/lists/${id}${createImport ? "?import=1" : ""}`);
      setCreateImport(false);
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleRename() {
    if (!renameTarget || !renameName.trim()) return;
    setRenameLoading(true);
    try {
      await renameListAction(renameTarget.id, renameName.trim(), slug);
      setRenameTarget(null);
      router.refresh();
    } finally {
      setRenameLoading(false);
    }
  }

  function openRename(list: ListData) {
    setRenameTarget({ id: list.id, name: list.name });
    setRenameName(list.name);
  }

  const allTags = [...new Set(lists.flatMap((l) => l.tags))].sort((a, b) => a.localeCompare(b));
  const needle = search.trim().toLowerCase();
  const visibleLists = lists.filter(
    (l) =>
      (!needle || l.name.toLowerCase().includes(needle)) &&
      (!tagFilter || l.tags.includes(tagFilter))
  );

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="middle">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Lists{lists.length > 0 ? ` (${lists.length})` : ""}
        </h4>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          New list
        </Button>
      </div>

      {lists.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input.Search
            allowClear
            placeholder="Search lists by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          {allTags.length > 0 && (
            <Select
              allowClear
              placeholder="Filter by tag"
              value={tagFilter}
              onChange={(v) => setTagFilter(v ?? null)}
              options={allTags.map((t) => ({ value: t, label: t }))}
              style={{ minWidth: 160 }}
            />
          )}
        </div>
      )}

      {lists.length === 0 ? (
        <Empty
          description="No active lists. Click 'New list' to get started."
          style={{ padding: "48px 0" }}
        />
      ) : visibleLists.length === 0 ? (
        <Empty description="No lists match that search or tag." style={{ padding: "48px 0" }} />
      ) : (
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
          {visibleLists.map((list, i) => (
            <div
              key={list.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderTop: i > 0 ? "1px solid #f0f0f0" : undefined,
                background: "#fff",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={`/${slug}/lists/${list.id}`}
                  style={{ fontWeight: 500, fontSize: 15, color: "#111827" }}
                >
                  {list.name}
                </Link>
                {list.tags.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <Space wrap size={4}>
                      {list.tags.map((tag) => (
                        <Tag key={tag} variant="filled" style={{ fontSize: 11 }}>
                          {tag}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )}
              </div>

              <span
                style={{
                  color: "rgba(0,0,0,.45)",
                  fontSize: 13,
                  marginRight: 8,
                  whiteSpace: "nowrap",
                }}
              >
                {list.totalItems === 0
                  ? "empty"
                  : `${list.checkedItems} / ${list.totalItems}`}
              </span>

              <Dropdown
                menu={{
                  items: [
                    {
                      key: "rename",
                      label: "Rename",
                      onClick: () => openRename(list),
                    },
                    {
                      key: "archive",
                      label: "Archive",
                      onClick: () =>
                        startTransition(async () => {
                          await archiveListAction(list.id, slug);
                          router.refresh();
                        }),
                    },
                    { type: "divider" },
                    {
                      key: "delete",
                      label: <span style={{ color: "#ff4d4f" }}>Delete</span>,
                      onClick: () => {
                        if (confirm(`Delete "${list.name}"? This cannot be undone.`)) {
                          startTransition(async () => {
                            await deleteListAction(list.id, slug);
                            router.refresh();
                          });
                        }
                      },
                    },
                  ],
                }}
                trigger={["click"]}
              >
                <Button
                  type="text"
                  icon={<MoreOutlined />}
                  size="small"
                  style={{ color: "rgba(0,0,0,.45)" }}
                />
              </Dropdown>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal
        title="New list"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false);
          setCreateName("");
          setCreateTags("");
        }}
        okText="Create"
        okButtonProps={{ loading: createLoading, disabled: !createName.trim() }}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: "100%", marginTop: 8 }} size="middle">
          <div>
            <label
              style={{ display: "block", fontWeight: 500, marginBottom: 4, fontSize: 14 }}
            >
              Name <span style={{ color: "#ff4d4f" }}>*</span>
            </label>
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Costco run"
              autoFocus
              onPressEnter={handleCreate}
            />
          </div>
          <div>
            <label
              style={{ display: "block", fontWeight: 500, marginBottom: 4, fontSize: 14 }}
            >
              Tags{" "}
              <span style={{ color: "rgba(0,0,0,.45)", fontWeight: 400 }}>
                (optional, comma-separated)
              </span>
            </label>
            <Input
              value={createTags}
              onChange={(e) => setCreateTags(e.target.value)}
              placeholder="grocery, urgent"
            />
          </div>
          <Checkbox checked={createImport} onChange={(e) => setCreateImport(e.target.checked)}>
            Import items from a CSV file after creating
          </Checkbox>
        </Space>
      </Modal>

      {/* Rename modal */}
      <Modal
        title="Rename list"
        open={!!renameTarget}
        onOk={handleRename}
        onCancel={() => setRenameTarget(null)}
        okText="Save"
        okButtonProps={{ loading: renameLoading, disabled: !renameName.trim() }}
        destroyOnHidden
      >
        <div style={{ marginTop: 8 }}>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onPressEnter={handleRename}
            autoFocus
          />
        </div>
      </Modal>
    </Space>
  );
}
