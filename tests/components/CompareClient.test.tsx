// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

vi.mock("@/app/[slug]/(app)/lists/actions", () => ({ recordComparisonAction: vi.fn() }));

import CompareClient from "@/app/[slug]/(app)/lists/[id]/compare/CompareClient";
import { recordComparisonAction } from "@/app/[slug]/(app)/lists/actions";

const two = [
  { id: "a", text: "Fix roof", quantity: "this spring", rating: 1500, comparisonCount: 0 },
  { id: "b", text: "Paint fence", quantity: null, rating: 1500, comparisonCount: 0 },
];
const three = [...two, { id: "c", text: "New gutters", quantity: null, rating: 1500, comparisonCount: 0 }];

function setup(items = two) {
  return render(
    <App>
      <CompareClient slug="s" listId="l1" items={items} />
    </App>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Fixes the random starting point so the first card is always the first item.
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.mocked(recordComparisonAction).mockResolvedValue({ a: 1516, b: 1484 });
});
afterEach(() => vi.restoreAllMocks());

describe("CompareClient", () => {
  it("asks for at least two items when there are fewer", () => {
    setup([two[0]]);
    expect(screen.getByText("Prioritizing needs at least two unchecked items.")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/s/lists/l1");
  });

  it("shows two items to choose between", () => {
    setup();
    expect(screen.getByText("Which matters more?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fix roof/ })).toBeInTheDocument();
    expect(screen.getByText("this spring")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paint fence" })).toBeInTheDocument();
    expect(screen.getByText(/You can stop at any time/)).toBeInTheDocument();
  });

  it("records the first item as more important", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Fix roof/ }));
    await waitFor(() => expect(recordComparisonAction).toHaveBeenCalledWith("l1", "s", "a", "b", "A"));
    expect(await screen.findByText(/1 comparison made/)).toBeInTheDocument();
  });

  it("records the second item as more important", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Paint fence" }));
    await waitFor(() => expect(recordComparisonAction).toHaveBeenCalledWith("l1", "s", "a", "b", "B"));
  });

  it("records 'about equal' and counts several comparisons", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "About equal" }));
    await screen.findByText(/1 comparison made/);
    await userEvent.click(screen.getByRole("button", { name: "About equal" }));
    expect(await screen.findByText(/2 comparisons made/)).toBeInTheDocument();
    expect(recordComparisonAction).toHaveBeenLastCalledWith("l1", "s", "a", "b", "EQUAL");
  });

  it("moves on to a different pair after an answer when the list is longer", async () => {
    setup(three);
    await userEvent.click(screen.getByRole("button", { name: /Fix roof/ }));
    await screen.findByText(/1 comparison made/);
    // a and b have now been compared, so c (never compared) leads the next pair.
    expect(screen.getByRole("button", { name: "New gutters" })).toBeInTheDocument();
  });

  it("skips a pair without recording anything", async () => {
    setup(three);
    await userEvent.click(screen.getByRole("button", { name: "Skip this pair" }));
    expect(recordComparisonAction).not.toHaveBeenCalled();
    expect(screen.getByText("Which matters more?")).toBeInTheDocument();
  });

  it("shows the error and stays on the same pair when saving fails", async () => {
    vi.mocked(recordComparisonAction).mockRejectedValue(new Error("This list is sorted manually."));
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Fix roof/ }));
    expect(await screen.findByText("This list is sorted manually.")).toBeInTheDocument();
    expect(screen.getByText(/You can stop at any time/)).toBeInTheDocument();
  });

  it("shows a generic message for a non-Error failure", async () => {
    vi.mocked(recordComparisonAction).mockRejectedValue("nope");
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Fix roof/ }));
    expect(await screen.findByText("Could not save that comparison")).toBeInTheDocument();
  });

  it("links Done back to the list", () => {
    setup();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/s/lists/l1");
  });
});
