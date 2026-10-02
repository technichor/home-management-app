"use client";

import { useState } from "react";
import { Alert, Button, Modal, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { parseListItemsCSV, ParsedListItem, LIST_ITEM_CSV_TEMPLATE } from "@/lib/listCsv";
import type { ParseError } from "@/lib/csv";
import { importItemsAction } from "./actions";

/** Append-only CSV import of items into an existing list, with a count preview before committing. */
export default function ImportItemsModal({
  open,
  onClose,
  onDone,
  listId,
  listName,
  }: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  listId: string;
  listName: string;
}) {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<ParsedListItem[]>([]);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [loading, setLoading] = useState(false);

  function reset() {
    setCsvText(null);
    setFileName("");
    setItems([]);
    setErrors([]);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseListItemsCSV(text);
    setCsvText(text);
    setFileName(file.name);
    setItems(parsed.items);
    setErrors(parsed.errors);
  }

  // Only reachable when the Add button is enabled, which requires a parsed file.
  async function handleImport() {
    setLoading(true);
    try {
      const result = await importItemsAction(listId, csvText as string);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        return;
      }
      reset();
      onDone();
    } finally {
      setLoading(false);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([LIST_ITEM_CSV_TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "list-items-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const canImport = !!csvText && errors.length === 0 && items.length > 0;

  return (
    <Modal
      title={`Import items into "${listName}"`}
      open={open}
      onCancel={close}
      onOk={handleImport}
      okText={canImport ? `Add ${items.length} item${items.length === 1 ? "" : "s"}` : "Add items"}
      okButtonProps={{ disabled: !canImport, loading }}
    >
      <p style={{ marginTop: 0, color: "rgba(0,0,0,.65)" }}>
        Columns: <code>*text</code> (required), <code>quantity</code>, <code>notes</code>. Items are added to the end
        of the list; nothing already in the list is changed or removed.{" "}
        <Button type="link" size="small" style={{ padding: 0 }} onClick={downloadTemplate}>
          Download template
        </Button>
      </p>
      <Upload
        accept=".csv,text/csv"
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => {
          handleFile(file);
          return false;
        }}
      >
        <Button icon={<UploadOutlined />}>{fileName || "Choose CSV file"}</Button>
      </Upload>

      {errors.length > 0 && (
        <Alert
          style={{ marginTop: 16 }}
          type="error"
          title={`${errors.length} error${errors.length > 1 ? "s" : ""} found. Fix these and choose the file again.`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}, column {e.column}: {e.message}
                </li>
              ))}
            </ul>
          }
        />
      )}
      {canImport && (
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          title={`${items.length} item${items.length === 1 ? "" : "s"} will be added to "${listName}".`}
        />
      )}
    </Modal>
  );
}
