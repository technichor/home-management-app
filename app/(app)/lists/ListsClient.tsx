"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Tag, Space, Modal, Input, Dropdown, Empty, Checkbox, Select, Segmented, App } from "antd";
import type { MenuProps } from "antd";
import { GiftOutlined, MoreOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import {
  createListAction,
  renameListAction,
  archiveListAction,
  deleteListAction,
  leaveSharedListAction,
} from "./actions";
import type { ListRow } from "./listRows";
import { VISIBILITY_LABELS } from "@/lib/listAccess";

type ListData = ListRow;

export default function ListsClient({
  lists,
  }: {
  lists: ListData[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTags, setCreateTags] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createImport, setCreateImport] = useState(false);
  const [createKind, setCreateKind] = useState<"STANDARD" | "GIFT">("STANDARD");

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
      const { id } = await createListAction(createName.trim(), tags, createKind);
      setCreateOpen(false);
      setCreateName("");
      setCreateTags("");
      setCreateKind("STANDARD");
      router.push(`/lists/${id}${createImport ? "?import=1" : ""}`);
      setCreateImport(false);
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleRename() {
    if (!renameTarget || !renameName.trim()) return;
    setRenameLoading(true);
    try {
      await renameListAction(renameTarget.id, renameName.trim());
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
  // Lists other people shared with you come after your own and your household's.
  const groups = [
    { key: "ours", title: null, lists: visibleLists.filter((l) => !l.sharedBy) },
    { key: "shared", title: "Shared with me", lists: visibleLists.filter((l) => l.sharedBy) },
  ].filter((g) => g.lists.length > 0);

  function menuFor(list: ListData): MenuProps["items"] | null {
    if (list.access === "manage") {
      return [
        { key: "rename", label: "Rename", onClick: () => openRename(list) },
        {
          key: "archive",
          label: "Archive",
          onClick: () =>
            startTransition(async () => {
              await archiveListAction(list.id);
              router.refresh();
            }),
        },
        { type: "divider" },
        {
          key: "delete",
          label: <span style={{ color: "var(--danger)" }}>Delete</span>,
          onClick: () => {
            if (confirm(`Delete "${list.name}"? This cannot be undone.`)) {
              startTransition(async () => {
                await deleteListAction(list.id);
                router.refresh();
              });
            }
          },
        },
      ];
    }
    if (list.sharedBy) {
      return [
        {
          key: "leave",
          label: "Remove from my lists",
          onClick: () =>
            startTransition(async () => {
              const result = await leaveSharedListAction(list.id);
              if (!result.ok) message.error(result.error);
              router.refresh();
            }),
        },
      ];
    }
    return null;
  }

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
            className="fill-on-mobile"
            style={{ maxWidth: 280 }}
          />
          {allTags.length > 0 && (
            <Select
              allowClear
              placeholder="Filter by tag"
              value={tagFilter}
              onChange={(v) => setTagFilter(v ?? null)}
              options={allTags.map((t) => ({ value: t, label: t }))}
              className="fill-on-mobile"
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
        groups.map((group) => (
          <section key={group.key} aria-label={group.title ?? "Lists"}>
            {group.title && <h5 style={{ margin: "8px 0", fontSize: 14, fontWeight: 600 }}>{group.title}</h5>}
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {group.lists.map((list, i) => {
                const menu = menuFor(list);
                return (
                  <div
                    key={list.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                      background: "var(--surface)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link href={`/lists/${list.id}`} style={{ fontWeight: 500, fontSize: 15, color: "var(--text)" }}>
                        {list.kind === "GIFT" && <GiftOutlined aria-label="Gift ideas" style={{ marginRight: 6, color: "var(--muted)" }} />}
                        {list.name}
                      </Link>
                      <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        <Tag className="list-visibility" data-visibility={list.visibility} style={{ fontSize: 11 }}>
                          {VISIBILITY_LABELS[list.visibility]}
                        </Tag>
                        {list.sharedBy && (
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>
                            from {list.sharedBy}
                            {list.access === "view" && " · view only"}
                          </span>
                        )}
                        {list.tags.map((tag) => (
                          <Tag key={tag} variant="filled" style={{ fontSize: 11 }}>
                            {tag}
                          </Tag>
                        ))}
                      </div>
                    </div>

                    <span style={{ color: "var(--muted)", fontSize: 13, marginRight: 8, whiteSpace: "nowrap" }}>
                      {list.totalItems === 0 ? "empty" : `${list.checkedItems} / ${list.totalItems}`}
                    </span>

                    {menu ? (
                      <Dropdown menu={{ items: menu }} trigger={["click"]}>
                        <Button type="text" icon={<MoreOutlined />} size="small" style={{ color: "var(--muted)" }} aria-label={`More for ${list.name}`} />
                      </Dropdown>
                    ) : (
                      <span style={{ width: 24 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
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
          setCreateKind("STANDARD");
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
              Name <span style={{ color: "var(--danger)" }}>*</span>
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
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                (optional, comma-separated)
              </span>
            </label>
            <Input
              value={createTags}
              onChange={(e) => setCreateTags(e.target.value)}
              placeholder="grocery, urgent"
            />
          </div>
          <div>
            <label style={{ display: "block", fontWeight: 500, marginBottom: 4, fontSize: 14 }}>Type</label>
            <Segmented
              value={createKind}
              onChange={(v) => setCreateKind(v as "STANDARD" | "GIFT")}
              options={[
                { label: "List", value: "STANDARD" },
                { label: "Gift ideas", value: "GIFT" },
              ]}
            />
            {createKind === "GIFT" && (
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                Starts with a public link you can send to family, so they can see it without the app. You can turn it off.
              </div>
            )}
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
