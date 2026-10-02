// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(app)/account/actions", () => ({ requestEmailChangeAction: vi.fn() }));
vi.mock("@/app/change-email/[token]/actions", () => ({ confirmEmailChangeAction: vi.fn() }));
vi.mock("@/lib/emailChange", () => ({ findValidChangeToken: vi.fn() }));

import ChangeEmailForm from "@/components/ChangeEmailForm";
import ConfirmEmailChangeForm from "@/components/ConfirmEmailChangeForm";
import ChangeEmailTokenPage from "@/app/change-email/[token]/page";
import { requestEmailChangeAction } from "@/app/(app)/account/actions";
import { confirmEmailChangeAction } from "@/app/change-email/[token]/actions";
import { findValidChangeToken } from "@/lib/emailChange";

beforeEach(() => vi.clearAllMocks());

async function fillAndSubmit() {
  await userEvent.type(document.querySelector("input[name=newEmail]") as HTMLInputElement, "new@x.co");
  await userEvent.type(document.querySelector("input[name=password]") as HTMLInputElement, "pw-12345");
  await userEvent.click(screen.getByRole("button", { name: "Send confirmation link" }));
}

describe("ChangeEmailForm", () => {
  it("shows the current address and submits the new address with the password", async () => {
    vi.mocked(requestEmailChangeAction).mockResolvedValue({ error: "Your password is incorrect." });
    render(<ChangeEmailForm currentEmail="old@x.co" />);
    expect(screen.getByText("old@x.co")).toBeInTheDocument();
    await fillAndSubmit();
    await waitFor(() => expect(requestEmailChangeAction).toHaveBeenCalled());
    const data = vi.mocked(requestEmailChangeAction).mock.calls[0][1] as FormData;
    expect([data.get("newEmail"), data.get("password")]).toEqual(["new@x.co", "pw-12345"]);
    expect(await screen.findByText("Your password is incorrect.")).toBeInTheDocument();
  });

  it("tells you where the link went and clears the form", async () => {
    vi.mocked(requestEmailChangeAction).mockResolvedValue({ sentTo: "new@x.co" });
    render(<ChangeEmailForm currentEmail="old@x.co" />);
    await fillAndSubmit();
    expect(await screen.findByText("Check new@x.co")).toBeInTheDocument();
    expect((document.querySelector("input[name=newEmail]") as HTMLInputElement).value).toBe("");
  });
});

describe("ChangeEmailTokenPage", () => {
  const params = Promise.resolve({ token: "tok" });

  it("shows the old and new address and offers to confirm", async () => {
    vi.mocked(findValidChangeToken).mockResolvedValue({ newEmail: "new@x.co", user: { email: "old@x.co" } } as any);
    render(await ChangeEmailTokenPage({ params }));
    expect(screen.getByText("new@x.co")).toBeInTheDocument();
    expect(screen.getByText(/old@x\.co/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm new email" })).toBeInTheDocument();
  });

  it("explains an invalid link", async () => {
    vi.mocked(findValidChangeToken).mockResolvedValue(null);
    render(await ChangeEmailTokenPage({ params }));
    expect(screen.getByText("Link not valid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to log in" })).toHaveAttribute("href", "/login");
  });
});

describe("ConfirmEmailChangeForm", () => {
  it("confirms with the link's token and shows an error", async () => {
    vi.mocked(confirmEmailChangeAction).mockResolvedValue({ error: "An account already uses that email address." });
    render(<ConfirmEmailChangeForm token="tok" />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm new email" }));
    await waitFor(() => expect(confirmEmailChangeAction).toHaveBeenCalledWith("tok"));
    expect(await screen.findByText("An account already uses that email address.")).toBeInTheDocument();
  });
});
