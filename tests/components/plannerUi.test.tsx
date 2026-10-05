// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
let pathname = "/meals";
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => pathname }));
vi.mock("@/app/(app)/meals/actions", () => ({
  addPlanEntryAction: vi.fn(),
  addOneOffEntryAction: vi.fn(),
  createMealAndAddAction: vi.fn(),
  moveEntryAction: vi.fn(),
  removeEntryAction: vi.fn(),
  updateMealPlanSettingsAction: vi.fn(),
}));

import PlannerClient, { LIST_LAYOUT_QUERY } from "@/app/(app)/meals/PlannerClient";
import EntryDetailDialog from "@/app/(app)/meals/EntryDetailDialog";
import MealsNav from "@/components/MealsNav";
import {
  addOneOffEntryAction,
  addPlanEntryAction,
  createMealAndAddAction,
  moveEntryAction,
  removeEntryAction,
  updateMealPlanSettingsAction,
} from "@/app/(app)/meals/actions";

const settings = { weekStartsOn: "SUNDAY" as const, showBreakfast: false, showLunch: true, showDinner: true };
const entries = [
  { id: "e1", date: "2026-10-05", slot: "DINNER" as const, mealId: "m1", label: "Tacos", description: "Line one\n  <b>fry</b>" },
  { id: "e2", date: "2026-10-05", slot: "DINNER" as const, mealId: "m2", label: "Rice", description: null },
  { id: "e3", date: "2026-10-06", slot: "LUNCH" as const, mealId: null, label: "Leftovers", description: null },
];
const meals = [
  { id: "m1", name: "Tacos" },
  { id: "m2", name: "Rice" },
  { id: "m3", name: "Chili" },
];
const stats = { m1: { lastMade: "2026-09-28", timesMade: 4 }, m2: { lastMade: null, timesMade: 0 } };

type Props = React.ComponentProps<typeof PlannerClient>;
const setup = (over: Partial<Props> = {}) =>
  render(
    <App>
      <PlannerClient weekStart="2026-10-04" today="2026-10-07" settings={settings} entries={entries} hiddenCount={0} meals={meals} stats={stats} {...over} />
    </App>
  );

beforeEach(() => {
  vi.resetAllMocks();
  pathname = "/meals";
  vi.mocked(updateMealPlanSettingsAction).mockResolvedValue({ ok: true });
  vi.mocked(addPlanEntryAction).mockResolvedValue({ ok: true, entryId: "n" });
  vi.mocked(addOneOffEntryAction).mockResolvedValue({ ok: true, entryId: "n" });
  vi.mocked(createMealAndAddAction).mockResolvedValue({ ok: true, entryId: "n", mealId: "x", created: true });
  vi.mocked(moveEntryAction).mockResolvedValue({ ok: true });
  vi.mocked(removeEntryAction).mockResolvedValue({ ok: true });
});

describe("the week and its navigation", () => {
  it("shows the week range, seven days, and today highlighted", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Oct 4 – 10, 2026" })).toBeInTheDocument();
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) expect(screen.getByText(day)).toBeInTheDocument();
    const today = screen.getByText("Wed").closest(".planner-day")!;
    expect(today).toHaveAttribute("data-today");
    expect(today).toHaveTextContent("Today");
    expect(screen.getByText("Mon").closest(".planner-day")).not.toHaveAttribute("data-today");
  });

  it("links to the previous and next week, carrying the browser's today", () => {
    setup();
    expect(screen.getByRole("link", { name: "Previous week" })).toHaveAttribute("href", "/meals?week=2026-09-27&today=2026-10-07");
    expect(screen.getByRole("link", { name: "Next week" })).toHaveAttribute("href", "/meals?week=2026-10-11&today=2026-10-07");
  });

  it("has no 'This week' button on the current week, and one elsewhere", () => {
    const { unmount } = setup();
    expect(screen.queryByRole("link", { name: "This week" })).toBeNull();
    unmount();
    setup({ weekStart: "2026-10-18" });
    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute("href", "/meals?today=2026-10-07");
    expect(screen.getByRole("heading", { name: "Oct 18 – 24, 2026" })).toBeInTheDocument();
  });

  it("knows the current week for a Monday-start household too", () => {
    // Sunday 4 Oct belongs to the week that began Monday 28 Sep.
    setup({ weekStart: "2026-09-28", today: "2026-10-04", settings: { ...settings, weekStartsOn: "MONDAY" }, entries: [] });
    expect(screen.queryByRole("link", { name: "This week" })).toBeNull();
    expect(screen.getByText("Sun", { selector: "strong" }).closest(".planner-day")).toHaveAttribute("data-today");
  });

  it("names both months for a week that spans two", () => {
    setup({ weekStart: "2026-09-27", today: "2026-10-01", entries: [] });
    expect(screen.getByRole("heading", { name: "Sep 27 – Oct 3, 2026" })).toBeInTheDocument();
  });
});

describe("the grid", () => {
  it("shows a row per visible slot, with entries in their cells in the order given", () => {
    setup();
    const monDinner = document.querySelectorAll('.planner-cell[data-slot="DINNER"]')[1] as HTMLElement;
    expect([...monDinner.querySelectorAll(".plan-entry")].map((b) => b.textContent)).toEqual(["Tacos", "Rice"]);
    const tueLunch = document.querySelectorAll('.planner-cell[data-slot="LUNCH"]')[2] as HTMLElement;
    expect(within(tueLunch).getByText("Leftovers")).toBeInTheDocument();
    expect(document.querySelectorAll('.planner-cell[data-slot="BREAKFAST"]')).toHaveLength(0);
    expect(document.querySelectorAll(".planner-cell")).toHaveLength(14);
    expect(document.querySelector(".planner")).toHaveStyle({ "--planner-rows": "2" });
  });

  it("adds a Breakfast row when breakfast is switched on", () => {
    setup({ settings: { ...settings, showBreakfast: true } });
    expect(document.querySelectorAll('.planner-cell[data-slot="BREAKFAST"]')).toHaveLength(7);
    expect(document.querySelector(".planner")).toHaveStyle({ "--planner-rows": "3" });
  });

  it("notes entries hidden in a turned-off meal", () => {
    const { unmount } = setup({ hiddenCount: 1 });
    expect(screen.getByText(/1 hidden entry this week/)).toBeInTheDocument();
    unmount();
    setup({ hiddenCount: 3 });
    expect(screen.getByText(/3 hidden entries this week/)).toBeInTheDocument();
  });

  it("says nothing about hidden entries when there are none", () => {
    setup();
    expect(screen.queryByText(/hidden/)).toBeNull();
  });
});

describe("today on a narrow screen", () => {
  const original = window.matchMedia;
  const scrolled = vi.fn();
  beforeEach(() => {
    scrolled.mockClear();
    window.HTMLElement.prototype.scrollIntoView = scrolled;
  });
  afterEach(() => {
    window.matchMedia = original;
  });
  const narrow = (matches: boolean) => {
    window.matchMedia = ((q: string) => ({ matches: matches && q === LIST_LAYOUT_QUERY, media: q, addEventListener() {}, removeEventListener() {} })) as any;
  };

  it("is scrolled into view on the current week", () => {
    narrow(true);
    setup();
    expect(scrolled).toHaveBeenCalledWith({ block: "start" });
  });

  it("is left alone on a wide screen, and when viewing another week", () => {
    narrow(false);
    setup();
    narrow(true);
    setup({ weekStart: "2026-10-18" });
    expect(scrolled).not.toHaveBeenCalled();
  });
});

describe("meal toggles and settings", () => {
  it("shows which meals are on, and switches one", async () => {
    setup();
    expect(screen.getByRole("button", { name: "Breakfast" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Lunch" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Breakfast" }));
    expect(updateMealPlanSettingsAction).toHaveBeenCalledWith({ showBreakfast: true });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("turns one off while another stays on", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Lunch" }));
    expect(updateMealPlanSettingsAction).toHaveBeenCalledWith({ showLunch: false });
  });

  it("won't let the last visible meal be switched off", () => {
    setup({ settings: { ...settings, showLunch: false } });
    expect(screen.getByRole("button", { name: "Dinner" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lunch" })).toBeEnabled();
  });

  it("shows the reason and doesn't refresh when the server refuses", async () => {
    vi.mocked(updateMealPlanSettingsAction).mockResolvedValue({ ok: false, error: "Keep at least one meal visible" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Breakfast" }));
    expect(await screen.findByText("Keep at least one meal visible")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("changes the week's first day from the settings popover", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Planner settings" }));
    expect(await screen.findByText("Settings are shared by your whole household.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "Week starts on" }));
    await userEvent.click(await screen.findByTitle("Monday"));
    expect(updateMealPlanSettingsAction).toHaveBeenCalledWith({ weekStartsOn: "MONDAY" });
  });
});

describe("adding to a cell", () => {
  const openMonDinner = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Add to Dinner on Mon Oct 5" }));
    return within(await screen.findByRole("dialog"));
  };

  it("opens for the chosen cell and lists library meals", async () => {
    setup();
    const dialog = await openMonDinner();
    expect(screen.getByText("Add to Dinner, Mon Oct 5")).toBeInTheDocument();
    for (const name of ["Tacos", "Rice", "Chili"]) expect(dialog.getByRole("button", { name })).toBeInTheDocument();
  });

  it("picking a library meal adds it, closes, and refreshes", async () => {
    setup();
    const dialog = await openMonDinner();
    await userEvent.click(dialog.getByRole("button", { name: "Chili" }));
    await waitFor(() => expect(addPlanEntryAction).toHaveBeenCalledWith("2026-10-05", "DINNER", "m3"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("filters as you type, ignoring case", async () => {
    setup();
    const dialog = await openMonDinner();
    await userEvent.type(dialog.getByLabelText("Meal"), "  CH");
    expect(dialog.getByRole("button", { name: "Chili" })).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Tacos" })).toBeNull();
  });

  it("offers to create a new name from what was typed, and does", async () => {
    setup();
    const dialog = await openMonDinner();
    await userEvent.type(dialog.getByLabelText("Meal"), "  Pad thai ");
    await userEvent.click(dialog.getByRole("button", { name: /Create .Pad thai. and add/ }));
    await waitFor(() => expect(createMealAndAddAction).toHaveBeenCalledWith("2026-10-05", "DINNER", "Pad thai"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it("or adds what was typed as a one-off that isn't saved", async () => {
    setup();
    const dialog = await openMonDinner();
    await userEvent.type(dialog.getByLabelText("Meal"), "Leftovers");
    await userEvent.click(dialog.getByRole("button", { name: "Add as one-off (not saved to library)" }));
    await waitFor(() => expect(addOneOffEntryAction).toHaveBeenCalledWith("2026-10-05", "DINNER", "Leftovers"));
  });

  it("a typed name that matches a library meal selects it instead of offering to create a duplicate", async () => {
    setup();
    const dialog = await openMonDinner();
    await userEvent.type(dialog.getByLabelText("Meal"), "tACOS");
    expect(dialog.queryByRole("button", { name: /Create/ })).toBeNull();
    expect(dialog.getByRole("button", { name: "Tacos" })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Add as one-off (not saved to library)" })).toBeInTheDocument();
    await userEvent.type(dialog.getByLabelText("Meal"), "{Enter}");
    await waitFor(() => expect(addPlanEntryAction).toHaveBeenCalledWith("2026-10-05", "DINNER", "m1"));
    expect(createMealAndAddAction).not.toHaveBeenCalled();
  });

  it("Enter creates a new name, and does nothing on an empty box", async () => {
    setup();
    const dialog = await openMonDinner();
    await userEvent.type(dialog.getByLabelText("Meal"), "{Enter}");
    expect(createMealAndAddAction).not.toHaveBeenCalled();
    await userEvent.type(dialog.getByLabelText("Meal"), "Soup{Enter}");
    await waitFor(() => expect(createMealAndAddAction).toHaveBeenCalledWith("2026-10-05", "DINNER", "Soup"));
  });

  it("shows the reason and stays open when adding fails", async () => {
    vi.mocked(addPlanEntryAction).mockResolvedValue({ ok: false, error: "Meal not found" });
    setup();
    const dialog = await openMonDinner();
    await userEvent.click(dialog.getByRole("button", { name: "Chili" }));
    expect(await screen.findByText("Meal not found")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("explains an empty library, and trims a long list", async () => {
    const { unmount } = setup({ meals: [] });
    let dialog = await openMonDinner();
    expect(dialog.getByText(/Your library is empty/)).toBeInTheDocument();
    unmount();
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, name: `Meal ${String(i).padStart(2, "0")}` }));
    setup({ meals: many });
    dialog = await openMonDinner();
    expect(dialog.getAllByRole("button", { name: /^Meal \d\d$/ })).toHaveLength(8);
    expect(dialog.getByText("Showing 8 of 12. Type to narrow it down.")).toBeInTheDocument();
  });

  it("closes with Cancel", async () => {
    setup();
    const dialog = await openMonDinner();
    await userEvent.click(dialog.getAllByRole("button", { name: "Cancel" })[0]);
    expect(addPlanEntryAction).not.toHaveBeenCalled();
    expect(createMealAndAddAction).not.toHaveBeenCalled();
  });
});

describe("an entry's detail", () => {
  const open = async (name: string) => {
    await userEvent.click(screen.getByRole("button", { name }));
    return within(await screen.findByRole("dialog"));
  };

  it("shows a meal's description as plain text, with last made and times made", async () => {
    setup();
    const dialog = await open("Tacos");
    expect(dialog.getByText("Dinner, Mon Oct 5 · Last made Sep 28, 2026 · 4 times")).toBeInTheDocument();
    const body = dialog.getByText(/Line one/);
    expect(body.textContent).toBe("Line one\n  <b>fry</b>");
    expect(body).toHaveStyle({ whiteSpace: "pre-wrap" });
    expect(document.querySelector(".ant-modal b")).toBeNull();
    expect(dialog.getByRole("link", { name: "Edit meal" })).toHaveAttribute("href", "/meals/library/m1/edit");
  });

  it("says '1 time' for a meal made once", async () => {
    setup({ stats: { m1: { lastMade: "2026-09-28", timesMade: 1 } } });
    const dialog = await open("Tacos");
    expect(dialog.getByText("Dinner, Mon Oct 5 \u00b7 Last made Sep 28, 2026 \u00b7 1 time")).toBeInTheDocument();
  });

  it("says when a meal was never made", async () => {
    setup();
    const dialog = await open("Rice");
    expect(dialog.getByText("Dinner, Mon Oct 5 · Never made · 0 times")).toBeInTheDocument();
  });

  it("shows a one-off as such, with no meal actions", async () => {
    setup();
    const dialog = await open("Leftovers");
    expect(dialog.getByText("Lunch, Tue Oct 6 · One-off, not in your library")).toBeInTheDocument();
    expect(dialog.queryByRole("link", { name: "Edit meal" })).toBeNull();
  });

  it("handles a meal whose stats aren't known", async () => {
    setup({ stats: {} });
    const dialog = await open("Tacos");
    expect(dialog.getByText("Dinner, Mon Oct 5")).toBeInTheDocument();
  });

  it("moves an entry to another date and slot", async () => {
    setup();
    const dialog = await open("Tacos");
    const move = dialog.getByRole("button", { name: "Move" });
    expect(move).toBeDisabled();
    const date = dialog.getByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-09");
    await userEvent.click(dialog.getByRole("combobox", { name: "Meal of the day" }));
    await userEvent.click(await screen.findByTitle("Lunch"));
    await userEvent.click(move);
    await waitFor(() => expect(moveEntryAction).toHaveBeenCalledWith("e1", "2026-10-09", "LUNCH"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("won't try to move to a date that isn't one", async () => {
    setup();
    const dialog = await open("Tacos");
    const date = dialog.getByLabelText("Date");
    await userEvent.clear(date);
    expect(dialog.getByRole("button", { name: "Move" })).toBeDisabled();
  });

  it("shows the reason when a move fails", async () => {
    vi.mocked(moveEntryAction).mockResolvedValue({ ok: false, error: "That entry isn't on your plan any more" });
    setup();
    const dialog = await open("Tacos");
    await userEvent.click(dialog.getByRole("combobox", { name: "Meal of the day" }));
    await userEvent.click(await screen.findByTitle("Lunch"));
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    expect(await screen.findByText("That entry isn't on your plan any more")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("removes an entry from the plan after confirming", async () => {
    setup();
    const dialog = await open("Leftovers");
    await userEvent.click(dialog.getByRole("button", { name: "Remove from plan" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removeEntryAction).toHaveBeenCalledWith("e3"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("forgets an unsaved date when shown for a different entry", async () => {
    const wrap = (entry: (typeof entries)[number] | null) => (
      <App>
        <EntryDetailDialog entry={entry} stats={null} onClose={() => {}} />
      </App>
    );
    const { rerender } = render(wrap(entries[0]));
    const date = await screen.findByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-09");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-09");
    rerender(wrap(entries[1]));
    expect(await screen.findByLabelText("Date")).toHaveValue("2026-10-05");
    rerender(wrap(null));
  });
});

describe("MealsNav", () => {
  it("links Planner and Library, marking the current one", () => {
    pathname = "/meals";
    const { unmount } = render(<MealsNav />);
    expect(screen.getByRole("link", { name: "Planner" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-current");
    unmount();
    pathname = "/meals/library/abc";
    render(<MealsNav />);
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Planner" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/meals/library");
  });

  it("has no current link elsewhere", () => {
    pathname = "/lists";
    render(<MealsNav />);
    expect(screen.getAllByRole("link").some((a) => a.getAttribute("aria-current") === "page")).toBe(false);
  });
});
