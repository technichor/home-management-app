"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  validateImportAction,
  applyImportAction,
  ValidateImportResult,
  ValidateSuccess,
} from "./actions";
import { ImportDiff, ParseError } from "@/lib/csv";
import {
  Steps,
  Button,
  Alert,
  Space,
  Typography,
  Statistic,
  Row,
  Col,
  Card,
  Tag,
} from "antd";
import { DownloadOutlined } from "@ant-design/icons";

type Step = "upload" | "diff" | "success";

export default function ImportClient() {
  const [step, setStep] = useState<Step>("upload");
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [validated, setValidated] = useState<ValidateSuccess | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const stepIndex = step === "upload" ? 0 : step === "diff" ? 1 : 2;

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result: ValidateImportResult = await validateImportAction(formData);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      setValidated(result);
      setStep("diff");
    });
  }

  function handleConfirm(current: ValidateSuccess) {
    startTransition(async () => {
      const result = await applyImportAction({
        householdsCSV: current.householdsCSV,
        contactsCSV: current.contactsCSV,
      });
      if (!result.ok) {
        setApplyError(result.error ?? "Unknown error.");
        return;
      }
      setStep("success");
    });
  }

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="large">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Import CSV
        </Typography.Title>
        <Space size="middle">
          <Button
            type="link"
            icon={<DownloadOutlined />}
            href="/contacts/api/export?file=households"
            size="small"
          >
            households.csv
          </Button>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            href="/contacts/api/export?file=contacts"
            size="small"
          >
            contacts.csv
          </Button>
        </Space>
      </div>

      <Steps
        current={stepIndex}
        size="small"
        items={[
          { title: "Upload" },
          { title: "Review changes" },
          { title: "Done" },
        ]}
      />

      {step === "upload" && (
        <UploadStep onSubmit={handleUpload} errors={errors} isPending={isPending} />
      )}

      {step === "diff" && validated && (
        <DiffStep
          diff={validated.diff}
          onConfirm={() => handleConfirm(validated)}
          onBack={() => {
            setStep("upload");
            setValidated(null);
            setApplyError(null);
          }}
          applyError={applyError}
          isPending={isPending}
        />
      )}

      {step === "success" && (
        <Space orientation="vertical" size="middle">
          <Alert title="Import applied successfully." type="success" showIcon />
          <Space>
            <Button
              onClick={() => {
                setStep("upload");
                setValidated(null);
                setErrors([]);
                setApplyError(null);
              }}
            >
              Import again
            </Button>
            <Button type="primary" onClick={() => router.push("/contacts")}>
              View contacts
            </Button>
          </Space>
        </Space>
      )}
    </Space>
  );
}

// ---------------------------------------------------------------------------

function UploadStep({
  onSubmit,
  errors,
  isPending,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  errors: ParseError[];
  isPending: boolean;
}) {
  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="middle">
      <Alert
        type="info"
        showIcon
        title="How importing works"
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>Export your current data, edit in a spreadsheet, then upload both files here.</li>
            <li>
              Rows with an <code>id</code> update the matching record. Rows without an id (or
              with an unknown id) are added as new.
            </li>
            <li>Active records not in the uploaded files will be soft-deleted.</li>
            <li>You&apos;ll see a full diff before anything is committed.</li>
          </ul>
        }
      />

      <form onSubmit={onSubmit}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12}>
            <div>
              <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                households.csv <span style={{ color: "#ff4d4f" }}>*</span>
              </Typography.Text>
              <input
                name="householdsFile"
                type="file"
                accept=".csv,text/csv"
                required
                style={{ width: "100%" }}
              />
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div>
              <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                contacts.csv <span style={{ color: "#ff4d4f" }}>*</span>
              </Typography.Text>
              <input
                name="contactsFile"
                type="file"
                accept=".csv,text/csv"
                required
                style={{ width: "100%" }}
              />
            </div>
          </Col>
        </Row>

        {errors.length > 0 && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            title={`${errors.length} error${errors.length > 1 ? "s" : ""} found — fix these before importing`}
            description={
              <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                {errors.map((e, i) => (
                  <li key={i}>
                    {e.row > 0 ? `Row ${e.row}, ` : ""}
                    <code>{e.column}</code>: {e.message}
                  </li>
                ))}
              </ul>
            }
          />
        )}

        <Button type="primary" htmlType="submit" loading={isPending}>
          {isPending ? "Validating…" : "Validate and preview changes"}
        </Button>
      </form>
    </Space>
  );
}

// ---------------------------------------------------------------------------

function DiffStep({
  diff,
  onConfirm,
  onBack,
  applyError,
  isPending,
}: {
  diff: ImportDiff;
  onConfirm: () => void;
  onBack: () => void;
  applyError: string | null;
  isPending: boolean;
}) {
  const totalChanges =
    diff.households.added.length +
    diff.households.updated.length +
    diff.households.removed.length +
    diff.contacts.added.length +
    diff.contacts.updated.length +
    diff.contacts.removed.length;

  const warningHouseholds = diff.households.removed.filter((h) => h.hasFamilyFriendContacts);

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="middle">
      <Card size="small">
        <Typography.Text strong>
          {totalChanges === 0
            ? "No changes detected. Nothing will be committed."
            : `${totalChanges} change${totalChanges > 1 ? "s" : ""} to apply`}
        </Typography.Text>
        <Row gutter={[16, 8]} style={{ marginTop: 12 }}>
          <Col xs={12} sm={6}>
            <Statistic title="Households added" value={diff.households.added.length} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Households updated" value={diff.households.updated.length} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Households removed"
              value={diff.households.removed.length}
              styles={diff.households.removed.length > 0 ? { content: { color: "#cf1322" } } : undefined}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Households unchanged" value={diff.households.unchanged} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Contacts added" value={diff.contacts.added.length} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Contacts updated" value={diff.contacts.updated.length} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Contacts removed"
              value={diff.contacts.removed.length}
              styles={diff.contacts.removed.length > 0 ? { content: { color: "#cf1322" } } : undefined}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Contacts unchanged" value={diff.contacts.unchanged} />
          </Col>
        </Row>
      </Card>

      {warningHouseholds.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="Removing households that have Family & Friend contacts"
          description={
            <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
              {warningHouseholds.map((h) => (
                <li key={h.id}>
                  <strong>{h.displayName}</strong> — its Family &amp; Friend contacts will
                  lose their inherited address.
                </li>
              ))}
            </ul>
          }
        />
      )}

      <DiffSection
        title="Households added"
        items={diff.households.added.map((h) => h.displayName)}
        color="success"
      />
      <DiffSection
        title="Households updated"
        items={diff.households.updated.map(
          ({ before, after }) =>
            `${before.displayName}${before.displayName !== after.displayName ? ` → ${after.displayName}` : ""}`
        )}
        color="processing"
      />
      <DiffSection
        title="Households removed (will be soft-deleted)"
        items={diff.households.removed.map(
          (h) => `${h.displayName}${h.hasFamilyFriendContacts ? " ⚠ has Family & Friend contacts" : ""}`
        )}
        color="error"
      />
      <DiffSection
        title="Contacts added"
        items={diff.contacts.added.map((c) => `${c.firstName} ${c.lastName} (${c.category})`)}
        color="success"
      />
      <DiffSection
        title="Contacts updated"
        items={diff.contacts.updated.map(({ before }) => `${before.firstName} ${before.lastName}`)}
        color="processing"
      />
      <DiffSection
        title="Contacts removed (will be soft-deleted)"
        items={diff.contacts.removed.map((c) => c.name)}
        color="error"
      />

      {applyError && (
        <Alert type="error" showIcon title={applyError} />
      )}

      <Space>
        <Button onClick={onBack} disabled={isPending}>
          Back
        </Button>
        {totalChanges > 0 && (
          <Button type="primary" onClick={onConfirm} loading={isPending}>
            {isPending
              ? "Applying…"
              : `Apply ${totalChanges} change${totalChanges > 1 ? "s" : ""}`}
          </Button>
        )}
      </Space>
    </Space>
  );
}

function DiffSection({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: "success" | "processing" | "error";
}) {
  if (items.length === 0) return null;
  const tagColor = color === "success" ? "green" : color === "error" ? "red" : "blue";
  return (
    <Card
      size="small"
      title={
        <Space>
          <Tag color={tagColor} variant="filled">
            {items.length}
          </Tag>
          {title}
        </Space>
      }
    >
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: 13 }}>
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
