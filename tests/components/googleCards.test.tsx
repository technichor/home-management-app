// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/account/googleActions", () => ({ setSharedCalendarsAction: vi.fn(), disconnectGoogleAction: vi.fn() }));
vi.mock("@/app/(app)/household/googleActions", () => ({
  setHouseholdGoogleCalendarAction: vi.fn(),
  stopHouseholdGoogleCalendarAction: vi.fn(),
  setHouseholdTimeZoneAction: vi.fn(),
}));

import GoogleAccountCard from "@/components/GoogleAccountCard";
import HouseholdGoogleCard from "@/components/HouseholdGoogleCard";
import type { GoogleAccountView, HouseholdGoogleView } from "@/lib/googleCalendar";
import { disconnectGoogleAction, setSharedCalendarsAction } from "@/app/(app)/account/googleActions";
import { setHouseholdGoogleCalendarAction, setHouseholdTimeZoneAction, stopHouseholdGoogleCalendarAction } from "@/app/(app)/household/googleActions";

const cal = (id: string, over: object = {}) => ({ id, name: `Cal ${id}`, color: null, canWrite: true, primary: false, ...over });

beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of [setSharedCalendarsAction, disconnectGoogleAction, setHouseholdGoogleCalendarAction, stopHouseholdGoogleCalendarAction, setHouseholdTimeZoneAction]) {
    vi.mocked(fn).mockResolvedValue({ ok: true });
  }
});

describe("GoogleAccountCard", () => {
  const view = (over: Partial<GoogleAccountView> = {}): GoogleAccountView => ({
    configured: true,
    connection: { email: "sam@gmail.com", needsReconnect: false },
    calendars: [cal("me", { primary: true, color: "#f00" }), cal("work")],
    shared: ["work"],
    ...over,
  });
  const setup = (v: GoogleAccountView, outcome: string | null = null) =>
    render(
      <App>
        <GoogleAccountCard view={v} outcome={outcome} />
      </App>,
    );

  it("says when Google isn't set up", () => {
    setup(view({ configured: false, connection: null }));
    expect(screen.getByText("Google Calendar isn't set up for Domata yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Connect/ })).toBeNull();
  });

  it("offers to link Google with a full page load to the connect route", () => {
    setup(view({ connection: null, calendars: null, shared: [] }));
    expect(screen.getByRole("link", { name: "Connect Google Calendar" })).toHaveAttribute("href", "/api/google/connect");
  });

  it.each([
    ["connected", "Google is linked. Choose which of your calendars the household sees."],
    ["cancelled", "Linking Google was cancelled."],
    ["failed", "Google couldn't be linked. Try again."],
    ["unavailable", "Google isn't set up for Domata yet."],
  ])("reports the outcome %s", (outcome, text) => {
    setup(view(), outcome);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("ignores an unknown outcome", () => {
    setup(view(), "weird");
    expect(document.querySelector(".ant-alert")).toBeNull();
  });

  it("shows the linked account and its calendars, ticking the shared ones, and saves a change", async () => {
    setup(view());
    expect(screen.getByText("sam@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("(your main calendar)")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Cal work/ })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /Cal me/ }));
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(setSharedCalendarsAction).toHaveBeenCalledWith(["work", "me"]));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("counts a swapped choice as a change", async () => {
    setup(view());
    await userEvent.click(screen.getByRole("checkbox", { name: /Cal work/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Cal me/ }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows why saving failed", async () => {
    vi.mocked(setSharedCalendarsAction).mockResolvedValue({ ok: false, error: "Connect Google again first" });
    setup(view());
    await userEvent.click(screen.getByRole("checkbox", { name: /Cal me/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Connect Google again first")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("asks to connect again when the link is refused, or the calendars couldn't be read", () => {
    setup(view({ connection: { email: "sam@gmail.com", needsReconnect: true }, calendars: null }));
    expect(screen.getByText("Google no longer accepts this link.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect again" })).toHaveAttribute("href", "/api/google/connect");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    render(
      <App>
        <GoogleAccountCard view={view({ calendars: null })} outcome={null} />
      </App>,
    );
    expect(screen.getByText("Your Google calendars couldn't be read just now.")).toBeInTheDocument();
  });

  it("unlinks after confirming", async () => {
    setup(view());
    await userEvent.click(screen.getByRole("button", { name: "Unlink Google" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(disconnectGoogleAction).toHaveBeenCalled());
  });
});

describe("HouseholdGoogleCard", () => {
  const view = (over: Partial<HouseholdGoogleView> = {}): HouseholdGoogleView => ({
    configured: true,
    timeZone: "America/New_York",
    calendar: null,
    myWritable: [cal("me"), cal("fam")],
    ...over,
  });
  const setup = (v: HouseholdGoogleView, isOwner = true) =>
    render(
      <App>
        <HouseholdGoogleCard view={v} isOwner={isOwner} timeZones={["America/New_York", "Asia/Tokyo"]} />
      </App>,
    );

  it("shows a member the time zone and calendar without controls", () => {
    setup(view({ calendar: { name: "Family", ownerEmail: "ann@gmail.com", mine: false, needsReconnect: false } }), false);
    expect(screen.getByText("America/New York")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/in ann@gmail.com's Google account/)).toBeInTheDocument();
  });

  it("lets an owner change the time zone", async () => {
    setup(view());
    await userEvent.click(screen.getByRole("combobox", { name: "Time zone" }));
    await userEvent.click(await screen.findByTitle("Asia/Tokyo"));
    await waitFor(() => expect(setHouseholdTimeZoneAction).toHaveBeenCalledWith("Asia/Tokyo"));
  });

  it("says when Google isn't set up", () => {
    setup(view({ configured: false }));
    expect(screen.getByText("Google Calendar isn't set up for Domata yet.")).toBeInTheDocument();
  });

  it("has an owner link Google before choosing", () => {
    setup(view({ myWritable: null }));
    expect(screen.getByText("Not chosen: events made in Domata stay in Domata.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "connect your Google account" })).toHaveAttribute("href", "/account");
  });

  it("lets an owner choose one of their calendars, the first by default", async () => {
    setup(view());
    await userEvent.click(screen.getByRole("button", { name: "Use this calendar" }));
    await waitFor(() => expect(setHouseholdGoogleCalendarAction).toHaveBeenCalledWith("me"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("lets an owner create a new calendar instead", async () => {
    setup(view());
    await userEvent.click(screen.getByRole("combobox", { name: "Household Google calendar" }));
    await userEvent.click(await screen.findByTitle("Create a new calendar for the household"));
    await userEvent.click(screen.getByText("Use this calendar"));
    await waitFor(() => expect(setHouseholdGoogleCalendarAction).toHaveBeenCalledWith("new"));
  });

  it("offers a new calendar when the owner has none they can add to", async () => {
    setup(view({ myWritable: [] }));
    await userEvent.click(screen.getByRole("button", { name: "Use this calendar" }));
    await waitFor(() => expect(setHouseholdGoogleCalendarAction).toHaveBeenCalledWith("new"));
  });

  it("shows the chosen calendar in the owner's own account, and can stop using it", async () => {
    setup(view({ calendar: { name: "Family", ownerEmail: "me@gmail.com", mine: true, needsReconnect: false } }));
    expect(screen.getByText(/in your Google account/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop using Google" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(stopHouseholdGoogleCalendarAction).toHaveBeenCalled());
  });

  it("warns when the calendar's owner must connect again", () => {
    setup(view({ calendar: { name: "Family", ownerEmail: "me@gmail.com", mine: true, needsReconnect: true } }));
    expect(screen.getByText(/connect Google again on your Account page/)).toBeInTheDocument();
    render(
      <App>
        <HouseholdGoogleCard view={view({ calendar: { name: "Family", ownerEmail: null, mine: false, needsReconnect: true } })} isOwner={false} timeZones={[]} />
      </App>,
    );
    expect(screen.getByText(/its owner needs to connect Google again/)).toBeInTheDocument();
  });

  it("shows why a change failed", async () => {
    vi.mocked(setHouseholdGoogleCalendarAction).mockResolvedValue({ ok: false, error: "Google Calendar: Busy (503)" });
    setup(view());
    await userEvent.click(screen.getByRole("button", { name: "Use this calendar" }));
    expect(await screen.findByText("Google Calendar: Busy (503)")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
