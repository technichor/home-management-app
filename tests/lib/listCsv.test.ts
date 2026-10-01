import { describe, it, expect } from "vitest";
import { parseListItemsCSV } from "@/lib/listCsv";

describe("parseListItemsCSV", () => {
  it("parses text, quantity and notes", () => {
    const { items, errors } = parseListItemsCSV("*text,quantity,notes\nmilk,2 gallons,whole\neggs,,\n");
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { text: "milk", quantity: "2 gallons", notes: "whole" },
      { text: "eggs", quantity: null, notes: null },
    ]);
  });

  it("accepts a plain or differently-cased text header and ignores extra columns", () => {
    const { items, errors } = parseListItemsCSV("Text,aisle\nbread,3\n");
    expect(errors).toEqual([]);
    expect(items).toEqual([{ text: "bread", quantity: null, notes: null }]);
  });

  it("reports the spreadsheet row for a missing text value", () => {
    const { items, errors } = parseListItemsCSV("text,quantity\nmilk,1\n,2\neggs,3\n");
    expect(errors).toEqual([{ row: 3, column: "text", message: "text is required" }]);
    expect(items).toHaveLength(2);
  });

  it("errors when there is no text column", () => {
    const { items, errors } = parseListItemsCSV("name,quantity\nmilk,1\n");
    expect(items).toEqual([]);
    expect(errors[0]).toMatchObject({ row: 1, column: "text" });
  });

  it("errors on a file with a header but no rows", () => {
    const { errors } = parseListItemsCSV("*text,quantity,notes\n");
    expect(errors).toHaveLength(1);
  });
});

describe("parseListItemsCSV: short rows", () => {
  it("treats a row that stops before the text column as missing text", () => {
    const { items, errors } = parseListItemsCSV("quantity,text\n2\n");
    expect(items).toEqual([]);
    expect(errors).toEqual([{ row: 2, column: "text", message: "text is required" }]);
  });
});
