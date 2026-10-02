// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

// Make every antd responsive breakpoint "match" so the table's wider-screen columns render.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: true, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
});

vi.mock("@/app/admin/actions", () => ({
  createResetLinkAction: vi.fn(),
  emailResetLinkAction: vi.fn(),
  setSuperuserAction: vi.fn(),
}));

import AdminUsersTable, { type AdminUserRow } from "@/components/AdminUsersTable";
import AdminUserActions from "@/components/AdminUserActions";
import { createResetLinkAction, emailResetLinkAction, setSuperuserAction } from "@/app/admin/actions";

const row = (over: Partial<AdminUserRow> = {}): AdminUserRow => ({
  id: "u1", email: "sam@x.co", name: "Sam Smith", role: "OWNER", householdName: "The Smiths", isSuperuser: false,
  verified: true, createdAt: "2026-01-01T10:00:00.000Z", lastLoginAt: "2026-10-01T09:30:00.000Z", lastSeenAt: "2026-10-02T12:00:00.000Z", ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("AdminUsersTable", () => {
  const users = [
    row(),
    row({ id: "u2", email: "kim@x.co", name: "Kim Wu", householdName: null, isSuperuser: true, verified: false, lastLoginAt: null, lastSeenAt: null }),
  ];

  it("lists each user with a link to their page, flags and when they were last around", () => {
    render(<AdminUsersTable users={users} />);
    expect(screen.getByRole("link", { name: "sam@x.co" })).toHaveAttribute("href", "/admin/users/u1");
    expect(screen.getByRole("link", { name: "kim@x.co" })).toHaveAttribute("href", "/admin/users/u2");
    expect(screen.getByText("Superuser")).toBeInTheDocument();
    expect(screen.getByText("Unconfirmed")).toBeInTheDocument();
    expect(screen.getByText("Sam Smith · The Smiths")).toBeInTheDocument();
    expect(screen.getByText("Kim Wu · no household")).toBeInTheDocument();
    expect(screen.getAllByText("2026-10-02 12:00 UTC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Never").length).toBeGreaterThan(0);
    expect(screen.getByText("Last seen 2026-10-02 12:00 UTC")).toHaveClass("mobile-only");
  });

  it("filters by email, name or household", async () => {
    render(<AdminUsersTable users={users} />);
    const box = screen.getByPlaceholderText("Search by email, name or household");
    await userEvent.type(box, "kim");
    expect(screen.queryByRole("link", { name: "sam@x.co" })).toBeNull();
    expect(screen.getByRole("link", { name: "kim@x.co" })).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, "smiths");
    expect(screen.getByRole("link", { name: "sam@x.co" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "kim@x.co" })).toBeNull();
    await userEvent.clear(box);
    await userEvent.type(box, "zzz");
    expect(screen.getByText("No users match.")).toBeInTheDocument();
  });

  it("pages a long list", () => {
    const many = Array.from({ length: 30 }, (_, i) => row({ id: `x${i}`, email: `u${i}@x.co` }));
    render(<AdminUsersTable users={many} />);
    expect(screen.getAllByRole("link", { name: /@x\.co/ })).toHaveLength(25);
  });
});

describe("AdminUserActions", () => {
  function setup(props: Partial<React.ComponentProps<typeof AdminUserActions>> = {}) {
    return render(
      <App>
        <AdminUserActions userId="u1" email="pat@x.co" isSelf={false} isSuperuser={false} {...props} />
      </App>
    );
  }

  it("emails a reset link and says where it went", async () => {
    vi.mocked(emailResetLinkAction).mockResolvedValue({ ok: true });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Email them a reset link" }));
    await waitFor(() => expect(emailResetLinkAction).toHaveBeenCalledWith("u1"));
    expect(await screen.findByText("Reset link emailed to pat@x.co")).toBeInTheDocument();
  });

  it("shows why an email couldn't be sent", async () => {
    vi.mocked(emailResetLinkAction).mockResolvedValue({ ok: false, error: "The email couldn't be sent. Create a link to copy instead." });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Email them a reset link" }));
    expect(await screen.findByText(/couldn't be sent/)).toBeInTheDocument();
  });

  it("makes a one-time link to copy", async () => {
    vi.mocked(createResetLinkAction).mockResolvedValue({ ok: true, path: "/reset-password/tok" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Create a link to copy" }));
    expect(await screen.findByLabelText("Reset link")).toHaveValue(`${window.location.origin}/reset-password/tok`);
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
  });

  it("copies the link, or says it couldn't", async () => {
    vi.mocked(createResetLinkAction).mockResolvedValue({ ok: true, path: "/reset-password/tok" });
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    setup();
    await user.click(screen.getByRole("button", { name: "Create a link to copy" }));
    await screen.findByLabelText("Reset link");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(write).toHaveBeenCalledWith(`${window.location.origin}/reset-password/tok`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    write.mockRejectedValueOnce(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
  });

  it("selects the whole link when focused", async () => {
    vi.mocked(createResetLinkAction).mockResolvedValue({ ok: true, path: "/reset-password/tok" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Create a link to copy" }));
    const input = (await screen.findByLabelText("Reset link")) as HTMLInputElement;
    const select = vi.spyOn(input, "select");
    await userEvent.click(input);
    expect(select).toHaveBeenCalled();
  });

  it("shows why a link couldn't be made", async () => {
    vi.mocked(createResetLinkAction).mockResolvedValue({ ok: false, error: "User not found." });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Create a link to copy" }));
    expect(await screen.findByText("User not found.")).toBeInTheDocument();
  });

  async function confirm(okText: string) {
    const button = await waitFor(() => {
      const el = [...document.querySelectorAll(".ant-popconfirm .ant-btn-primary")].find((e) => e.textContent === okText);
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    await userEvent.click(button);
  }

  it("won't grant superuser until a password is typed, then asks to confirm", async () => {
    vi.mocked(setSuperuserAction).mockResolvedValue({ ok: false, error: "Your password is incorrect." });
    setup();
    const grant = screen.getByRole("button", { name: "Grant superuser access" });
    expect(grant).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Your password"), "wrong");
    await userEvent.click(grant);
    expect(within(document.body).getByText("Make pat@x.co a superuser?")).toBeInTheDocument();
    await confirm("Grant");
    await waitFor(() => expect(setSuperuserAction).toHaveBeenCalledWith("u1", true, "wrong"));
    expect(await screen.findByText("Your password is incorrect.")).toBeInTheDocument();
  });

  it("revokes access after confirming, clearing the password and reloading", async () => {
    vi.mocked(setSuperuserAction).mockResolvedValue({ ok: true });
    const reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload, origin: "http://localhost" } });
    setup({ isSuperuser: true, isSelf: true });
    expect(screen.getByText(/you are changing your own access/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Your password"), "right");
    await userEvent.click(screen.getByRole("button", { name: "Revoke superuser access" }));
    expect(within(document.body).getByText("Revoke superuser access from pat@x.co?")).toBeInTheDocument();
    await confirm("Revoke");
    await waitFor(() => expect(setSuperuserAction).toHaveBeenCalledWith("u1", false, "right"));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(await screen.findByText("Superuser access revoked")).toBeInTheDocument();
  });

  it("says granting worked", async () => {
    vi.mocked(setSuperuserAction).mockResolvedValue({ ok: true });
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload: vi.fn(), origin: "http://localhost" } });
    setup();
    await userEvent.type(screen.getByLabelText("Your password"), "right");
    await userEvent.click(screen.getByRole("button", { name: "Grant superuser access" }));
    await confirm("Grant");
    expect(await screen.findByText("Superuser access granted")).toBeInTheDocument();
  });
});
