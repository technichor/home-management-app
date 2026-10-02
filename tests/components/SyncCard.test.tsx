// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/contacts/[id]/syncActions", () => ({
  requestSyncAction: vi.fn(),
  regenerateInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
}));
vi.mock("@/app/invite/[token]/actions", () => ({ respondToInviteAction: vi.fn() }));

import SyncCard, { SyncInfo } from "@/app/(app)/contacts/[id]/SyncCard";
import InviteResponse from "@/app/invite/[token]/InviteResponse";
import { requestSyncAction, regenerateInviteAction, revokeInviteAction } from "@/app/(app)/contacts/[id]/syncActions";
import { respondToInviteAction } from "@/app/invite/[token]/actions";

const sync = (over: Partial<SyncInfo> = {}): SyncInfo => ({
  id: "sy1",
  status: "PENDING",
  counterpartEmail: "pat@x.com",
  counterpartHouseholdName: null,
  ...over,
});

function setup(info: SyncInfo | null = null, defaultEmail = "pat@x.com") {
  return render(
    <App>
      <SyncCard contactId="c1" defaultEmail={defaultEmail} sync={info} />
    </App>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestSyncAction).mockResolvedValue({ ok: true, invitePath: "/invite/abc" });
  vi.mocked(regenerateInviteAction).mockResolvedValue({ ok: true, invitePath: "/invite/new" });
  vi.mocked(revokeInviteAction).mockResolvedValue({ ok: true });
});

describe("SyncCard: requesting", () => {
  it("prefills the email and shows a one-time link after requesting", async () => {
    setup();
    expect(screen.getByLabelText("Email address")).toHaveValue("pat@x.com");
    await userEvent.click(screen.getByRole("button", { name: "Request sync" }));
    await waitFor(() => expect(requestSyncAction).toHaveBeenCalledWith("c1", "pat@x.com"));
    expect(await screen.findByLabelText("Invite link")).toHaveValue(`${window.location.origin}/invite/abc`);
    expect(screen.getByText(/does not send email/)).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("sends the edited email", async () => {
    setup(null, "");
    const request = screen.getByRole("button", { name: "Request sync" });
    expect(request).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Email address"), "new@x.com");
    await userEvent.click(request);
    await waitFor(() => expect(requestSyncAction).toHaveBeenCalledWith("c1", "new@x.com"));
  });

  it("shows the server's reason when the request is refused, with no link", async () => {
    vi.mocked(requestSyncAction).mockResolvedValue({ ok: false, error: "Enter a valid email address" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Request sync" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.queryByLabelText("Invite link")).not.toBeInTheDocument();
  });

  it("shows an error when the call itself fails, with a generic one for non-errors", async () => {
    vi.mocked(requestSyncAction).mockRejectedValueOnce(new Error("Not authenticated"));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Request sync" }));
    expect(await screen.findByText("Not authenticated")).toBeInTheDocument();
    vi.mocked(requestSyncAction).mockRejectedValueOnce("boom");
    // antd keeps a loading spinner in the button's name while it animates out.
    await userEvent.click(screen.getByRole("button", { name: /Request sync/ }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("copies the link", async () => {
    // userEvent installs its own clipboard, so spy on that one.
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    setup();
    await user.click(screen.getByRole("button", { name: "Request sync" }));
    await screen.findByLabelText("Invite link");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(write).toHaveBeenCalledWith(`${window.location.origin}/invite/abc`));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("explains how to copy by hand when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    setup();
    await user.click(screen.getByRole("button", { name: "Request sync" }));
    await screen.findByLabelText("Invite link");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
  });

  it("selects the whole link when focused", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Request sync" }));
    const input = (await screen.findByLabelText("Invite link")) as HTMLInputElement;
    const select = vi.spyOn(input, "select");
    await userEvent.click(input);
    expect(select).toHaveBeenCalled();
  });
});

describe("SyncCard: existing sync", () => {
  it("shows an active sync with the household name and no request form", () => {
    setup(sync({ status: "ACTIVE", counterpartHouseholdName: "Reynolds" }));
    expect(screen.getByText("Synced with Reynolds")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request sync" })).not.toBeInTheDocument();
  });

  it("shows an active sync even if the household name is unknown", () => {
    setup(sync({ status: "ACTIVE" }));
    expect(screen.getByText("Synced")).toBeInTheDocument();
  });

  it("shows a pending invite and offers a new link, but no new request", async () => {
    setup(sync());
    expect(screen.getByText("pat@x.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request sync" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get a new link" }));
    await waitFor(() => expect(regenerateInviteAction).toHaveBeenCalledWith("sy1"));
    expect(await screen.findByLabelText("Invite link")).toHaveValue(`${window.location.origin}/invite/new`);
  });

  async function confirmRevoke() {
    await userEvent.click(screen.getByRole("button", { name: "Revoke invite" }));
    const ok = await waitFor(() => {
      const el = document.querySelector(".ant-popconfirm .ant-btn-primary");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await userEvent.click(ok);
  }

  it("revokes a pending invite after confirming, drops the shown link, and refreshes", async () => {
    setup(sync());
    await userEvent.click(screen.getByRole("button", { name: "Get a new link" }));
    await screen.findByLabelText("Invite link");
    router.refresh.mockClear();
    await confirmRevoke();
    await waitFor(() => expect(revokeInviteAction).toHaveBeenCalledWith("sy1"));
    expect(await screen.findByText("Invite revoked. Its link no longer works.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Invite link")).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("only offers Revoke for a pending invite", () => {
    setup(sync({ status: "ACTIVE" }));
    expect(screen.queryByRole("button", { name: "Revoke invite" })).not.toBeInTheDocument();
  });

  it("shows why a revoke failed", async () => {
    vi.mocked(revokeInviteAction).mockResolvedValue({ ok: false, error: "Only a pending invite can be revoked." });
    setup(sync());
    await confirmRevoke();
    expect(await screen.findByText("Only a pending invite can be revoked.")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("copes with the revoke call throwing", async () => {
    vi.mocked(revokeInviteAction).mockRejectedValueOnce(new Error("offline"));
    setup(sync());
    await confirmRevoke();
    expect(await screen.findByText("offline")).toBeInTheDocument();
    vi.mocked(revokeInviteAction).mockRejectedValueOnce("boom");
    await confirmRevoke();
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("lets you ask again after a decline", () => {
    setup(sync({ status: "DECLINED" }));
    expect(screen.getByText("They declined the last invite.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request sync" })).toBeInTheDocument();
  });

  it("lets you ask again after a revoke", () => {
    setup(sync({ status: "REVOKED" }));
    expect(screen.getByText("The last sync was revoked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request sync" })).toBeInTheDocument();
  });
});

describe("InviteResponse", () => {
  function respondSetup() {
    return render(
      <App>
        <InviteResponse token="tok" />
      </App>
    );
  }

  it("accepts and refreshes", async () => {
    vi.mocked(respondToInviteAction).mockResolvedValue({ ok: true, status: "ACTIVE" });
    respondSetup();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(respondToInviteAction).toHaveBeenCalledWith("tok", "accept"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("declines and refreshes", async () => {
    vi.mocked(respondToInviteAction).mockResolvedValue({ ok: true, status: "DECLINED" });
    respondSetup();
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(respondToInviteAction).toHaveBeenCalledWith("tok", "decline"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows the reason when the answer is refused", async () => {
    vi.mocked(respondToInviteAction).mockResolvedValue({ ok: false, error: "This invite was already answered." });
    respondSetup();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("This invite was already answered.")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows an error when the call fails, and a generic one for non-errors", async () => {
    vi.mocked(respondToInviteAction).mockRejectedValueOnce(new Error("Not authenticated"));
    respondSetup();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Not authenticated")).toBeInTheDocument();
    vi.mocked(respondToInviteAction).mockRejectedValueOnce("boom");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });
});
