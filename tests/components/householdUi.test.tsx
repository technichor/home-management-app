// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/app/(app)/household/actions", () => ({
  createInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
  setJoinCodeAction: vi.fn(),
  decideJoinRequestAction: vi.fn(),
  promoteMemberAction: vi.fn(),
  removeMemberAction: vi.fn(),
  leaveHouseholdAction: vi.fn(),
}));
vi.mock("@/app/join/[token]/actions", () => ({ acceptHouseholdInviteAction: vi.fn() }));
vi.mock("@/app/onboarding/actions", () => ({ requestJoinAction: vi.fn() }));

import HouseholdClient from "@/app/(app)/household/HouseholdClient";
import AcceptInvite from "@/app/join/[token]/AcceptInvite";
import JoinRequestForm from "@/components/JoinRequestForm";
import * as actions from "@/app/(app)/household/actions";
import { acceptHouseholdInviteAction } from "@/app/join/[token]/actions";
import { requestJoinAction } from "@/app/onboarding/actions";

const members = [
  { id: "me", firstName: "Sam", lastName: "Smith", email: "sam@x.co", role: "OWNER" as const },
  { id: "m2", firstName: "Pat", lastName: "Lee", email: "pat@x.co", role: "MEMBER" as const },
  { id: "o2", firstName: "Kim", lastName: "Wu", email: "kim@x.co", role: "OWNER" as const },
];
const base = {
  householdName: "The Smiths",
  currentUserId: "me",
  isOwner: true,
  joinCode: null as string | null,
  members,
  invites: [{ id: "i1", createdAt: "2026-01-02T00:00:00.000Z", expiresAt: "2026-01-09T00:00:00.000Z" }],
  requests: [{ id: "r1", name: "Ann Ray", email: "ann@x.co" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [actions.revokeInviteAction, actions.decideJoinRequestAction, actions.promoteMemberAction, actions.removeMemberAction, actions.leaveHouseholdAction]) {
    vi.mocked(fn as any).mockResolvedValue({ ok: true });
  }
  vi.mocked(actions.setJoinCodeAction).mockResolvedValue({ ok: true, joinCode: "ABCD2345" });
});

describe("HouseholdClient as owner", () => {
  it("lists members with roles and owner controls for the others", () => {
    render(<HouseholdClient {...base} />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getAllByText("Owner")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Make owner" })).toHaveLength(1);
    expect(screen.getByText("Ann Ray")).toBeInTheDocument();
  });

  it("creates an invite and shows the link once", async () => {
    vi.mocked(actions.createInviteAction).mockResolvedValue({ ok: true, invitePath: "/join/tok" });
    render(<HouseholdClient {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Create invite link" }));
    const input = (await screen.findByDisplayValue(/\/join\/tok$/)) as HTMLInputElement;
    expect(input.value).toBe(`${window.location.origin}/join/tok`);
    expect(refresh).toHaveBeenCalled();
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(input.value);
  });

  it("shows an error if creating an invite fails", async () => {
    vi.mocked(actions.createInviteAction).mockResolvedValue({ ok: false, error: "nope" });
    render(<HouseholdClient {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Create invite link" }));
    expect(await screen.findByText("nope")).toBeInTheDocument();
  });

  it("revokes an invite", async () => {
    render(<HouseholdClient {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(actions.revokeInviteAction).toHaveBeenCalledWith("i1"));
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces an action error and can dismiss it", async () => {
    vi.mocked(actions.revokeInviteAction).mockResolvedValue({ ok: false, error: "That invite is no longer pending." });
    render(<HouseholdClient {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("That invite is no longer pending.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByText("That invite is no longer pending.")).toBeNull());
  });

  it("approves and declines join requests", async () => {
    render(<HouseholdClient {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(actions.decideJoinRequestAction).toHaveBeenCalledWith("r1", "approve"));
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(actions.decideJoinRequestAction).toHaveBeenCalledWith("r1", "decline"));
  });

  it("turns join requests on, and shows an error when that fails", async () => {
    render(<HouseholdClient {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Turn on join requests" }));
    await waitFor(() => expect(actions.setJoinCodeAction).toHaveBeenCalledWith(true));
    expect(refresh).toHaveBeenCalled();
    vi.mocked(actions.setJoinCodeAction).mockResolvedValue({ ok: false, error: "Could not make a code. Try again." });
    await userEvent.click(screen.getByRole("button", { name: "Turn on join requests" }));
    expect(await screen.findByText("Could not make a code. Try again.")).toBeInTheDocument();
  });

  it("shows the code, and can replace it or turn it off", async () => {
    render(<HouseholdClient {...base} joinCode="ABCD2345" />);
    expect(screen.getByText("ABCD2345")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "New code" }));
    await waitFor(() => expect(actions.setJoinCodeAction).toHaveBeenCalledWith(true));
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(actions.setJoinCodeAction).toHaveBeenCalledWith(false));
  });

  it("promotes a member", async () => {
    render(<HouseholdClient {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Make owner" }));
    await waitFor(() => expect(actions.promoteMemberAction).toHaveBeenCalledWith("m2"));
  });

  it("removes a member after confirming", async () => {
    render(<HouseholdClient {...base} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    const confirm = await waitFor(() => {
      const el = document.querySelector(".ant-popconfirm .ant-btn-primary");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await userEvent.click(confirm);
    await waitFor(() => expect(actions.removeMemberAction).toHaveBeenCalledWith("m2"));
  });

  it("leaves after confirming", async () => {
    render(<HouseholdClient {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Leave household" }));
    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => expect(actions.leaveHouseholdAction).toHaveBeenCalled());
  });
});

describe("HouseholdClient as member", () => {
  it("shows members and Leave only", () => {
    render(<HouseholdClient {...base} isOwner={false} currentUserId="m2" invites={[]} requests={[]} />);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByText("Invite someone")).toBeNull();
    expect(screen.getByRole("button", { name: "Leave household" })).toBeInTheDocument();
  });
});

describe("AcceptInvite", () => {
  it("accepts using the token, and shows an error", async () => {
    vi.mocked(acceptHouseholdInviteAction).mockResolvedValue({ error: "This invite has expired. Ask for a new one." });
    render(<AcceptInvite token="tok" />);
    await userEvent.click(screen.getByRole("button", { name: "Join this household" }));
    await waitFor(() => expect(acceptHouseholdInviteAction).toHaveBeenCalledWith("tok"));
    expect(await screen.findByText("This invite has expired. Ask for a new one.")).toBeInTheDocument();
  });
});

describe("JoinRequestForm", () => {
  it("submits the code and shows an error", async () => {
    vi.mocked(requestJoinAction).mockResolvedValue({ error: "No household uses that code." });
    render(<JoinRequestForm />);
    await userEvent.type(screen.getByPlaceholderText("Household code"), "ABCD2345");
    await userEvent.click(screen.getByRole("button", { name: "Ask to join" }));
    await waitFor(() => expect(requestJoinAction).toHaveBeenCalled());
    expect((vi.mocked(requestJoinAction).mock.calls[0][1] as FormData).get("joinCode")).toBe("ABCD2345");
    expect(await screen.findByText("No household uses that code.")).toBeInTheDocument();
  });
});
