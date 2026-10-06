// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const current = (el: HTMLElement) => el.getAttribute("aria-current") === "page";

describe("AppNav", () => {
  const setup = (props: Partial<React.ComponentProps<typeof AppNav>> = {}) => {
    const logoutAction = vi.fn().mockResolvedValue(undefined);
    render(<AppNav householdName="The Smiths" logoutAction={logoutAction} {...props} />);
    return { logoutAction };
  };
  const sidebar = () => within(screen.getByRole("complementary"));
  const tabbar = () => within(screen.getByRole("navigation", { name: "Main" }));

  it("shows the product name and the household, in the sidebar and the phone header", () => {
    setup();
    expect(screen.getAllByText("Domata")).toHaveLength(2);
    expect(sidebar().getByText("The Smiths")).toBeInTheDocument();
  });

  it("shows no coming-soon placeholders", () => {
    setup();
    expect(screen.queryByText("soon")).toBeNull();
    expect(screen.queryByText(/Schedules|Meal planning|Utilities|Finances/)).toBeNull();
  });

  it("links each module in the sidebar and the tab bar", () => {
    setup();
    for (const [name, href] of [["Home", "/home"], ["To-do", "/todo"], ["Lists", "/lists"], ["Messages", "/messages"], ["Meals", "/meals"]]) {
      expect(sidebar().getByRole("link", { name })).toHaveAttribute("href", href);
      expect(tabbar().getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("links the other modules in the sidebar only (the tab bar holds the first five; the rest are under More)", () => {
    setup();
    for (const [name, href] of [["Contacts", "/contacts"], ["Calendar", "/calendar"], ["Maintenance", "/maintenance"]]) {
      expect(sidebar().getByRole("link", { name })).toHaveAttribute("href", href);
      expect(tabbar().queryByRole("link", { name })).toBeNull();
    }
  });

  it("links Accounts in the sidebar (the tab bar holds only the first five modules)", () => {
    setup();
    expect(sidebar().getByRole("link", { name: "Accounts" })).toHaveAttribute("href", "/accounts");
    expect(tabbar().queryByRole("link", { name: "Accounts" })).toBeNull();
  });

  it("highlights Home only on the home path", () => {
    pathname = "/home";
    setup();
    expect(current(sidebar().getByRole("link", { name: "Home" }))).toBe(true);
    expect(current(sidebar().getByRole("link", { name: "Contacts" }))).toBe(false);
    expect(current(tabbar().getByRole("link", { name: "Home" }))).toBe(true);
  });

  it("does not highlight Home on a module path", () => {
    pathname = "/contacts";
    setup();
    expect(current(sidebar().getByRole("link", { name: "Home" }))).toBe(false);
    expect(current(sidebar().getByRole("link", { name: "Contacts" }))).toBe(true);
  });

  it.each([["/lists/abc", "Lists"], ["/messages/abc", "Messages"], ["/contacts/households", "Contacts"]])(
    "highlights the module for %s",
    (path, label) => {
      pathname = path;
      setup();
      expect(current(sidebar().getByRole("link", { name: label }))).toBe(true);
      expect(current(sidebar().getByRole("link", { name: "Home" }))).toBe(false);
    }
  );

  it("highlights nothing for an unknown path", () => {
    pathname = "/other";
    setup();
    expect(screen.queryAllByRole("link").some(current)).toBe(false);
  });

  it("links Household and Account, and Admin only for superusers", () => {
    const { unmount } = render(<AppNav householdName="H" logoutAction={vi.fn()} />);
    expect(sidebar().getByRole("link", { name: "Household" })).toHaveAttribute("href", "/household");
    expect(sidebar().getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(sidebar().queryByRole("link", { name: "Admin" })).toBeNull();
    unmount();
    render(<AppNav householdName="H" isSuperuser logoutAction={vi.fn()} />);
    expect(sidebar().getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("highlights Account on its page", () => {
    pathname = "/account";
    setup();
    expect(current(sidebar().getByRole("link", { name: "Account" }))).toBe(true);
  });

  it("logs out via the form action", async () => {
    const { logoutAction } = setup();
    await userEvent.click(sidebar().getByRole("button", { name: "Log out" }));
    expect(logoutAction).toHaveBeenCalled();
  });

  describe("unread badge", () => {
    it("shows the count on Messages in the sidebar and the tab bar", () => {
      setup({ unreadMessages: 3 });
      expect(screen.getAllByLabelText("3 unread messages")).toHaveLength(2);
    });

    it("shows nothing when there are none", () => {
      setup();
      expect(screen.queryByLabelText(/unread messages/)).toBeNull();
    });
  });

  describe("More (phone)", () => {
    it("opens a sheet with Household, Account and Log out, and closes after a choice", async () => {
      setup();
      expect(screen.queryByText("The Smiths", { selector: ".ant-drawer-title" })).toBeNull();
      await userEvent.click(tabbar().getByRole("button", { name: "More" }));
      const sheet = within(await screen.findByRole("dialog"));
      expect(sheet.getByRole("link", { name: "Household" })).toHaveAttribute("href", "/household");
      expect(sheet.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
      expect(sheet.queryByRole("link", { name: "Admin" })).toBeNull();
      await userEvent.click(sheet.getByRole("link", { name: "Account" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("closes with its close button", async () => {
      setup();
      await userEvent.click(tabbar().getByRole("button", { name: "More" }));
      await userEvent.click(await screen.findByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("includes Admin for a superuser, and logs out from the sheet", async () => {
      const { logoutAction } = setup({ isSuperuser: true });
      await userEvent.click(tabbar().getByRole("button", { name: "More" }));
      const sheet = within(await screen.findByRole("dialog"));
      expect(sheet.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
      await userEvent.click(sheet.getByRole("button", { name: "Log out" }));
      expect(logoutAction).toHaveBeenCalled();
    });

    it("is highlighted on a page it holds", () => {
      pathname = "/household";
      setup();
      expect(current(tabbar().getByRole("button", { name: "More" }))).toBe(true);
      pathname = "/lists";
    });

    it("is not highlighted on a main tab", () => {
      pathname = "/lists";
      setup();
      expect(current(tabbar().getByRole("button", { name: "More" }))).toBe(false);
    });
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
  ])("on %s the %s link is current", (path, label) => {
    pathname = path;
    render(<ContactsNav />);
    for (const name of ["People", "Households", "Import", "Removed"]) {
      expect(current(screen.getByRole("link", { name }))).toBe(name === label);
    }
  });

  it("has no current link outside contacts", () => {
    pathname = "/lists";
    render(<ContactsNav />);
    expect(screen.getAllByRole("link").some(current)).toBe(false);
  });

  it("links to each section", () => {
    render(<ContactsNav />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
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
  ])("on %s the %s link is current", (path, label) => {
    pathname = path;
    render(<ListsNav />);
    for (const name of ["Active", "Archived"]) {
      expect(current(screen.getByRole("link", { name }))).toBe(name === label);
    }
  });

  it("has no current link outside lists", () => {
    pathname = "/contacts";
    render(<ListsNav />);
    expect(screen.getAllByRole("link").some(current)).toBe(false);
  });

  it("links to each section", () => {
    render(<ListsNav />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/lists", "/lists/archived"]);
  });
});
