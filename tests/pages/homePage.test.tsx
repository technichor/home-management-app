// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ pageMember: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { contact: { findMany: vi.fn() } } }));
vi.mock("@/lib/mealPlan", async (orig) => ({ ...(await orig<typeof import("@/lib/mealPlan")>()), getMealPlanSettings: vi.fn(), weekEntries: vi.fn() }));
vi.mock("@/lib/homeAttention", () => ({ loadAttention: vi.fn() }));
vi.mock("@/components/LocalToday", () => ({ default: () => <i data-testid="local-today" /> }));

import { prisma } from "@/lib/db";
import { pageMember } from "@/lib/auth";
import { getMealPlanSettings, weekEntries } from "@/lib/mealPlan";
import { loadAttention } from "@/lib/homeAttention";
import HomePage from "@/app/(app)/home/page";

const me = (role = "OWNER") => ({ id: "u1", firstName: "Sam", role, householdId: "h1", household: { displayName: "The Smiths" } });
const settings = (over: object = {}) => ({ weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: true, showDinner: true, ...over });
const run = async (sp: object = { today: "2026-10-07" }) => render(await HomePage({ searchParams: Promise.resolve(sp) }));
const entry = (date: string, slot: string, label: string, over: object = {}) => ({ id: `${date}${slot}${label}`, date, slot, mealId: "m", label, description: null, ...over });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(pageMember).mockResolvedValue(me() as any);
  vi.mocked(getMealPlanSettings).mockResolvedValue(settings() as any);
  vi.mocked(weekEntries).mockResolvedValue([]);
  vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
  vi.mocked(loadAttention).mockResolvedValue([]);
});

describe("HomePage", () => {
  it("waits for the browser's date before showing a week", async () => {
    await run({});
    expect(screen.getByTestId("local-today")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    await run({ today: "yesterday" });
    expect(weekEntries).not.toHaveBeenCalled();
  });

  it("shows the week of the browser's today as an empty, flat week with calm empty states", async () => {
    await run();
    expect(screen.getByText("Week of Oct 4 – 10, 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nothing is planned this week yet, Sam.");
    expect(screen.getByText("Nothing needs attention")).toBeInTheDocument();
    expect(screen.getAllByText("Open")).toHaveLength(7);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringContaining("Sunday: open"));
    expect(screen.queryByText("Coming up")).toBeNull();
    expect(vi.mocked(weekEntries)).toHaveBeenCalledWith("h1", "2026-10-04");
  });

  it("starts the week on Monday for a household that chose that", async () => {
    vi.mocked(getMealPlanSettings).mockResolvedValue(settings({ weekStartsOn: "MONDAY" }) as any);
    await run({ today: "2026-10-04" });
    expect(weekEntries).toHaveBeenCalledWith("h1", "2026-09-28");
    expect(screen.getByText("Week of Sep 28 – Oct 4, 2026")).toBeInTheDocument();
  });

  it("builds the headline, stretches and day rows from the household's meals, in the shown slots only", async () => {
    vi.mocked(weekEntries).mockResolvedValue([
      entry("2026-10-05", "DINNER", "Tacos"),
      entry("2026-10-05", "LUNCH", "Soup"),
      entry("2026-10-06", "DINNER", "Pasta"),
      entry("2026-10-06", "BREAKFAST", "Eggs"), // breakfast is hidden
    ] as any);
    await run();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("A light week, Sam, with the most planned on Monday.");
    const rows = screen.getAllByRole("link").filter((l) => l.classList.contains("brief-row") && l.hasAttribute("data-open") === false);
    expect(within(rows[0]).getByText("Tacos")).toBeInTheDocument();
    expect(screen.getByText("Lunch: Soup. Dinner: Tacos.")).toBeInTheDocument();
    expect(screen.queryByText(/Eggs/)).toBeNull();
    expect(screen.getByText("Tue – Thu")).toBeInTheDocument();
  });

  it("marks today's row, and links each day to that week's planner carrying the date", async () => {
    await run();
    const today = document.querySelector('[data-today]') as HTMLElement;
    expect(today).toHaveTextContent("Wed");
    expect(today).toHaveTextContent("(today)");
    expect(today).toHaveAttribute("href", "/meals?week=2026-10-04&today=2026-10-07");
  });

  it("uses contacts' important dates that fall in the week, for the week's own days", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: "c1", firstName: "Jo", lastName: "Jones", importantDate1: "1990-10-08", importantDate1Label: "Birthday", importantDate2: null, importantDate2Label: null },
    ] as any);
    await run();
    expect(screen.getByText("Jo Jones's birthday")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("most planned on Thursday");
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]!.where).toMatchObject({ deletedAt: null });
  });

  it("lists dates after this week under Coming up, with how far away, linking to the contact", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: "c2", firstName: "Kim", lastName: "Wu", importantDate1: "1985-10-21", importantDate1Label: null, importantDate2: null, importantDate2Label: null },
      { id: "c3", firstName: "Al", lastName: "Lee", importantDate1: "2001-10-12", importantDate1Label: "Anniversary", importantDate2: null, importantDate2Label: null },
    ] as any);
    await run();
    const section = screen.getByText("Coming up").closest("section") as HTMLElement;
    const links = within(section).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/contacts/c3", "/contacts/c2"]);
    expect(within(section).getByText("Al Lee's anniversary")).toBeInTheDocument();
    expect(within(section).getByText("In 5 days.")).toBeInTheDocument();
    expect(within(section).getByText("Kim Wu's important date")).toBeInTheDocument();
    expect(within(section).getByText("Oct 12")).toBeInTheDocument();
  });

  it("lists what needs attention, numbered, each linking where the work is", async () => {
    vi.mocked(loadAttention).mockResolvedValue([
      { key: "a", title: "Weekend plans has 2 unread messages", support: "In Messages.", href: "/messages/c1" },
      { key: "b", title: "Ann Ray asked to join your household", support: "On the Household page.", href: "/household" },
    ]);
    await run();
    const section = screen.getByText("Needs attention").closest("section") as HTMLElement;
    const links = within(section).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/messages/c1", "/household"]);
    expect(links[0]).toHaveTextContent("1");
    expect(links[1]).toHaveTextContent("2");
    expect(within(section).queryByText("Nothing needs attention")).toBeNull();
    expect(loadAttention).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", role: "OWNER", householdId: "h1" }));
  });
});
