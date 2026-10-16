// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/calendar/actions", () => ({ createCalendarItemAction: vi.fn(), updateCalendarItemAction: vi.fn(), deleteCalendarItemAction: vi.fn() }));

import HomeNewEvent from "@/app/(app)/home/HomeNewEvent";

describe("HomeNewEvent", () => {
  it("is a small + that opens the calendar's New event form on today, offering Google when there is a calendar", async () => {
    render(
      <App>
        <HomeNewEvent today="2026-10-15" assignees={[{ id: "m1", name: "Sam", fullName: "Sam Doe" }]} googleCalendarName="Family" />
      </App>,
    );
    const button = screen.getByRole("button", { name: "New event" });
    expect(button).toHaveClass("ant-btn-primary", "ant-btn-sm");
    expect(button).not.toHaveTextContent("New event");
    await userEvent.click(button);
    const form = within(await screen.findByRole("dialog"));
    expect(form.getByLabelText("Date")).toHaveValue("2026-10-15");
    expect(form.getByRole("checkbox", { name: /Create Google Calendar event/ })).toBeChecked();
    await userEvent.click(form.getByRole("button", { name: "Cancel" }));
  });
});
