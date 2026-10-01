// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Every antd breakpoint "matches" so responsive table columns render.
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

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import ContactsFilter from "@/app/[slug]/(app)/contacts/ContactsFilter";
import ContactsTable from "@/app/[slug]/(app)/contacts/ContactsTable";

beforeEach(() => push.mockClear());

// Select's own clear icons are also named "Clear", so pick the filter bar's button.
const clearButton = () =>
  screen.queryAllByRole("button", { name: "Clear" }).find((b) => b.classList.contains("ant-btn"));

describe("ContactsFilter", () => {
  const setup = (defaults = {}, allTags: string[] = ["kid", "vet"]) =>
    render(<ContactsFilter slug="s" allTags={allTags} defaults={defaults} />);

  it("submits with no filters to the plain contacts URL", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/s/contacts"));
  });

  it("builds a query string from every filter", async () => {
    setup();
    await userEvent.type(screen.getByPlaceholderText("Search by name…"), "ann");
    await userEvent.click(screen.getAllByRole("combobox")[0]);
    await userEvent.click(await screen.findByTitle("Service Provider"));
    await userEvent.click(screen.getAllByRole("combobox")[1]);
    await userEvent.click(await screen.findByTitle("vet"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Favorites only" }));
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/s/contacts?q=ann&category=SERVICE_PROVIDER&tag=vet&favorites=1")
    );
  });

  it("starts from the current filters and offers Clear", async () => {
    setup({ q: "bob", category: "FAMILY_FRIEND", tag: "kid", favorites: "1" });
    expect(screen.getByPlaceholderText("Search by name…")).toHaveValue("bob");
    expect(screen.getByRole("checkbox", { name: "Favorites only" })).toBeChecked();
    expect(screen.getByText("Family & Friend")).toBeInTheDocument();
    await userEvent.click(clearButton() as HTMLElement);
    expect(push).toHaveBeenCalledWith("/s/contacts");
    await waitFor(() => expect(screen.getByPlaceholderText("Search by name…")).toHaveValue(""));
  });

  it.each([["q", { q: "x" }], ["category", { category: "FAMILY_FRIEND" }], ["tag", { tag: "kid" }], ["favorites", { favorites: "1" }]])(
    "shows Clear when only %s is set",
    (_name, defaults) => {
      setup(defaults);
      expect(clearButton()).toBeInTheDocument();
    }
  );

  it("hides Clear when no filter is set", () => {
    setup();
    expect(clearButton()).toBeUndefined();
  });

  it("hides the tag filter when there are no tags", () => {
    setup({}, []);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });
});

describe("ContactsTable", () => {
  const row = (over: object = {}) => ({
    id: "c1", firstName: "Jane", lastName: "Smith", nickname: null, favorite: false,
    category: "SERVICE_PROVIDER", tags: [], household: null,
    phoneMobile: null, phoneHome: null, phoneWork: null, emailPrimary: null, ...over,
  });

  it("shows an empty message", () => {
    render(<ContactsTable contacts={[]} slug="s" />);
    expect(screen.getByText("No contacts match those filters.")).toBeInTheDocument();
  });

  it("shows a full row", () => {
    render(
      <ContactsTable
        slug="s"
        contacts={[
          row({
            favorite: true, nickname: "JJ", tags: ["vet", "kid"], category: "FAMILY_FRIEND",
            household: { displayName: "The Smiths" }, phoneMobile: "111", emailPrimary: "j@x.com",
          }),
        ]}
      />
    );
    expect(screen.getByRole("link", { name: /Jane Smith/ })).toHaveAttribute("href", "/s/contacts/c1");
    expect(screen.getByText("(JJ)")).toBeInTheDocument();
    expect(screen.getByLabelText("star")).toBeInTheDocument();
    expect(screen.getByText("vet")).toBeInTheDocument();
    expect(screen.getByText("Family & Friend")).toBeInTheDocument();
    expect(screen.getByText("The Smiths")).toBeInTheDocument();
    expect(screen.getByText("111")).toBeInTheDocument();
    expect(screen.getByText("j@x.com")).toBeInTheDocument();
  });

  it("uses dashes for missing values and plain styling for a minimal row", () => {
    render(<ContactsTable slug="s" contacts={[row()]} />);
    expect(screen.queryByLabelText("star")).not.toBeInTheDocument();
    expect(screen.queryByText(/^\(/)).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3); // household, phone, email
    expect(screen.getByText("Service Provider")).toBeInTheDocument();
  });

  it("picks the first available phone number: mobile, then home, then work", () => {
    render(
      <ContactsTable
        slug="s"
        contacts={[
          row({ id: "a", firstName: "A", phoneMobile: "m", phoneHome: "h", phoneWork: "w" }),
          row({ id: "b", firstName: "B", phoneHome: "h2", phoneWork: "w2" }),
          row({ id: "c", firstName: "C", phoneWork: "w3" }),
        ]}
      />
    );
    expect(screen.getByText("m")).toBeInTheDocument();
    expect(screen.getByText("h2")).toBeInTheDocument();
    expect(screen.getByText("w3")).toBeInTheDocument();
    expect(screen.queryByText("h")).not.toBeInTheDocument();
  });
});
