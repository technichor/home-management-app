// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getSessionUser: vi.fn() }));
vi.mock("@/components/AuthForm", () => ({ default: ({ mode, next, notice }: any) => <div>form:{mode}:{next ?? "-"}{notice ? `:${notice}` : ""}</div> }));
vi.mock("@/lib/db", () => ({ prisma: { joinRequest: { findMany: vi.fn() } } }));
vi.mock("@/components/JoinRequestForm", () => ({ default: () => <div>join form</div> }));
vi.mock("@/app/onboarding/actions", () => ({ cancelJoinRequestAction: vi.fn() }));
vi.mock("@/app/login/actions", () => ({ loginAction: vi.fn(), logoutAction: vi.fn() }));
vi.mock("@/components/CreateHouseholdForm", () => ({ default: () => <div>create form</div> }));
vi.mock("@/app/signup/actions", () => ({ signupAction: vi.fn() }));

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import AuthPage from "@/components/AuthPage";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";
import OnboardingPage from "@/app/onboarding/page";

beforeEach(() => vi.clearAllMocks());

describe("AuthPage", () => {
  const action = vi.fn();
  const sp = (next?: string) => Promise.resolve({ next });

  it("shows the form to a visitor", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    render(await AuthPage({ mode: "login", action, searchParams: sp() }));
    expect(screen.getByText("form:login:-")).toBeInTheDocument();
  });

  it("passes a safe next path to the form and drops an unsafe one", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    render(await AuthPage({ mode: "login", action, searchParams: sp("/join/abc") }));
    expect(screen.getByText("form:login:/join/abc")).toBeInTheDocument();
    render(await AuthPage({ mode: "signup", action, searchParams: sp("//evil.example") }));
    expect(screen.getByText("form:signup:-")).toBeInTheDocument();
  });

  it("shows the password-changed notice only on the login form", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    render(await AuthPage({ mode: "login", action, searchParams: Promise.resolve({ reset: "1" }) }));
    expect(screen.getByText("form:login:-:Password changed. Log in with your new password.")).toBeInTheDocument();
    render(await AuthPage({ mode: "signup", action, searchParams: Promise.resolve({ reset: "1" }) }));
    expect(screen.getByText("form:signup:-")).toBeInTheDocument();
  });

  it("shows the email-confirmed notice on the login form", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    render(await AuthPage({ mode: "login", action, searchParams: Promise.resolve({ verified: "1" }) }));
    expect(screen.getByText("form:login:-:Email confirmed. Log in to continue.")).toBeInTheDocument();
  });

  it("sends a signed-in user where they belong, or to next", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", household: null } as any);
    await expect(AuthPage({ mode: "signup", action, searchParams: sp() })).rejects.toThrow("REDIRECT:/onboarding");
    await expect(AuthPage({ mode: "signup", action, searchParams: sp("/join/abc") })).rejects.toThrow("REDIRECT:/join/abc");
  });
});

describe("login and signup pages", () => {
  it("render the shared page in their own mode", () => {
    const searchParams = Promise.resolve({});
    expect(LoginPage({ searchParams }).props).toMatchObject({ mode: "login" });
    expect(SignupPage({ searchParams }).props).toMatchObject({ mode: "signup" });
  });
});

describe("OnboardingPage", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("sends a user who already has a household to it", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "u",
      household: { id: "h", urlSlug: "smiths", deletedAt: null },
    } as any);
    await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/smiths");
  });

  it("greets a user with no household and offers logout", async () => {
    vi.mocked(prisma.joinRequest.findMany).mockResolvedValue([]);
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", firstName: "Sam", email: "s@x.co", household: null } as any);
    render(await OnboardingPage());
    expect(screen.getByText("Welcome, Sam")).toBeInTheDocument();
    expect(screen.getByText(/s@x\.co/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(screen.getByText("create form")).toBeInTheDocument();
    expect(screen.getByText("join form")).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for approval/)).toBeNull();
  });

  it("lists pending join requests with a cancel button", async () => {
    vi.mocked(prisma.joinRequest.findMany).mockResolvedValue([{ id: "r1", household: { displayName: "The Joneses" } }] as any);
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", firstName: "Sam", email: "s@x.co", household: null } as any);
    render(await OnboardingPage());
    expect(screen.getByText("Waiting for approval from The Joneses")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel request" })).toBeInTheDocument();
  });
});
