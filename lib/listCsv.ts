import Papa from "papaparse";
import type { ParseError } from "./csv";

export interface ParsedListItem {
  text: string;
  quantity: string | null;
  notes: string | null;
}

export const LIST_ITEM_CSV_TEMPLATE = "*text,quantity,notes\n";

/**
 * Parse an append-only list-items CSV. Only `text` is required; `quantity` and
 * `notes` are optional and any other columns are ignored. Rows missing `text`
 * produce a row-level error (row numbers match the spreadsheet: header = row 1).
 */
export function parseListItemsCSV(csvText: string): {
  items: ParsedListItem[];
  errors: ParseError[];
} {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\*/, "").toLowerCase(),
  });

  if (!result.meta.fields?.includes("text")) {
    return {
      items: [],
      errors: [{ row: 1, column: "text", message: 'Header row must include a "text" column' }],
    };
  }

  const items: ParsedListItem[] = [];
  const errors: ParseError[] = [];

  result.data.forEach((row, i) => {
    const text = (row["text"] ?? "").trim();
    if (!text) {
      errors.push({ row: i + 2, column: "text", message: "text is required" });
      return;
    }
    items.push({
      text,
      quantity: row["quantity"]?.trim() || null,
      notes: row["notes"]?.trim() || null,
    });
  });

  if (items.length === 0 && errors.length === 0) {
    errors.push({ row: 2, column: "text", message: "File has no item rows" });
  }

  return { items, errors };
}
