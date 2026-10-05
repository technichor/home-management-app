import { describe, it, expect } from "vitest";
import {
  householdsToCSV,
  contactsToCSV,
  parseHouseholdsCSV,
  parseContactsCSV,
  computeHouseholdDiff,
  computeContactDiff,
} from "@/lib/csv";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHousehold(overrides: Record<string, unknown> = {}) {
  return {
    id: "hh1",
    displayName: "The Smiths",
    mailingAddress: null,
    tags: [] as string[],
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as any;
}

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    householdId: null,
    firstName: "Jane",
    lastName: "Smith",
    nickname: null,
    category: "SERVICE_PROVIDER",
    address: null,
    phoneMobile: null,
    phoneHome: null,
    phoneWork: null,
    emailPrimary: null,
    emailSecondary: null,
    tags: [] as string[],
    favorite: false,
    relationshipNotes: null,
    linkedFamilyMember: null,
    birthdayMonth: null,
    birthdayDay: null,
    birthdayYear: null,
    importantDate1: null,
    importantDate1Label: null,
    importantDate2: null,
    importantDate2Label: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// householdsToCSV
// ---------------------------------------------------------------------------

describe("householdsToCSV", () => {
  it("produces a CSV with header row", () => {
    const csv = householdsToCSV([makeHousehold()]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("*display_name");
    expect(lines[0]).toContain("id");
  });

  it("includes household data in body row", () => {
    const csv = householdsToCSV([
      makeHousehold({ id: "hh1", displayName: "The Smiths", mailingAddress: "1 Main St", tags: ["church"] }),
    ]);
    expect(csv).toContain("The Smiths");
    expect(csv).toContain("1 Main St");
    expect(csv).toContain("church");
  });

  it("never includes urlSlug or passwordHash columns", () => {
    const csv = householdsToCSV([makeHousehold({ passwordHash: "hash" })]);
    expect(csv).not.toContain("urlSlug");
    expect(csv).not.toContain("passwordHash");
    expect(csv).not.toContain("url_slug");
    expect(csv).not.toContain("password");
  });

  it("returns empty body (header only) for empty array", () => {
    const csv = householdsToCSV([]);
    expect(csv.trim().split("\n")).toHaveLength(1); // just header
  });
});

// ---------------------------------------------------------------------------
// contactsToCSV
// ---------------------------------------------------------------------------

describe("contactsToCSV", () => {
  it("produces a CSV with header row including *category", () => {
    const csv = contactsToCSV([makeContact()]);
    expect(csv.split("\n")[0]).toContain("*category");
    expect(csv.split("\n")[0]).toContain("first_name");
  });

  it("serializes tags with semicolon separator", () => {
    const csv = contactsToCSV([makeContact({ tags: ["a", "b", "c"] })]);
    expect(csv).toContain("a;b;c");
  });

  it("serializes favorite as true/false string", () => {
    const csvTrue = contactsToCSV([makeContact({ favorite: true })]);
    const csvFalse = contactsToCSV([makeContact({ favorite: false })]);
    expect(csvTrue).toContain("true");
    expect(csvFalse).toContain("false");
  });

  it("never includes passwordHash or urlSlug", () => {
    const csv = contactsToCSV([makeContact()]);
    expect(csv).not.toContain("password");
    expect(csv).not.toContain("urlSlug");
  });
});

// ---------------------------------------------------------------------------
// parseHouseholdsCSV
// ---------------------------------------------------------------------------

describe("parseHouseholdsCSV", () => {
  it("parses a valid households CSV", () => {
    const csv = `id,*display_name,mailing_address,tags,notes\nhh1,The Smiths,123 Main St,friends,Great family`;
    const { households, errors } = parseHouseholdsCSV(csv);
    expect(errors).toHaveLength(0);
    expect(households).toHaveLength(1);
    expect(households[0].displayName).toBe("The Smiths");
    expect(households[0].id).toBe("hh1");
    expect(households[0].mailingAddress).toBe("123 Main St");
  });

  it("parses tags from semicolon-separated string", () => {
    const csv = `id,*display_name,tags\n,The Jones,family;church`;
    const { households } = parseHouseholdsCSV(csv);
    expect(households[0].tags).toEqual(["family", "church"]);
  });

  it("returns error for missing display_name", () => {
    const csv = `id,*display_name,mailing_address\nhh1,,`;
    const { households, errors } = parseHouseholdsCSV(csv);
    expect(errors.length).toBeGreaterThan(0);
    expect(households).toHaveLength(0);
    expect(errors[0].column).toBe("displayName");
  });

  it("treats row without id as new (id undefined)", () => {
    const csv = `id,*display_name\n,New Household`;
    const { households } = parseHouseholdsCSV(csv);
    expect(households[0].id).toBeUndefined();
  });

  it("returns empty arrays for empty CSV (header only)", () => {
    const csv = `id,*display_name`;
    const { households, errors } = parseHouseholdsCSV(csv);
    expect(households).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseContactsCSV
// ---------------------------------------------------------------------------

describe("parseContactsCSV", () => {
  const knownIds = new Set(["hh1"]);

  it("parses a valid contacts CSV", () => {
    const csv = `id,household_id,first_name,last_name,*category\nc1,hh1,Jane,Smith,FAMILY_FRIEND`;
    const { contacts, errors } = parseContactsCSV(csv, knownIds);
    expect(errors).toHaveLength(0);
    expect(contacts[0].firstName).toBe("Jane");
    expect(contacts[0].householdId).toBe("hh1");
    expect(contacts[0].category).toBe("FAMILY_FRIEND");
  });

  it("returns error when FAMILY_FRIEND missing householdId", () => {
    const csv = `id,household_id,first_name,last_name,*category\n,,Jane,Smith,FAMILY_FRIEND`;
    const { errors } = parseContactsCSV(csv, knownIds);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].column).toBe("householdId");
  });

  it("returns error when household_id not in known IDs", () => {
    const csv = `id,household_id,first_name,last_name,*category\nc1,unknown-id,Jane,Smith,FAMILY_FRIEND`;
    const { errors } = parseContactsCSV(csv, knownIds);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].column).toBe("household_id");
  });

  it("accepts SERVICE_PROVIDER without household_id", () => {
    const csv = `id,household_id,first_name,last_name,*category\nc1,,Joe,Plumber,SERVICE_PROVIDER`;
    const { contacts, errors } = parseContactsCSV(csv, knownIds);
    expect(errors).toHaveLength(0);
    expect(contacts[0].householdId).toBeUndefined();
  });

  it("parses favorite=true correctly", () => {
    const csv = `id,household_id,first_name,last_name,*category,favorite\nc1,,Joe,Plumber,SERVICE_PROVIDER,true`;
    const { contacts } = parseContactsCSV(csv, knownIds);
    expect(contacts[0].favorite).toBe(true);
  });

  it("returns error for missing first_name", () => {
    const csv = `id,household_id,first_name,last_name,*category\nc1,,  ,Smith,SERVICE_PROVIDER`;
    const { errors } = parseContactsCSV(csv, knownIds);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("includes row number in error (row 2 = first data row)", () => {
    const csv = `id,household_id,first_name,last_name,*category\n,,Jane,Smith,FAMILY_FRIEND`;
    const { errors } = parseContactsCSV(csv, knownIds);
    expect(errors[0].row).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeHouseholdDiff
// ---------------------------------------------------------------------------

describe("computeHouseholdDiff", () => {
  it("detects added households (no id in incoming)", () => {
    const diff = computeHouseholdDiff(
      [{ displayName: "New Household", tags: [] }],
      [],
      []
    );
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].displayName).toBe("New Household");
  });

  it("detects removed households (in DB but not in import)", () => {
    const diff = computeHouseholdDiff(
      [],
      [makeHousehold({ id: "hh1", displayName: "Old Household" })],
      []
    );
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].id).toBe("hh1");
  });

  it("flags removed household that has FAMILY_FRIEND contacts", () => {
    const contact = makeContact({ householdId: "hh1", category: "FAMILY_FRIEND", deletedAt: null });
    const diff = computeHouseholdDiff(
      [],
      [makeHousehold({ id: "hh1" })],
      [contact]
    );
    expect(diff.removed[0].hasFamilyFriendContacts).toBe(true);
  });

  it("does not flag removed household when only non-FAMILY_FRIEND contacts", () => {
    const contact = makeContact({ householdId: "hh1", category: "SERVICE_PROVIDER", deletedAt: null });
    const diff = computeHouseholdDiff(
      [],
      [makeHousehold({ id: "hh1" })],
      [contact]
    );
    expect(diff.removed[0].hasFamilyFriendContacts).toBe(false);
  });

  it("detects updated households", () => {
    const diff = computeHouseholdDiff(
      [{ id: "hh1", displayName: "New Name", tags: [] }],
      [makeHousehold({ id: "hh1", displayName: "Old Name" })],
      []
    );
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0].before.displayName).toBe("Old Name");
    expect(diff.updated[0].after.displayName).toBe("New Name");
  });

  it("counts unchanged households", () => {
    const diff = computeHouseholdDiff(
      [{ id: "hh1", displayName: "The Smiths", tags: [] }],
      [makeHousehold({ id: "hh1", displayName: "The Smiths" })],
      []
    );
    expect(diff.unchanged).toBe(1);
    expect(diff.updated).toHaveLength(0);
  });

  it("skips already soft-deleted existing households", () => {
    const diff = computeHouseholdDiff(
      [],
      [makeHousehold({ id: "hh1", deletedAt: new Date() })],
      []
    );
    expect(diff.removed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeContactDiff
// ---------------------------------------------------------------------------

describe("computeContactDiff", () => {
  it("detects added contacts (no id in incoming)", () => {
    const diff = computeContactDiff(
      [{ firstName: "New", lastName: "Person", category: "SERVICE_PROVIDER" as const, tags: [], favorite: false }],
      []
    );
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].firstName).toBe("New");
  });

  it("detects removed contacts", () => {
    const diff = computeContactDiff(
      [],
      [makeContact({ id: "c1", firstName: "Jane", lastName: "Smith" })]
    );
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].name).toBe("Jane Smith");
  });

  it("detects updated contacts", () => {
    const diff = computeContactDiff(
      [{ id: "c1", firstName: "Jane", lastName: "Updated", category: "SERVICE_PROVIDER" as const, tags: [], favorite: false }],
      [makeContact({ id: "c1", firstName: "Jane", lastName: "Smith" })]
    );
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0].after.lastName).toBe("Updated");
  });

  it("counts unchanged contacts", () => {
    const diff = computeContactDiff(
      [{ id: "c1", firstName: "Jane", lastName: "Smith", category: "SERVICE_PROVIDER" as const, tags: [], favorite: false }],
      [makeContact({ id: "c1", firstName: "Jane", lastName: "Smith" })]
    );
    expect(diff.unchanged).toBe(1);
  });

  it("skips already soft-deleted contacts", () => {
    const diff = computeContactDiff(
      [],
      [makeContact({ id: "c1", deletedAt: new Date() })]
    );
    expect(diff.removed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Header variants and missing columns
// ---------------------------------------------------------------------------

describe("header variants", () => {
  it("accepts display_name without the leading star", () => {
    const { households, errors } = parseHouseholdsCSV("id,display_name\nh1,The Smiths\n");
    expect(errors).toEqual([]);
    expect(households[0].displayName).toBe("The Smiths");
  });

  it("reports a missing display_name column on every row", () => {
    const { errors } = parseHouseholdsCSV("id,notes\nh1,hi\n");
    expect(errors).toEqual([{ row: 2, column: "displayName", message: "display_name is required" }]);
  });

  it("accepts category without the leading star", () => {
    const { contacts, errors } = parseContactsCSV(
      "first_name,last_name,category\nJoe,Plumber,SERVICE_PROVIDER\n",
      new Set()
    );
    expect(errors).toEqual([]);
    expect(contacts[0].category).toBe("SERVICE_PROVIDER");
  });

  it("reports every missing required column for a row", () => {
    const { errors } = parseContactsCSV("notes\nhello\n", new Set());
    expect(errors.map((e) => e.column).sort()).toEqual(["category", "firstName", "lastName"]);
  });
});

// ---------------------------------------------------------------------------
// Birthdays
// ---------------------------------------------------------------------------

describe("birthday in contacts.csv", () => {
  const HEAD = "id,first_name,last_name,*category";
  const parse = (csv: string) => parseContactsCSV(csv, new Set());
  const withColumn = (...cells: string[]) => `${HEAD},birthday\n${cells.map((c, i) => `c${i + 1},Jo${i},Jones,SERVICE_PROVIDER,${c}`).join("\n")}`;
  const noColumn = `${HEAD}\nc1,Jo,Jones,SERVICE_PROVIDER`;

  describe("export", () => {
    it("has an optional birthday column (no leading star), before the important dates", () => {
      const header = contactsToCSV([makeContact()]).split("\n")[0].split(",");
      expect(header).toContain("birthday");
      expect(header).not.toContain("*birthday");
      expect(header.indexOf("birthday")).toBeLessThan(header.indexOf("important_date_1"));
    });

    it("writes YYYY-MM-DD with a year and MM-DD without one", () => {
      const rows = contactsToCSV([
        makeContact({ id: "a", birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 }),
        makeContact({ id: "b", birthdayMonth: 3, birthdayDay: 4, birthdayYear: null }),
        makeContact({ id: "c" }),
      ]);
      const { data } = parseContactsCSVRaw(rows);
      expect(data.map((r) => r.birthday)).toEqual(["1985-03-04", "03-04", ""]);
    });
  });

  describe("import", () => {
    it("reads both formats", () => {
      const { contacts, errors } = parse(withColumn("1985-03-04", "03-04"));
      expect(errors).toEqual([]);
      expect(contacts.map((c) => [c.birthdayMonth, c.birthdayDay, c.birthdayYear])).toEqual([
        [3, 4, 1985],
        [3, 4, null],
      ]);
    });

    it("round-trips an export", () => {
      const exported = contactsToCSV([
        makeContact({ id: "a", birthdayMonth: 2, birthdayDay: 29, birthdayYear: 2000 }),
        makeContact({ id: "b", birthdayMonth: 12, birthdayDay: 25, birthdayYear: null }),
      ]);
      const { contacts, errors } = parse(exported);
      expect(errors).toEqual([]);
      expect(contacts.map((c) => [c.id, c.birthdayMonth, c.birthdayDay, c.birthdayYear])).toEqual([
        ["a", 2, 29, 2000],
        ["b", 12, 25, null],
      ]);
    });

    it("a blank cell under the birthday header means no birthday (clear it)", () => {
      const { contacts } = parse(withColumn(""));
      expect(contacts[0]).toMatchObject({ birthdayMonth: null, birthdayDay: null, birthdayYear: null });
    });

    it("a file with no birthday column leaves birthdays untouched (undefined, not cleared)", () => {
      const { contacts, errors } = parse(noColumn);
      expect(errors).toEqual([]);
      expect(contacts[0].birthdayMonth).toBeUndefined();
      expect(contacts[0].birthdayDay).toBeUndefined();
      expect(contacts[0].birthdayYear).toBeUndefined();
    });

    it("names the row, column and the problem for a bad birthday", () => {
      const { contacts, errors } = parse(withColumn("1985-03-04", "March 4", "02-30", "2023-02-29", "2099-01-01"));
      expect(contacts).toHaveLength(1);
      expect(errors).toHaveLength(4);
      expect(errors.map((e) => [e.row, e.column])).toEqual([[3, "birthday"], [4, "birthday"], [5, "birthday"], [6, "birthday"]]);
      expect(errors[0].message).toContain('birthday "March 4" isn\'t in a recognised format');
      expect(errors[1].message).toBe('birthday "02-30" is not valid: February doesn\'t have 30 days');
      expect(errors[2].message).toContain("2023 isn't a leap year");
      expect(errors[3].message).toContain("The birth year must be from 1900");
    });

    it("reports a bad birthday alongside the row's other problems, once each", () => {
      const { errors } = parse(`${HEAD},birthday\nc1,,Jones,SERVICE_PROVIDER,nope`);
      expect(errors.map((e) => e.column).sort()).toEqual(["birthday", "firstName"]);
    });

    it("treats a row that stops before the birthday cell as blank", () => {
      const { contacts, errors } = parse(`${HEAD},birthday\nc1,Jo,Jones,SERVICE_PROVIDER`);
      expect(errors).toEqual([]);
      expect(contacts[0]).toMatchObject({ birthdayMonth: null, birthdayDay: null, birthdayYear: null });
    });

    it("copes with an empty file", () => {
      expect(parse("")).toEqual({ contacts: [], errors: [] });
    });

    it("allows Feb 29 with no year", () => {
      expect(parse(withColumn("02-29")).errors).toEqual([]);
    });
  });

  describe("diff", () => {
    const incoming = (over: object = {}) => ({ id: "c1", firstName: "Jane", lastName: "Smith", category: "SERVICE_PROVIDER" as const, tags: [], favorite: false, ...over });

    it("is unchanged when the file had no birthday column, whatever the contact has", () => {
      const diff = computeContactDiff([incoming()], [makeContact({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 })]);
      expect(diff.unchanged).toBe(1);
      expect(diff.updated).toHaveLength(0);
    });

    it("is an update when a birthday is added, changed or cleared", () => {
      const had = makeContact({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 });
      const cleared = computeContactDiff([incoming({ birthdayMonth: null, birthdayDay: null, birthdayYear: null })], [had]);
      expect(cleared.updated).toHaveLength(1);
      expect(cleared.updated[0].before).toMatchObject({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 });
      expect(cleared.updated[0].after).toMatchObject({ birthdayMonth: null });

      const added = computeContactDiff([incoming({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: null })], [makeContact()]);
      expect(added.updated).toHaveLength(1);

      const changed = computeContactDiff([incoming({ birthdayMonth: 3, birthdayDay: 5, birthdayYear: 1985 })], [had]);
      expect(changed.updated).toHaveLength(1);
    });

    it("is unchanged when the birthday matches", () => {
      const had = makeContact({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 });
      const diff = computeContactDiff([incoming({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 })], [had]);
      expect(diff.unchanged).toBe(1);
    });
  });
});

// Reads an exported CSV back as plain rows.
import Papa from "papaparse";
function parseContactsCSVRaw(csv: string) {
  return Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
}
