// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

// Make every antd responsive breakpoint "match" so responsive table columns render.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: vi.fn(), findUnique: vi.fn() },
    household: { findMany: vi.fn(), findUnique: vi.fn() },
    activityLogEntry: { findMany: vi.fn() },
  },
}));
vi.mock("@/app/[slug]/(app)/contacts/removed/actions", () => ({
  restoreContactAction: vi.fn(),
  restoreHouseholdAction: vi.fn(),
}));
vi.mock("@/app/[slug]/actions", () => ({ loginAction: vi.fn() }));
const seen: Record<string, any> = {};
vi.mock("@/app/[slug]/(app)/contacts/ContactsFilter", () => ({
  default: (p: any) => ((seen.filter = p), <div>filter</div>),
}));
vi.mock("@/app/[slug]/(app)/contacts/ContactsTable", () => ({
  default: (p: any) => ((seen.table = p), <div>table</div>),
}));

import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import ContactsPage from "@/app/[slug]/(app)/contacts/page";
import ContactDetailPage from "@/app/[slug]/(app)/contacts/[id]/page";
import HouseholdsPage from "@/app/[slug]/(app)/contacts/households/page";
import HouseholdDetailPage from "@/app/[slug]/(app)/contacts/households/[id]/page";
import RemovedPage from "@/app/[slug]/(app)/contacts/removed/page";
import HouseholdLoginPage from "@/app/[slug]/page";

const params = Promise.resolve({ slug: "s" });
const idParams = (id: string) => Promise.resolve({ slug: "s", id });

const contact = (over: object = {}) => ({
  id: "c1", householdId: null, firstName: "Jane", lastName: "Smith", nickname: null,
  category: "SERVICE_PROVIDER", address: null, phoneMobile: null, phoneHome: null, phoneWork: null,
  emailPrimary: null, emailSecondary: null, tags: [], favorite: false, relationshipNotes: null,
  linkedFamilyMember: null, importantDate1: null, importantDate1Label: null,
  importantDate2: null, importantDate2Label: null, notes: null, deletedAt: null,
  household: null, ...over,
});
const household = (over: object = {}) => ({
  id: "h1", displayName: "The Smiths", mailingAddress: null, tags: [], notes: null,
  urlSlug: null, deletedAt: null, contacts: [], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "mine" } as any);
  vi.mocked(prisma.activityLogEntry.findMany).mockResolvedValue([]);
});

describe("ContactsPage", () => {
  const setup = (rows: any[] = [], all: any[] = []) => {
    vi.mocked(prisma.contact.findMany).mockResolvedValueOnce(rows).mockResolvedValueOnce(all);
  };
  const run = async (filters: object = {}) =>
    render(await ContactsPage({ params, searchParams: Promise.resolve(filters) }));
  const whereOf = () => vi.mocked(prisma.contact.findMany).mock.calls[0]?.[0]?.where as any;

  it("lists active contacts with no filters and the unique sorted tags", async () => {
    setup([contact(), contact({ id: "c2" })], [{ tags: ["b", "a"] }, { tags: ["a"] }]);
    await run();
    expect(whereOf()).toEqual({ deletedAt: null });
    expect(screen.getByText("Contacts (2)")).toBeInTheDocument();
    expect(seen.filter).toMatchObject({ slug: "s", allTags: ["a", "b"], defaults: {} });
    expect(seen.table.contacts).toHaveLength(2);
  });

  it("shows no count when there are no contacts", async () => {
    setup();
    await run();
    expect(screen.getByRole("heading", { name: "Contacts" })).toBeInTheDocument();
  });

  it("builds the where clause from every filter", async () => {
    setup();
    await run({ q: "ann", category: "FAMILY_FRIEND", tag: "kid", favorites: "1" });
    const where = whereOf();
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0]).toEqual({ firstName: { contains: "ann", mode: "insensitive" } });
    expect(where.category).toBe("FAMILY_FRIEND");
    expect(where.tags).toEqual({ has: "kid" });
    expect(where.favorite).toBe(true);
  });

  it("ignores a category that is not a real category instead of failing", async () => {
    setup();
    await run({ category: "NOT_A_CATEGORY" });
    expect(whereOf()).not.toHaveProperty("category");
  });

  it("ignores favorites unless it is exactly 1", async () => {
    setup();
    await run({ favorites: "yes" });
    expect(whereOf()).not.toHaveProperty("favorite");
  });
});

describe("ContactDetailPage", () => {
  const run = async (c: any, log: any[] = []) => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(c);
    vi.mocked(prisma.activityLogEntry.findMany).mockResolvedValue(log);
    return render(await ContactDetailPage({ params: idParams("c1") }));
  };

  it("404s for an unknown contact", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null);
    await expect(ContactDetailPage({ params: idParams("nope") })).rejects.toThrow("NOT_FOUND");
  });

  it("shows every populated field for a service provider", async () => {
    await run(
      contact({
        nickname: "JJ", favorite: true, address: "9 Elm St",
        household: { id: "h1", displayName: "The Smiths", mailingAddress: null, urlSlug: null },
        phoneMobile: "111", phoneHome: "222", phoneWork: "333",
        emailPrimary: "a@x.com", emailSecondary: "b@x.com", linkedFamilyMember: "Sam",
        importantDate1: "2026-01-01", importantDate1Label: "Birthday",
        importantDate2: "2026-02-02", importantDate2Label: "Anniversary",
        tags: ["plumber", "trusted"], relationshipNotes: "Friend of Bailey", notes: "Call first",
        deletedAt: new Date(),
      })
    );
    expect(screen.getByText("(JJ)")).toBeInTheDocument();
    expect(screen.getByText("★")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("Service Provider")).toBeInTheDocument();
    expect(screen.getByText("9 Elm St")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The Smiths" })).toHaveAttribute("href", "/s/contacts/households/h1");
    for (const t of ["111", "222", "333", "a@x.com", "b@x.com", "Sam", "2026-01-01", "2026-02-02", "plumber", "trusted", "Friend of Bailey", "Call first"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    for (const l of ["Birthday", "Anniversary", "Mobile", "Home phone", "Work phone", "Primary email", "Secondary email", "Linked family member", "Tags", "Relationship notes", "Notes"]) {
      expect(screen.getByText(l)).toBeInTheDocument();
    }
  });

  it("falls back to generic labels for unlabelled dates and omits empty fields", async () => {
    await run(contact({ importantDate1: "2026-01-01", importantDate2: "2026-02-02" }));
    expect(screen.getByText("Important date 1")).toBeInTheDocument();
    expect(screen.getByText("Important date 2")).toBeInTheDocument();
    expect(screen.queryByText("Address")).not.toBeInTheDocument();
    expect(screen.queryByText("Household")).not.toBeInTheDocument();
    expect(screen.queryByText("Removed")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity log")).not.toBeInTheDocument();
    expect(screen.queryByText("★")).not.toBeInTheDocument();
  });

  it("labels a Family & Friend address as inherited from the household, with a link", async () => {
    await run(
      contact({
        category: "FAMILY_FRIEND", address: "ignored own address",
        household: { id: "h1", displayName: "The Smiths", mailingAddress: "1 Main St", urlSlug: null },
      })
    );
    expect(screen.getByText("Address (from household)")).toBeInTheDocument();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    expect(screen.queryByText("ignored own address")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The Smiths" })).toHaveAttribute("href", "/s/contacts/households/h1");
  });

  it("says so when the household has no address", async () => {
    await run(
      contact({
        category: "FAMILY_FRIEND",
        household: { id: "h1", displayName: "The Smiths", mailingAddress: null, urlSlug: null },
      })
    );
    expect(screen.getByText(/No address on household record/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The Smiths" })).toBeInTheDocument();
  });

  it("handles a Family & Friend contact with no household at all", async () => {
    await run(contact({ category: "FAMILY_FRIEND", household: null }));
    expect(screen.getByText(/No address on household record/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "The Smiths" })).not.toBeInTheDocument();
  });

  it("shows the activity log with readable actions and sources", async () => {
    await run(contact(), [
      { id: "e1", timestamp: new Date(), action: "CREATED", source: "CSV_IMPORT" },
      { id: "e2", timestamp: new Date(), action: "RESTORED", source: "MANUAL" },
    ]);
    expect(screen.getByText("Activity log")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("CSV import")).toBeInTheDocument();
    expect(screen.getByText("Restored")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
});

describe("HouseholdsPage", () => {
  it("shows an empty state", async () => {
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    render(await HouseholdsPage({ params }));
    expect(screen.getByText(/No households yet/)).toBeInTheDocument();
    expect(screen.getByText("Households (0)")).toBeInTheDocument();
  });

  it("shows cards, marks our own household, and lists members, address and tags", async () => {
    vi.mocked(prisma.household.findMany).mockResolvedValue([
      household({
        id: "mine", displayName: "Our Place", mailingAddress: "1 Main St", tags: ["home"],
        contacts: [
          { id: "c1", firstName: "Sam", lastName: "Smith" },
          { id: "c2", firstName: "Pat", lastName: "Smith" },
        ],
      }),
      household({ id: "h2", displayName: "Reynolds" }),
    ] as any);
    render(await HouseholdsPage({ params }));
    expect(screen.getByText("Households (2)")).toBeInTheDocument();
    expect(screen.getAllByText("Our household")).toHaveLength(1);
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    expect(screen.getByText("Sam Smith, Pat Smith")).toBeInTheDocument();
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reynolds/ })).toHaveAttribute("href", "/s/contacts/households/h2");
  });
});

describe("HouseholdDetailPage", () => {
  const run = async (h: any, log: any[] = [], id = "h1") => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(h);
    vi.mocked(prisma.activityLogEntry.findMany).mockResolvedValue(log);
    return render(await HouseholdDetailPage({ params: idParams(id) }));
  };

  it("404s for an unknown household", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    await expect(HouseholdDetailPage({ params: idParams("nope") })).rejects.toThrow("NOT_FOUND");
  });

  it("shows details, members, and flags our own and removed households", async () => {
    await run(
      household({
        id: "mine", mailingAddress: "1 Main St", tags: ["home"], notes: "Gate code 1234",
        deletedAt: new Date(),
        contacts: [
          { id: "c1", firstName: "Sam", lastName: "Smith", nickname: "Sammy", favorite: true, phoneMobile: "111", emailPrimary: "s@x.com" },
          { id: "c2", firstName: "Pat", lastName: "Smith", nickname: null, favorite: false, phoneMobile: null, phoneHome: "222", phoneWork: null, emailPrimary: null },
          { id: "c3", firstName: "Lee", lastName: "Smith", nickname: null, favorite: false, phoneMobile: null, phoneHome: null, phoneWork: "333", emailPrimary: null },
          { id: "c4", firstName: "Kim", lastName: "Smith", nickname: null, favorite: false, phoneMobile: null, phoneHome: null, phoneWork: null, emailPrimary: null },
        ],
      }),
      [],
      "mine"
    );
    expect(screen.getByText("Our household")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    expect(screen.getByText("Gate code 1234")).toBeInTheDocument();
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("Family & Friend contacts (4)")).toBeInTheDocument();
    expect(screen.getByText("(Sammy)")).toBeInTheDocument();
    expect(screen.getByText("★")).toBeInTheDocument();
    for (const t of ["111", "222", "333", "s@x.com"]) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("omits optional sections for a bare passive household", async () => {
    await run(household());
    expect(screen.queryByText("Our household")).not.toBeInTheDocument();
    expect(screen.queryByText("Removed")).not.toBeInTheDocument();
    expect(screen.queryByText("Mailing address")).not.toBeInTheDocument();
    expect(screen.getByText("No contacts linked to this household.")).toBeInTheDocument();
    expect(screen.queryByText("Activity log")).not.toBeInTheDocument();
  });

  it("shows the activity log", async () => {
    await run(household(), [
      { id: "e1", timestamp: new Date(), action: "UPDATED", source: "CSV_IMPORT" },
      { id: "e2", timestamp: new Date(), action: "DELETED", source: "MANUAL" },
    ]);
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    expect(screen.getByText("CSV import")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
});

describe("RemovedPage", () => {
  it("shows empty tables when nothing was removed", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.household.findMany).mockResolvedValue([]);
    render(await RemovedPage({ params }));
    expect(screen.getByText("No removed contacts.")).toBeInTheDocument();
    expect(screen.getByText("No removed households.")).toBeInTheDocument();
  });

  it("lists removed items with restore buttons", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      contact({ id: "c1", deletedAt: new Date("2026-03-04T12:00:00Z") }),
    ] as any);
    vi.mocked(prisma.household.findMany).mockResolvedValue([
      household({ id: "h1", displayName: "Old Family", deletedAt: new Date("2026-03-05T12:00:00Z") }),
    ] as any);
    render(await RemovedPage({ params }));
    expect(screen.getByText("Contacts (1)")).toBeInTheDocument();
    expect(screen.getByText("Households (1)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jane Smith" })).toHaveAttribute("href", "/s/contacts/c1");
    expect(screen.getByRole("link", { name: "Old Family" })).toHaveAttribute("href", "/s/contacts/households/h1");
    expect(screen.getByText(new Date("2026-03-04T12:00:00Z").toLocaleDateString())).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
    const row = screen.getByText("Jane Smith").closest("tr") as HTMLElement;
    expect(within(row).getByText("SERVICE_PROVIDER")).toBeInTheDocument();
  });
});

describe("HouseholdLoginPage", () => {
  const dbHousehold = { id: "h1", displayName: "The Smiths", passwordHash: "x", deletedAt: null };
  const run = (error?: string) => HouseholdLoginPage({ params, searchParams: Promise.resolve({ error }) });

  it("404s for an unknown slug, a non-account household, and a removed one", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValueOnce(null);
    await expect(run()).rejects.toThrow("NOT_FOUND");
    vi.mocked(prisma.household.findUnique).mockResolvedValueOnce({ ...dbHousehold, passwordHash: null } as any);
    await expect(run()).rejects.toThrow("NOT_FOUND");
    vi.mocked(prisma.household.findUnique).mockResolvedValueOnce({ ...dbHousehold, deletedAt: new Date() } as any);
    await expect(run()).rejects.toThrow("NOT_FOUND");
  });

  it("sends an already-logged-in household straight to its contacts", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(dbHousehold as any);
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
    await expect(run()).rejects.toThrow("REDIRECT:/s/contacts");
  });

  it("shows the password form", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(dbHousehold as any);
    render(await run());
    expect(screen.getByText("The Smiths")).toBeInTheDocument();
    expect(document.querySelector("input[type=password]")).toBeRequired();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error from the URL", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(dbHousehold as any);
    render(await run("Incorrect password"));
    expect(screen.getByText("Incorrect password")).toBeInTheDocument();
  });
});
