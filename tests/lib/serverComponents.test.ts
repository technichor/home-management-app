import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// In a Next.js server component, dotted members of a client library's export
// (<Typography.Title>, <Form.Item>, <Space.Compact>, ...) are undefined, which only blows up at
// request time in production ("Element type is invalid ... got: undefined"). Component tests run
// in jsdom without server-component rules and cannot catch it, so check the source instead.
const DOTTED_JSX_TAG = /<([A-Z][A-Za-z0-9]*)\.([A-Z][A-Za-z0-9]*)/g;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

const isClientComponent = (source: string) => /^\s*["']use client["']/.test(source);

describe("server components", () => {
  it("the check recognizes a dotted tag and a client directive", () => {
    expect("<Typography.Title level={4}>".match(DOTTED_JSX_TAG)).toEqual(["<Typography.Title"]);
    expect(isClientComponent('"use client";\nimport x from "y";')).toBe(true);
    expect(isClientComponent('import x from "y";')).toBe(false);
  });

  it("do not use dotted client-library components", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const file of tsxFiles(dir)) {
        const source = readFileSync(file, "utf8");
        if (isClientComponent(source)) continue;
        for (const match of source.matchAll(DOTTED_JSX_TAG)) offenders.push(`${file}: ${match[0]}>`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
