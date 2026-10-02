// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/[slug]/(app)/account/actions", () => ({
  linkAccountContactAction: vi.fn(),
  createAccountContactAction: vi.fn(),
}));

import AccountClient from "@/app/[slug]/(app)/account/AccountClient";
import { linkAccountContactAction, createAccountContactAction } from "@/app/[slug]/(app)/account/actions";

const members = [
  { id: "m1", name: "Sam Smith" },
  { id: "m2", name: "Pat Smith" },
];

function setup(current: { id: string; name: string } | null = null, list = members) {
  return render(
    <App>
      <AccountClient slug="s" current={current} members={list} />
    </App>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(linkAccountContactAction).mockResolvedValue(undefined);
  vi.mocked(createAccountContactAction).mockResolvedValue(undefined);
});

describe("AccountClient", () => {
  it("warns when no contact is linked yet", () => {
    setup();
    expect(screen.getByText("No contact is linked to this account yet.")).toBeInTheDocument();
  });

  it("shows who the account acts as", () => {
    setup(members[0]);
    expect(screen.getByText("This account acts as Sam Smith.")).toBeInTheDocument();
  });

  it("links an existing household member", async () => {
    setup();
    const use = screen.getByRole("button", { name: "Use this contact" });
    expect(use).toBeDisabled();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("Pat Smith"));
    await userEvent.click(use);
    await waitFor(() => expect(linkAccountContactAction).toHaveBeenCalledWith("s", "m2"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("will not re-link the member the account already acts as", async () => {
    setup(members[0]);
    await userEvent.click(screen.getByRole("combobox"));
    const option = (await screen.findAllByTitle("Sam Smith")).find((el) => el.closest(".ant-select-item-option"));
    await userEvent.click(option as HTMLElement);
    expect(screen.getByRole("button", { name: "Use this contact" })).toBeDisabled();
  });

  it("hides the picker when the household has no members yet", () => {
    setup(null, []);
    expect(screen.queryByText("Use an existing household member")).not.toBeInTheDocument();
  });

  it("creates and links a new member", async () => {
    setup(null, []);
    const create = screen.getByRole("button", { name: "Create and use" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("First name"), "Lee");
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("Last name"), "Jones");
    await userEvent.click(create);
    await waitFor(() => expect(createAccountContactAction).toHaveBeenCalledWith("s", "Lee", "Jones"));
    await waitFor(() => expect(screen.getByPlaceholderText("First name")).toHaveValue(""));
  });

  it("shows the server's error and keeps what was typed", async () => {
    vi.mocked(createAccountContactAction).mockRejectedValue(new Error("First name is required"));
    setup(null, []);
    await userEvent.type(screen.getByPlaceholderText("First name"), "Lee");
    await userEvent.type(screen.getByPlaceholderText("Last name"), "Jones");
    await userEvent.click(screen.getByRole("button", { name: "Create and use" }));
    expect(await screen.findByText("First name is required")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("First name")).toHaveValue("Lee");
  });

  it("shows a generic message for a non-Error failure", async () => {
    vi.mocked(createAccountContactAction).mockRejectedValue("boom");
    setup(null, []);
    await userEvent.type(screen.getByPlaceholderText("First name"), "Lee");
    await userEvent.type(screen.getByPlaceholderText("Last name"), "Jones");
    await userEvent.click(screen.getByRole("button", { name: "Create and use" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });
});
