"use client";

import { useTransition } from "react";
import { Button, Tag, Space, Empty } from "antd";
import { useRouter } from "next/navigation";
import { unarchiveListAction, deleteListAction } from "../actions";

type ListData = {
  id: string;
  name: string;
  tags: string[];
  totalItems: number;
  checkedItems: number;
  archivedAt: string;
};

export default function ArchivedListsClient({
  lists,
  slug,
}: {
  lists: ListData[];
  slug: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="middle">
      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
        Archived lists{lists.length > 0 ? ` (${lists.length})` : ""}
      </h4>

      {lists.length === 0 ? (
        <Empty description="No archived lists." style={{ padding: "48px 0" }} />
      ) : (
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
          {lists.map((list, i) => (
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
                <span style={{ fontWeight: 500, fontSize: 15, color: "#111827" }}>
                  {list.name}
                </span>
                <span style={{ fontSize: 12, color: "rgba(0,0,0,.45)", marginLeft: 8 }}>
                  archived {list.archivedAt}
                </span>
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
                  marginRight: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {list.totalItems === 0
                  ? "empty"
                  : `${list.checkedItems} / ${list.totalItems}`}
              </span>

              <Space size="small">
                <Button
                  size="small"
                  loading={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await unarchiveListAction(list.id, slug);
                      router.refresh();
                    })
                  }
                >
                  Unarchive
                </Button>
                <Button
                  size="small"
                  danger
                  loading={isPending}
                  onClick={() => {
                    if (confirm(`Delete "${list.name}"? This cannot be undone.`)) {
                      startTransition(async () => {
                        await deleteListAction(list.id, slug);
                        router.refresh();
                      });
                    }
                  }}
                >
                  Delete
                </Button>
              </Space>
            </div>
          ))}
        </div>
      )}
    </Space>
  );
}
