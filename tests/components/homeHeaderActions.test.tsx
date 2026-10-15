// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/calendar/actions", () => ({ createCalendarItemAction: vi.fn(), updateCalendarItemAction: vi.fn(), deleteCalendarItemAction: vi.fn() }));

import HomeHeaderActions, { HOME_REFRESH_MS } from "@/app/(app)/home/HomeHeaderActions";

const attention = [
  { key: "a", title: "Weekend plans has 2 unread messages", support: "In Messages.", href: "/messages/c1" },
  { key: "b", title: "Ann Ray asked to join your household", support: "On the Household page.", href: "/household" },
];
const setup = (over: Partial<React.ComponentProps<typeof HomeHeaderActions>> = {}) =>
  render(
    <App>
      <HomeHeaderActions today="2026-10-15" assignees={[{ id: "m1", name: "Sam", fullName: "Sam Doe" }]} googleCalendarName={null} attention={attention} {...over} />
    </App>,
  );

beforeEach(() => vi.clearAllMocks());

describe("HomeHeaderActions", () => {
  it("opens the calendar's New event form on today", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "New event" }));
    const form = within(await screen.findByRole("dialog"));
    expect(form.getByLabelText("Date")).toHaveValue("2026-10-15");
    await userEvent.click(form.getByRole("button", { name: "Cancel" }));
  });

  it("counts what needs attention on the bell, and lists it there", async () => {
    setup();
    const bell = screen.getByRole("button", { name: "Needs attention, 2 items" });
    expect(document.querySelector(".ant-badge-count")).toHaveTextContent("2");
    await userEvent.click(bell);
    const list = await screen.findByRole("link", { name: /Weekend plans/ });
    expect(list).toHaveAttribute("href", "/messages/c1");
    expect(screen.getByRole("link", { name: /Ann Ray/ })).toHaveAttribute("href", "/household");
  });

  it("has no count when nothing needs attention, and says so", async () => {
    setup({ attention: [] });
    expect(document.querySelector(".ant-badge-count")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Needs attention, 0 items" }));
    expect(await screen.findByText("Nothing needs attention.")).toBeInTheDocument();
  });

  it("names one item in the singular", () => {
    setup({ attention: attention.slice(0, 1) });
    expect(screen.getByRole("button", { name: "Needs attention, 1 item" })).toBeInTheDocument();
  });

  describe("keeping fresh", () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it("looks again every few minutes while visible, and on focus, until it is gone", () => {
      const { unmount } = setup();
      vi.advanceTimersByTime(HOME_REFRESH_MS);
      expect(router.refresh).toHaveBeenCalledTimes(1);
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      vi.advanceTimersByTime(HOME_REFRESH_MS);
      expect(router.refresh).toHaveBeenCalledTimes(1);
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      window.dispatchEvent(new Event("focus"));
      expect(router.refresh).toHaveBeenCalledTimes(2);
      unmount();
      vi.advanceTimersByTime(HOME_REFRESH_MS);
      window.dispatchEvent(new Event("focus"));
      expect(router.refresh).toHaveBeenCalledTimes(2);
    });
  });
});
