"use client";

import { Typography } from "antd";

/** A form field with its label above it, as the record forms (maintenance, accounts) lay them out. */
export default function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
        {label}
      </Typography.Text>
      {children}
    </div>
  );
}
