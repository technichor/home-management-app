import { describe, it, expect } from "vitest";
import { DocumentCategory } from "@prisma/client";
import { categoryLabel, DOCUMENT_CATEGORIES, DOCUMENT_TYPES, typeByKey, typesInCategory } from "@/lib/documentCatalog";

describe("the documents catalog", () => {
  it("has every key once, in kebab-case", () => {
    const keys = DOCUMENT_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key, key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("labels every category of the database's enum, once, in display order", () => {
    expect(DOCUMENT_CATEGORIES.map((c) => c.key).sort()).toEqual(Object.values(DocumentCategory).sort());
    for (const c of DOCUMENT_CATEGORIES) expect(c.label, c.key).not.toBe("");
    expect(DOCUMENT_CATEGORIES[0]).toEqual({ key: "IDENTITY", label: "Identity & vital records" });
    expect(DOCUMENT_CATEGORIES.at(-1)).toEqual({ key: "OTHER", label: "Other" });
  });

  it("gives every type a label and keeps the categories in order", () => {
    for (const t of DOCUMENT_TYPES) expect(t.label, t.key).not.toBe("");
    const order = DOCUMENT_CATEGORIES.map((c) => c.key);
    const positions = DOCUMENT_TYPES.map((t) => order.indexOf(t.category));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("puts every vehicle type in Vehicles, and only vehicle types", () => {
    for (const t of DOCUMENT_TYPES) expect(t.scope === "VEHICLE", t.key).toBe(t.category === "VEHICLES");
  });

  it("suggests the documents a family should have, and only offers the rest", () => {
    expect(typeByKey("passport")).toEqual({ key: "passport", label: "Passport", category: "IDENTITY", scope: "PERSON", suggested: true });
    expect(typeByKey("passport-card")).toMatchObject({ scope: "PERSON", suggested: false });
    expect(typeByKey("deed")).toMatchObject({ category: "HOME", scope: "HOUSEHOLD", suggested: true });
    expect(typeByKey("vehicle-title")).toMatchObject({ label: "Title", scope: "VEHICLE", suggested: true });
    expect(typeByKey("manual")).toMatchObject({ category: "POSSESSIONS", suggested: false });
    expect(typesInCategory("OTHER").filter((t) => t.suggested)).toEqual([]);
    expect(typesInCategory("EDUCATION").filter((t) => t.suggested)).toEqual([]);
    expect(DOCUMENT_TYPES.filter((t) => t.suggested)).toHaveLength(31); // the spec's ✓ rows
  });

  it("finds nothing for no key or an unknown one", () => {
    expect(typeByKey(null)).toBeUndefined();
    expect(typeByKey(undefined)).toBeUndefined();
    expect(typeByKey("")).toBeUndefined();
    expect(typeByKey("pet-records")).toBeUndefined();
  });

  it("lists a category's types in catalog order, and names it", () => {
    expect(typesInCategory("VEHICLES").map((t) => t.key).slice(0, 2)).toEqual(["vehicle-title", "vehicle-registration"]);
    expect(categoryLabel("POSSESSIONS")).toBe("Manuals, warranties & valuables");
  });
});
