import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);

vi.mock("@/lib/db", () => ({
  prisma: {
    household: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
    },
  },
}));

import { GET } from "@/app/[slug]/(app)/contacts/api/export/route";
import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";

function makeRequest(slug: string, file?: string) {
  const url = `http://localhost/${slug}/contacts/api/export${file ? `?file=${file}` : ""}`;
  return new NextRequest(url);
}

const SLUG = "reynolds-family";
const HH_ID = "hh1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /[slug]/contacts/api/export", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);

    const res = await GET(makeRequest(SLUG, "households"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when file param is missing", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: HH_ID } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: HH_ID } as any);

    const res = await GET(makeRequest(SLUG));
    expect(res.status).toBe(400);
  });

  it("returns 400 when file param is unknown value", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: HH_ID } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: HH_ID } as any);

    const res = await GET(makeRequest(SLUG, "users"));
    expect(res.status).toBe(400);
  });

  it("returns households CSV with correct headers", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: HH_ID } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: HH_ID } as any);
    vi.mocked(prisma.household.findMany).mockResolvedValue([
      { id: HH_ID, displayName: "The Reynolds Family", mailingAddress: null, tags: [], notes: null },
    ] as any);

    const res = await GET(makeRequest(SLUG, "households"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("households.csv");

    const body = await res.text();
    expect(body).toContain("The Reynolds Family");
    expect(body).toContain("*display_name");
  });

  it("households CSV never includes urlSlug or passwordHash", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: HH_ID } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: HH_ID } as any);
    vi.mocked(prisma.household.findMany).mockResolvedValue([
      { id: HH_ID, displayName: "Test", mailingAddress: null, tags: [], notes: null },
    ] as any);

    const res = await GET(makeRequest(SLUG, "households"));
    const body = await res.text();
    expect(body).not.toContain("urlSlug");
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("password");
  });

  it("returns contacts CSV with correct headers", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: HH_ID } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ id: HH_ID } as any);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      {
        id: "c1", householdId: null, firstName: "Joe", lastName: "Plumber",
        nickname: null, category: "SERVICE_PROVIDER", address: null,
        phoneMobile: null, phoneHome: null, phoneWork: null,
        emailPrimary: null, emailSecondary: null, tags: [], favorite: false,
        relationshipNotes: null, linkedFamilyMember: null,
        importantDate1: null, importantDate1Label: null,
        importantDate2: null, importantDate2Label: null, notes: null,
      },
    ] as any);

    const res = await GET(makeRequest(SLUG, "contacts"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("contacts.csv");

    const body = await res.text();
    expect(body).toContain("Joe");
    expect(body).toContain("Plumber");
    expect(body).toContain("*category");
  });
});
