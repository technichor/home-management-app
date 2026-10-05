// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/meals/library",
  useSearchParams: () => params,
}));
vi.mock("@/app/(app)/meals/actions", () => ({
  createMealAction: vi.fn(),
  updateMealAction: vi.fn(),
  deleteMealAction: vi.fn(),
}));

import LibraryClient, { type LibraryMeal } from "@/app/(app)/meals/library/LibraryClient";
import MealForm from "@/app/(app)/meals/library/MealForm";
import MealDetailClient from "@/app/(app)/meals/library/[id]/MealDetailClient";
import LocalToday from "@/components/LocalToday";
import { createMealAction, deleteMealAction, updateMealAction } from "@/app/(app)/meals/actions";
import { localDateString } from "@/lib/dates";

beforeEach(() => {
  vi.resetAllMocks();
  params = new URLSearchParams();
});

const meals: LibraryMeal[] = [
  { id: "a", name: "Tacos", lastMade: "2026-10-01", timesMade: 3 },
  { id: "b", name: "Soup", lastMade: "2026-09-01", timesMade: 9 },
  { id: "c", name: "Apple pie", lastMade: null, timesMade: 0 },
  { id: "d", name: "Chili", lastMade: "2026-09-01", timesMade: 1 },
];
const names = () => screen.getAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/meals/library/") && l.getAttribute("href") !== "/meals/library/new").map((l) => l.textContent!.split(/Last made|Never made/)[0]);

describe("LibraryClient", () => {
  it("lists meals by name with last made and times made, and links to each", () => {
    render(<LibraryClient meals={meals} />);
    expect(names()).toEqual(["Apple pie", "Chili", "Soup", "Tacos"]);
    expect(screen.getByRole("link", { name: /Tacos/ })).toHaveAttribute("href", "/meals/library/a");
    expect(screen.getByText("Last made Oct 1, 2026 · 3 times")).toBeInTheDocument();
    expect(screen.getByText("Never made · 0 times")).toBeInTheDocument();
    expect(screen.getByText("Last made Sep 1, 2026 · 1 time")).toBeInTheDocument();
    expect(screen.getByText("Meal library (4)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New meal" })).toHaveAttribute("href", "/meals/library/new");
  });

  it("searches by name, ignoring case", async () => {
    render(<LibraryClient meals={meals} />);
    await userEvent.type(screen.getByLabelText("Search meals"), "  CH ");
    expect(names()).toEqual(["Chili"]);
    await userEvent.clear(screen.getByLabelText("Search meals"));
    await userEvent.type(screen.getByLabelText("Search meals"), "zzz");
    expect(screen.getByText(/No meal matches/)).toBeInTheDocument();
  });

  it("sorts by last made (never made last, ties by name) and by most made", async () => {
    render(<LibraryClient meals={meals} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Sort by" }));
    await userEvent.click(await screen.findByTitle("Sort by last made"));
    expect(names()).toEqual(["Tacos", "Chili", "Soup", "Apple pie"]);
    await userEvent.click(screen.getByRole("combobox", { name: "Sort by" }));
    await userEvent.click(await screen.findByTitle("Sort by most made"));
    expect(names()).toEqual(["Soup", "Tacos", "Chili", "Apple pie"]);
  });

  it("ties on times made fall back to the name", async () => {
    render(<LibraryClient meals={[{ id: "x", name: "B", lastMade: null, timesMade: 2 }, { id: "y", name: "A", lastMade: null, timesMade: 2 }]} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Sort by" }));
    await userEvent.click(await screen.findByTitle("Sort by most made"));
    expect(names()).toEqual(["A", "B"]);
  });

  it("explains an empty library and hides the search", () => {
    render(<LibraryClient meals={[]} />);
    expect(screen.getByText(/No meals yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Search meals")).toBeNull();
  });
});

describe("MealForm", () => {
  it("creates a meal and opens it", async () => {
    vi.mocked(createMealAction).mockResolvedValue({ ok: true, id: "new1" });
    render(<MealForm />);
    const save = screen.getByRole("button", { name: "Add meal" });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Name"), "Pad thai");
    await userEvent.type(screen.getByLabelText("Description"), "Soak noodles");
    await userEvent.click(save);
    await waitFor(() => expect(createMealAction).toHaveBeenCalledWith("Pad thai", "Soak noodles"));
    expect(router.push).toHaveBeenCalledWith("/meals/library/new1");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/meals/library");
  });

  it("edits a meal and returns to it", async () => {
    vi.mocked(updateMealAction).mockResolvedValue({ ok: true });
    render(<MealForm meal={{ id: "m1", name: "Tacos", description: null }} />);
    expect(screen.getByLabelText("Name")).toHaveValue("Tacos");
    await userEvent.type(screen.getByLabelText("Name"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateMealAction).toHaveBeenCalledWith("m1", "Tacos!", ""));
    expect(router.push).toHaveBeenCalledWith("/meals/library/m1");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/meals/library/m1");
  });

  it("shows the reason and stays put when saving fails (create and edit)", async () => {
    vi.mocked(createMealAction).mockResolvedValue({ ok: false, error: '"Pad thai" is already in your library' });
    const { unmount } = render(<MealForm />);
    await userEvent.type(screen.getByLabelText("Name"), "Pad thai");
    await userEvent.click(screen.getByRole("button", { name: "Add meal" }));
    expect(await screen.findByText('"Pad thai" is already in your library')).toBeInTheDocument();
    unmount();
    vi.mocked(updateMealAction).mockResolvedValue({ ok: false, error: "Meal not found" });
    render(<MealForm meal={{ id: "m1", name: "Tacos", description: "x" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Meal not found")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("MealDetailClient", () => {
  const meal = { id: "m1", name: "Tacos", description: "Line one\n  indented <b>not bold</b>" };
  const setup = (over: Partial<React.ComponentProps<typeof MealDetailClient>> = {}) =>
    render(<MealDetailClient meal={meal} lastMade="2026-10-01" timesMade={1} entryCount={0} {...over} />);

  it("shows the description as plain text with its whitespace, never as HTML", () => {
    const { container } = setup();
    const body = screen.getByText(/Line one/);
    expect(body).toHaveStyle({ whiteSpace: "pre-wrap" });
    expect(body.textContent).toBe("Line one\n  indented <b>not bold</b>");
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("Last made Oct 1, 2026 · 1 time")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/meals/library/m1/edit");
  });

  it("handles a meal with no description and no history", () => {
    setup({ meal: { ...meal, description: null }, lastMade: null, timesMade: 4 });
    expect(screen.getByText("No description.")).toBeInTheDocument();
    expect(screen.getByText("Never made · 4 times")).toBeInTheDocument();
  });

  it.each([
    [0, "It isn't on any plan."],
    [1, '1 planned entry uses this meal. It will stay on the plan as a one-off entry named "Tacos".'],
    [3, '3 planned entries use this meal. They will stay on the plan as one-off entries named "Tacos".'],
  ])("the delete confirm for %s entries says what happens", async (count, text) => {
    setup({ entryCount: count });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("deletes after confirming, then returns to the library", async () => {
    vi.mocked(deleteMealAction).mockResolvedValue({ ok: true, converted: 0 });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMealAction).toHaveBeenCalledWith("m1"));
    expect(router.push).toHaveBeenCalledWith("/meals/library");
  });

  it("shows the reason when deleting fails, and can dismiss it", async () => {
    vi.mocked(deleteMealAction).mockResolvedValue({ ok: false, error: "Meal not found" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Meal not found")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByText("Meal not found")).toBeNull());
  });
});

describe("LocalToday", () => {
  it("puts the device's date in the URL when it is missing, keeping other parameters", () => {
    params = new URLSearchParams("sort=name");
    render(<LocalToday />);
    expect(router.replace).toHaveBeenCalledWith(`/meals/library?sort=name&today=${localDateString()}`, { scroll: false });
  });

  it("replaces a stale date (it is a new day)", () => {
    params = new URLSearchParams("today=2001-01-01");
    render(<LocalToday />);
    expect(router.replace).toHaveBeenCalledWith(`/meals/library?today=${localDateString()}`, { scroll: false });
  });

  it("does nothing when the date is already right", () => {
    params = new URLSearchParams(`today=${localDateString()}`);
    render(<LocalToday />);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
