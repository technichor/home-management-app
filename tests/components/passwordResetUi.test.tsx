// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/forgot-password/actions", () => ({ requestPasswordResetAction: vi.fn() }));
vi.mock("@/app/reset-password/[token]/actions", () => ({ resetPasswordAction: vi.fn() }));
vi.mock("@/lib/passwordReset", () => ({ findValidResetToken: vi.fn() }));
vi.mock("@/components/ResetPasswordForm", async () => ({ default: ({ token }: any) => <div>reset form {token}</div> }));

import ForgotPasswordForm from "@/components/ForgotPasswordForm";
import { requestPasswordResetAction } from "@/app/forgot-password/actions";
import { resetPasswordAction } from "@/app/reset-password/[token]/actions";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/[token]/page";
import { findValidResetToken } from "@/lib/passwordReset";

beforeEach(() => vi.clearAllMocks());

describe("ForgotPasswordForm", () => {
  it("submits the email and then shows the same message whatever the account", async () => {
    vi.mocked(requestPasswordResetAction).mockResolvedValue({ sent: true });
    render(<ForgotPasswordForm />);
    await userEvent.type(document.querySelector("input[name=email]") as HTMLInputElement, "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(requestPasswordResetAction).toHaveBeenCalled());
    expect((vi.mocked(requestPasswordResetAction).mock.calls[0][1] as FormData).get("email")).toBe("a@b.co");
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send reset link" })).toBeNull();
  });

  it("shows a validation error", async () => {
    vi.mocked(requestPasswordResetAction).mockResolvedValue({ error: "Enter a valid email address" });
    render(<ForgotPasswordForm />);
    await userEvent.type(document.querySelector("input[name=email]") as HTMLInputElement, "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
  });

  it("is what the forgot-password page renders", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("link", { name: "Back to log in" })).toHaveAttribute("href", "/login");
  });
});

describe("ResetPasswordPage", () => {
  it("shows the form for a valid link", async () => {
    vi.mocked(findValidResetToken).mockResolvedValue({ id: "t" } as any);
    render(await ResetPasswordPage({ params: Promise.resolve({ token: "tok" }) }));
    expect(screen.getByText("reset form tok")).toBeInTheDocument();
  });

  it("explains an invalid link and offers a new one", async () => {
    vi.mocked(findValidResetToken).mockResolvedValue(null);
    render(await ResetPasswordPage({ params: Promise.resolve({ token: "tok" }) }));
    expect(screen.getByText("Link not valid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
  });
});

describe("ResetPasswordForm", () => {
  it("submits the passwords with the link's token and shows an error", async () => {
    const { default: Real } = await vi.importActual<typeof import("@/components/ResetPasswordForm")>("@/components/ResetPasswordForm");
    vi.mocked(resetPasswordAction).mockResolvedValue({ error: "This reset link is not valid or has expired. Request a new one." });
    render(<Real token="tok" />);
    await userEvent.type(document.querySelector("input[name=newPassword]") as HTMLInputElement, "new-password-1");
    await userEvent.type(document.querySelector("input[name=confirmPassword]") as HTMLInputElement, "new-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(resetPasswordAction).toHaveBeenCalled());
    const [token, , data] = vi.mocked(resetPasswordAction).mock.calls[0] as [string, unknown, FormData];
    expect(token).toBe("tok");
    expect(data.get("newPassword")).toBe("new-password-1");
    expect(await screen.findByText(/not valid or has expired/)).toBeInTheDocument();
  });
});
