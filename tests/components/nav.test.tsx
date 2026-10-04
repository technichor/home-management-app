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

describe("AppNav unread badge", () => {
  it("shows the unread count on Messages, and nothing when there are none", () => {
    const { unmount } = render(<AppNav householdName="H" unreadMessages={3} logoutAction={vi.fn()} />);
    expect(screen.getByLabelText("3 unread messages")).toBeInTheDocument();
    unmount();
    render(<AppNav householdName="H" logoutAction={vi.fn()} />);
    expect(screen.queryByLabelText(/unread messages/)).toBeNull();
  });
});

describe("AppNav", () => {
  const setup = () => {
    const logoutAction = vi.fn().mockResolvedValue(undefined);
    render(<AppNav householdName="The Smiths" logoutAction={logoutAction} />);
    return { logoutAction };
  };

  it("shows the household name and marks unbuilt modules as coming soon", () => {
    setup();
    expect(screen.getByText("The Smiths")).toBeInTheDocument();
    expect(screen.getAllByText("soon")).toHaveLength(3);
  });

  it("shows the Admin link only to superusers", async () => {
    const { unmount } = render(<AppNav householdName="The Smiths" logoutAction={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    unmount();
    render(<AppNav householdName="The Smiths" isSuperuser logoutAction={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect(push).toHaveBeenCalledWith("/admin");
  });

  it("has a Home tab that is highlighted only on the home path", async () => {
    pathname = "/home";
    setup();
    expect(selected(screen.getByRole("button", { name: "Home" }))).toBe(true);
    expect(selected(screen.getByRole("button", { name: "Contacts" }))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("does not highlight Home on a module path", () => {
    pathname = "/contacts";
    setup();
    expect(selected(screen.getByRole("button", { name: "Home" }))).toBe(false);
    expect(selected(screen.getByRole("button", { name: "Contacts" }))).toBe(true);
  });

  it("tags the coming-soon tabs so a phone can hide them", () => {
    setup();
    expect(screen.getByRole("button", { name: /Meal Planning/ })).toHaveClass("tab-soon");
    expect(screen.getByRole("button", { name: "Contacts" })).not.toHaveClass("tab-soon");
  });

  it("highlights the module matching the current path", () => {
    pathname = "/lists/abc";
    setup();
    expect(selected(screen.getByRole("button", { name: "Lists" }))).toBe(true);
    expect(selected(screen.getByRole("button", { name: "Contacts" }))).toBe(false);
  });

  it("highlights Messages on a messages path", () => {
    pathname = "/messages/abc";
    setup();
    expect(selected(screen.getByRole("button", { name: "Messages" }))).toBe(true);
    expect(selected(screen.getByRole("button", { name: "Lists" }))).toBe(false);
  });

  it("highlights nothing for an unknown path", () => {
    pathname = "/other";
    setup();
    expect(selected(screen.getByRole("button", { name: "Lists" }))).toBe(false);
    expect(selected(screen.getByRole("button", { name: "Contacts" }))).toBe(false);
  });

  it("navigates when an active module is clicked", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Contacts" }));
    await userEvent.click(screen.getByRole("button", { name: "Lists" }));
    await userEvent.click(screen.getByRole("button", { name: "Messages" }));
    expect(push).toHaveBeenNthCalledWith(1, "/contacts");
    expect(push).toHaveBeenNthCalledWith(2, "/lists");
    expect(push).toHaveBeenNthCalledWith(3, "/messages");
  });

  it("does nothing when a coming-soon module is clicked", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Meal Planning/ }));
    expect(push).not.toHaveBeenCalled();
  });

  it("opens the account page", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(push).toHaveBeenCalledWith("/account");
  });

  it("opens the household page", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Household" }));
    expect(push).toHaveBeenCalledWith("/household");
  });

  it("logs out via the form action", async () => {
    const { logoutAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(logoutAction).toHaveBeenCalled();
  });
});

describe("ContactsNav", () => {
  it.each([
    ["/contacts", "People"],
    ["/contacts/abc123", "People"],
    ["/contacts/households", "Households"],
    ["/contacts/households/h1", "Households"],
    ["/contacts/import", "Import"],
    ["/contacts/removed", "Removed"],
  ])("on %s the %s tab is active", (path, label) => {
    pathname = path;
    render(<ContactsNav />);
    for (const name of ["People", "Households", "Import", "Removed"]) {
      expect(selected(screen.getByRole("button", { name }))).toBe(name === label);
    }
  });

  it("has no active tab outside contacts", () => {
    pathname = "/lists";
    render(<ContactsNav />);
    expect(screen.getAllByRole("button").some(selected)).toBe(false);
  });

  it("navigates to each tab", async () => {
    render(<ContactsNav />);
    await userEvent.click(screen.getByRole("button", { name: "People" }));
    await userEvent.click(screen.getByRole("button", { name: "Households" }));
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(screen.getByRole("button", { name: "Removed" }));
    expect(push.mock.calls.map((c) => c[0])).toEqual([
      "/contacts",
      "/contacts/households",
      "/contacts/import",
      "/contacts/removed",
    ]);
  });
});

describe("ListsNav", () => {
  it.each([
    ["/lists", "Active"],
    ["/lists/abc", "Active"],
    ["/lists/abc/compare", "Active"],
    ["/lists/archived", "Archived"],
  ])("on %s the %s tab is active", (path, label) => {
    pathname = path;
    render(<ListsNav />);
    for (const name of ["Active", "Archived"]) {
      expect(selected(screen.getByRole("button", { name }))).toBe(name === label);
    }
  });

  it("has no active tab outside lists", () => {
    pathname = "/contacts";
    render(<ListsNav />);
    expect(screen.getAllByRole("button").some(selected)).toBe(false);
  });

  it("navigates to each tab", async () => {
    render(<ListsNav />);
    await userEvent.click(screen.getByRole("button", { name: "Active" }));
    await userEvent.click(screen.getByRole("button", { name: "Archived" }));
    expect(push.mock.calls.map((c) => c[0])).toEqual(["/lists", "/lists/archived"]);
  });
});
