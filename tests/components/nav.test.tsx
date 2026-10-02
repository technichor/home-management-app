// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

import AppNav from "@/components/AppNav";
import ContactsNav from "@/components/ContactsNav";
import ListsNav from "@/components/ListsNav";

beforeEach(() => {
  push.mockClear();
  pathname = "/";
});

const selected = (el: HTMLElement) => el.style.fontWeight === "500";

describe("AppNav", () => {
  const setup = () => {
    const logoutAction = vi.fn().mockResolvedValue(undefined);
    render(<AppNav slug="s" householdName="The Smiths" logoutAction={logoutAction} />);
    return { logoutAction };
  };

  it("shows the household name and marks unbuilt modules as coming soon", () => {
    setup();
    expect(screen.getByText("The Smiths")).toBeInTheDocument();
    expect(screen.getAllByText("soon")).toHaveLength(3);
  });

  it("highlights the module matching the current path", () => {
    pathname = "/s/lists/abc";
    setup();
    expect(selected(screen.getByRole("button", { name: "Lists" }))).toBe(true);
    expect(selected(screen.getByRole("button", { name: "Contacts" }))).toBe(false);
  });

  it("highlights nothing for an unknown path", () => {
    pathname = "/s/other";
    setup();
    expect(selected(screen.getByRole("button", { name: "Lists" }))).toBe(false);
    expect(selected(screen.getByRole("button", { name: "Contacts" }))).toBe(false);
  });

  it("navigates when an active module is clicked", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Contacts" }));
    await userEvent.click(screen.getByRole("button", { name: "Lists" }));
    expect(push).toHaveBeenNthCalledWith(1, "/s/contacts");
    expect(push).toHaveBeenNthCalledWith(2, "/s/lists");
  });

  it("does nothing when a coming-soon module is clicked", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Meal Planning/ }));
    expect(push).not.toHaveBeenCalled();
  });

  it("opens the account page", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(push).toHaveBeenCalledWith("/s/account");
  });

  it("logs out via the form action", async () => {
    const { logoutAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(logoutAction).toHaveBeenCalled();
  });
});

describe("ContactsNav", () => {
  it.each([
    ["/s/contacts", "People"],
    ["/s/contacts/abc123", "People"],
    ["/s/contacts/households", "Households"],
    ["/s/contacts/households/h1", "Households"],
    ["/s/contacts/import", "Import"],
    ["/s/contacts/removed", "Removed"],
  ])("on %s the %s tab is active", (path, label) => {
    pathname = path;
    render(<ContactsNav slug="s" />);
    for (const name of ["People", "Households", "Import", "Removed"]) {
      expect(selected(screen.getByRole("button", { name }))).toBe(name === label);
    }
  });

  it("has no active tab outside contacts", () => {
    pathname = "/s/lists";
    render(<ContactsNav slug="s" />);
    expect(screen.getAllByRole("button").some(selected)).toBe(false);
  });

  it("navigates to each tab", async () => {
    render(<ContactsNav slug="s" />);
    await userEvent.click(screen.getByRole("button", { name: "People" }));
    await userEvent.click(screen.getByRole("button", { name: "Households" }));
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(screen.getByRole("button", { name: "Removed" }));
    expect(push.mock.calls.map((c) => c[0])).toEqual([
      "/s/contacts",
      "/s/contacts/households",
      "/s/contacts/import",
      "/s/contacts/removed",
    ]);
  });
});

describe("ListsNav", () => {
  it.each([
    ["/s/lists", "Active"],
    ["/s/lists/abc", "Active"],
    ["/s/lists/abc/compare", "Active"],
    ["/s/lists/archived", "Archived"],
  ])("on %s the %s tab is active", (path, label) => {
    pathname = path;
    render(<ListsNav slug="s" />);
    for (const name of ["Active", "Archived"]) {
      expect(selected(screen.getByRole("button", { name }))).toBe(name === label);
    }
  });

  it("has no active tab outside lists", () => {
    pathname = "/s/contacts";
    render(<ListsNav slug="s" />);
    expect(screen.getAllByRole("button").some(selected)).toBe(false);
  });

  it("navigates to each tab", async () => {
    render(<ListsNav slug="s" />);
    await userEvent.click(screen.getByRole("button", { name: "Active" }));
    await userEvent.click(screen.getByRole("button", { name: "Archived" }));
    expect(push.mock.calls.map((c) => c[0])).toEqual(["/s/lists", "/s/lists/archived"]);
  });
});
