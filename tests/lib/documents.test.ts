import { describe, it, expect } from "vitest";
import { DOCUMENT_TYPES, typeByKey, type DocumentType } from "@/lib/documentCatalog";
import {
  defaultTitle,
  toDocumentView,
  documentSchema,
  looksSensitive,
  MAX_LINKS,
  slotCounts,
  subjectKeyOf,
  suggestionSlots,
  type SlotDocument,
} from "@/lib/documents";

const type = (key: string) => typeByKey(key)!;

describe("documentSchema", () => {
  const base = { title: "Passport – Ellie", typeKey: "passport", ownerContactId: "c1", links: [{ url: "https://drive.google.com/file/1" }] };
  const parse = (over: object = {}) => documentSchema.safeParse({ ...base, ...over });
  const firstError = (over: object) => {
    const r = parse(over);
    expect(r.success).toBe(false);
    return r.error!.issues[0];
  };

  it("takes a typed document, its category from the type whatever the browser sent, blanks as none", () => {
    const r = parse({ category: "OTHER", title: "  Passport – Ellie ", maintenanceItemId: "", accountRecordId: null, originalLocation: "  Fireproof safe ", notes: "  " });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      title: "Passport – Ellie",
      typeKey: "passport",
      category: "IDENTITY",
      ownerContactId: "c1",
      maintenanceItemId: null,
      accountRecordId: null,
      links: [{ url: "https://drive.google.com/file/1", label: null }],
      originalLocation: "Fireproof safe",
      notes: null,
    });
  });

  it("takes a custom document (no type) with the category chosen", () => {
    const r = parse({ typeKey: "", ownerContactId: null, category: "MONEY", title: "Safe deposit box key photo" });
    expect(r.success && r.data).toMatchObject({ typeKey: null, category: "MONEY", ownerContactId: null });
  });

  it("keeps notes as typed, and trims links and their labels", () => {
    const r = parse({ notes: "Line one\n  line two", links: [{ url: " https://x.test/a ", label: " Front " }, { url: "http://x.test/b", label: "" }] });
    expect(r.success && r.data).toMatchObject({
      notes: "Line one\n  line two",
      links: [{ url: "https://x.test/a", label: "Front" }, { url: "http://x.test/b", label: null }],
    });
  });

  it.each([
    ["no title", { title: "  " }, "Give it a title", ["title"]],
    ["a long title", { title: "x".repeat(201) }, "The title can be at most 200 characters", ["title"]],
    ["a type not in the catalog", { typeKey: "pet-records" }, "Choose a type from the list", ["typeKey"]],
    ["a custom document without a category", { typeKey: null, ownerContactId: null }, "Choose a category", ["category"]],
    ["a category not in the list", { typeKey: null, category: "PETS" }, undefined, ["category"]],
    ["a person's document without the person", { ownerContactId: "" }, "Choose whose it is", ["ownerContactId"]],
    ["a vehicle document without the vehicle", { typeKey: "vehicle-title", ownerContactId: null }, "Choose the vehicle", ["maintenanceItemId"]],
    ["no links", { links: [] }, "Add a link to where the document is", ["links"]],
    ["too many links", { links: Array.from({ length: MAX_LINKS + 1 }, (_, i) => ({ url: `https://x.test/${i}` })) }, "A document can have at most 5 links", ["links"]],
    ["a blank link", { links: [{ url: " " }] }, "Add the link", ["links", 0, "url"]],
    ["a javascript: link", { links: [{ url: "javascript:alert(1)" }] }, "A link must start with http:// or https://", ["links", 0, "url"]],
    ["a link that isn't one", { links: [{ url: "drive.google.com/x" }] }, "A link must start with http:// or https://", ["links", 0, "url"]],
    ["a very long link", { links: [{ url: `https://x.test/${"a".repeat(2000)}` }] }, "A link can be at most 2,000 characters", ["links", 0, "url"]],
    ["a long link label", { links: [{ url: "https://x.test", label: "x".repeat(51) }] }, "A link's label can be at most 50 characters", ["links", 0, "label"]],
    ["a long original location", { originalLocation: "x".repeat(201) }, "Where the original is can be at most 200 characters", ["originalLocation"]],
    ["long notes", { notes: "x".repeat(5001) }, "Notes can be at most 5,000 characters", ["notes"]],
  ])("refuses %s", (_n, over, message, path) => {
    const issue = firstError(over);
    if (message) expect(issue.message).toBe(message);
    expect(issue.path).toEqual(path);
  });

  it("needs no relation for a household type", () => {
    expect(parse({ typeKey: "will", ownerContactId: null }).success).toBe(true);
  });
});

describe("defaultTitle", () => {
  it("is the label, plus the person or the vehicle", () => {
    expect(defaultTitle(type("will"))).toBe("Wills");
    expect(defaultTitle(type("will"), "Ellie")).toBe("Wills");
    expect(defaultTitle(type("passport"), "Ellie")).toBe("Passport – Ellie");
    expect(defaultTitle(type("passport"), null)).toBe("Passport");
    expect(defaultTitle(type("vehicle-title"), "Pacifica")).toBe("Title – Pacifica");
  });
});

describe("looksSensitive", () => {
  it.each([
    ["an SSN with dashes", "SSN 123-45-6789"],
    ["an SSN without", "123456789"],
    ["a long account number", "Acct 12345678"],
  ])("warns about %s", (_n, text) => expect(looksSensitive([null, text])).toBe(true));

  it.each([["years and short numbers", "2025 W-2 – Corey, box 12"], ["a date", "Signed 2026-10-23"], ["a phone extension", "ext 1234567"], ["nothing", ""]])(
    "lets %s be",
    (_n, text) => expect(looksSensitive([text, undefined, null])).toBe(false),
  );
});

describe("suggestionSlots", () => {
  const members = [
    { id: "c1", name: "Corey" },
    { id: "c2", name: "Ellie" },
  ];
  const vehicles = [{ id: "v1", name: "Pacifica" }];
  let n = 0;
  const doc = (typeKey: string | null, over: Partial<SlotDocument> = {}): SlotDocument => ({ id: `d${++n}`, typeKey, ownerContactId: null, maintenanceItemId: null, ...over });
  const catalog = (...keys: string[]): DocumentType[] => keys.map(type);
  const states = (slots: ReturnType<typeof suggestionSlots>) => slots.map((s) => `${s.type.key}@${s.subjectKey}:${s.state}`);

  it("has one household slot, one per member, and one per vehicle, all open to start", () => {
    const slots = suggestionSlots(catalog("will", "passport", "vehicle-title"), members, vehicles, [], []);
    expect(states(slots)).toEqual(["will@household:open", "passport@contact:c1:open", "passport@contact:c2:open", "vehicle-title@item:v1:open"]);
    expect(slots[1].subject).toEqual({ kind: "contact", id: "c1", name: "Corey" });
    expect(slots[3].subject).toEqual({ kind: "item", id: "v1", name: "Pacifica" });
    expect(slots[0].documentIds).toEqual([]);
  });

  it("gives types that aren't suggested no slots", () => {
    expect(suggestionSlots(catalog("passport-card", "manual", "vehicle-warranty"), members, vehicles, [], [])).toEqual([]);
  });

  it("fills a household slot with any document of its type, a person's with theirs, a vehicle's with its own", () => {
    const will = doc("will", { ownerContactId: "c1" });
    const coreysPassport = doc("passport", { ownerContactId: "c1" });
    const title = doc("vehicle-title", { maintenanceItemId: "v1" });
    const slots = suggestionSlots(catalog("will", "passport", "vehicle-title"), members, vehicles, [will, coreysPassport, title], []);
    expect(states(slots)).toEqual(["will@household:added", "passport@contact:c1:added", "passport@contact:c2:open", "vehicle-title@item:v1:added"]);
    expect(slots[0].documentIds).toEqual([will.id]);
    expect(slots[1].documentIds).toEqual([coreysPassport.id]);
  });

  it("lists every document that fills a slot", () => {
    const a = doc("w-2");
    const b = doc("w-2");
    expect(suggestionSlots(catalog("w-2"), members, vehicles, [a, b], [])[0].documentIds).toEqual([a.id, b.id]);
  });

  it("marks a slot the household said doesn't apply, but adding a document wins", () => {
    const dismissals = [
      { typeKey: "drivers-license", subjectKey: "contact:c2" },
      { typeKey: "lease", subjectKey: "household" },
      { typeKey: "deed", subjectKey: "household" },
    ];
    const deed = doc("deed");
    const slots = suggestionSlots(catalog("drivers-license", "lease", "deed"), members, vehicles, [deed], dismissals);
    expect(states(slots)).toEqual(["drivers-license@contact:c1:open", "drivers-license@contact:c2:dismissed", "lease@household:dismissed", "deed@household:added"]);
  });

  it("has no slots for members who have left, and their documents fill nothing", () => {
    const leftPassport = doc("passport", { ownerContactId: "gone" });
    const slots = suggestionSlots(catalog("passport"), members, vehicles, [leftPassport], []);
    expect(states(slots)).toEqual(["passport@contact:c1:open", "passport@contact:c2:open"]);
  });

  it("gives items that aren't vehicles no slots (only vehicles are passed in), and their documents fill nothing", () => {
    const dishwasherTitle = doc("vehicle-title", { maintenanceItemId: "dishwasher" });
    expect(suggestionSlots(catalog("vehicle-title"), members, [], [dishwasherTitle], [])).toEqual([]);
    expect(states(suggestionSlots(catalog("vehicle-title"), members, vehicles, [dishwasherTitle], []))).toEqual(["vehicle-title@item:v1:open"]);
  });

  it("never counts custom documents (no type) or documents of other types", () => {
    const slots = suggestionSlots(catalog("will"), members, vehicles, [doc(null), doc("trust")], []);
    expect(states(slots)).toEqual(["will@household:open"]);
  });

  it("works across the whole catalog", () => {
    const slots = suggestionSlots(DOCUMENT_TYPES, members, vehicles, [], []);
    const suggested = DOCUMENT_TYPES.filter((t) => t.suggested);
    const expected = suggested.reduce((total, t) => total + (t.scope === "HOUSEHOLD" ? 1 : t.scope === "PERSON" ? members.length : vehicles.length), 0);
    expect(slots).toHaveLength(expected);
    expect(slots.every((s) => s.state === "open")).toBe(true);
  });
});

describe("slotCounts", () => {
  it("counts added of suggested, leaving dismissed slots out of both", () => {
    const slots = suggestionSlots(
      [type("passport"), type("will"), type("lease")],
      [
        { id: "c1", name: "Corey" },
        { id: "c2", name: "Ellie" },
      ],
      [],
      [{ id: "d1", typeKey: "passport", ownerContactId: "c1", maintenanceItemId: null }],
      [{ typeKey: "lease", subjectKey: "household" }],
    );
    expect(slotCounts(slots)).toEqual({ added: 1, suggested: 3 });
    expect(slotCounts([])).toEqual({ added: 0, suggested: 0 });
  });
});

describe("subjectKeyOf", () => {
  it("names the household, a member or an item", () => {
    expect(subjectKeyOf({ kind: "household" })).toBe("household");
    expect(subjectKeyOf({ kind: "contact", id: "c1", name: "Corey" })).toBe("contact:c1");
    expect(subjectKeyOf({ kind: "item", id: "v1", name: "Pacifica" })).toBe("item:v1");
  });
});

describe("toDocumentView", () => {
  const stored = {
    id: "d1", title: "Passport – Sam", category: "IDENTITY" as const, typeKey: "passport", ownerContactId: "c1", maintenanceItemId: "i1", accountRecordId: "a1",
    originalLocation: "Fireproof safe", notes: "n", owner: { firstName: "Samuel", nickname: "Sam" }, maintenanceItem: { name: "Pacifica" }, accountRecord: { name: "Loan" },
    links: [{ url: "https://drive.test/1", label: "Front" }, { url: "https://drive.test/2", label: null }],
  };
  it("names whose it is (short name), its item and account, with its links in order", () => {
    expect(toDocumentView(stored)).toEqual({
      id: "d1", title: "Passport – Sam", category: "IDENTITY", typeKey: "passport", ownerContactId: "c1", ownerName: "Sam", maintenanceItemId: "i1", itemName: "Pacifica",
      accountRecordId: "a1", accountName: "Loan", links: stored.links, originalLocation: "Fireproof safe", notes: "n",
    });
  });
  it("a household document about nothing else", () => {
    expect(toDocumentView({ ...stored, ownerContactId: null, owner: null, maintenanceItemId: null, maintenanceItem: null, accountRecordId: null, accountRecord: null })).toMatchObject({
      ownerName: null, itemName: null, accountName: null,
    });
  });
});
