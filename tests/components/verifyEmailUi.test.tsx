// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getSessionUser: vi.fn() }));
vi.mock("@/lib/emailVerification", () => ({ findValidVerificationToken: vi.fn() }));
vi.mock("@/app/verify-email/actions", () => ({ resendVerificationAction: vi.fn() }));
vi.mock("@/app/verify-email/[token]/actions", () => ({ verifyEmailAction: vi.fn() }));
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));

import VerifyEmailPage from "@/app/verify-email/page";
import VerifyEmailTokenPage from "@/app/verify-email/[token]/page";
import VerifyEmailPending from "@/components/VerifyEmailPending";
import ConfirmEmailForm from "@/components/ConfirmEmailForm";
import { getSessionUser } from "@/lib/auth";
import { findValidVerificationToken } from "@/lib/emailVerification";
import { resendVerificationAction } from "@/app/verify-email/actions";
import { verifyEmailAction } from "@/app/verify-email/[token]/actions";

beforeEach(() => vi.clearAllMocks());

describe("VerifyEmailPage", () => {
  it("requires login, and sends a verified user home", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(VerifyEmailPage()).rejects.toThrow("REDIRECT:/login");
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", emailVerifiedAt: new Date(), household: null } as any);
    await expect(VerifyEmailPage()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("tells an unverified user where the link went", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", email: "a@b.co", emailVerifiedAt: null, household: null } as any);
    render(await VerifyEmailPage());
    expect(screen.getByText(/We sent a confirmation link to a@b\.co/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a new link" })).toBeInTheDocument();
  });
});

describe("VerifyEmailTokenPage", () => {
  const params = Promise.resolve({ token: "tok" });
  it("offers to confirm a valid link", async () => {
    vi.mocked(findValidVerificationToken).mockResolvedValue({ id: "t" } as any);
    render(await VerifyEmailTokenPage({ params }));
    expect(screen.getByRole("button", { name: "Confirm email" })).toBeInTheDocument();
  });
  it("explains an invalid link", async () => {
    vi.mocked(findValidVerificationToken).mockResolvedValue(null);
    render(await VerifyEmailTokenPage({ params }));
    expect(screen.getByText("Link not valid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to log in" })).toHaveAttribute("href", "/login");
  });
});

describe("VerifyEmailPending", () => {
  it("shows a confirmation after resending", async () => {
    vi.mocked(resendVerificationAction).mockResolvedValue({ sent: true });
    render(<VerifyEmailPending logoutAction={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText("Sent. Check your inbox.")).toBeInTheDocument();
  });
  it("shows an error from the action", async () => {
    vi.mocked(resendVerificationAction).mockResolvedValue({ error: "Too many requests. Try again in 5 minutes." });
    render(<VerifyEmailPending logoutAction={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument();
  });
  it("offers log out", () => {
    render(<VerifyEmailPending logoutAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });
});

describe("ConfirmEmailForm", () => {
  it("confirms with the link's token and shows an error", async () => {
    vi.mocked(verifyEmailAction).mockResolvedValue({ error: "This confirmation link is not valid or has expired. Log in to request a new one." });
    render(<ConfirmEmailForm token="tok" />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm email" }));
    await waitFor(() => expect(verifyEmailAction).toHaveBeenCalled());
    expect(vi.mocked(verifyEmailAction).mock.calls[0][0]).toBe("tok");
    expect(await screen.findByText(/not valid or has expired/)).toBeInTheDocument();
  });
});
