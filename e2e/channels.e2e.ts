import { expect } from "@playwright/test";
import { addMember, gotoMissing, newChannel, newOwner, newSession, syncHouseholds, test } from "./helpers";

const confirm = (page: import("@playwright/test").Page) => page.locator(".ant-popconfirm .ant-btn-primary").click();

test("channels: the creator manages, members can leave, General is automatic", async ({ browser }) => {
  const owner = await newSession(browser);
  await newOwner(owner.page, "chowner", "The Channelers");
  const mate = await addMember(browser, owner.page, "chmate");

  // General holds everyone from the start, including someone who joined later, and can't be left.
  await mate.page.goto(`/messages`);
  await mate.page.getByText("General").first().click();
  await expect(mate.page.getByText("Everyone")).toBeVisible();
  await mate.page.getByRole("button", { name: /People \(2\)/ }).click();
  await expect(mate.page.getByRole("button", { name: "Leave channel" })).toHaveCount(0);
  await expect(mate.page.getByText("General always includes everyone in your household.")).toBeVisible();

  // The owner starts a channel with the member and manages it.
  await newChannel(owner.page, "Plans", [mate.name]);
  await owner.page.getByRole("button", { name: /People \(2\)/ }).click();
  await expect(owner.page.getByText("Manager")).toBeVisible();
  const channelPath = new URL(owner.page.url()).pathname;

  // The member sees no management controls.
  await mate.page.goto(channelPath);
  await mate.page.getByRole("button", { name: /People \(2\)/ }).click();
  await expect(mate.page.getByRole("button", { name: "Rename" })).toHaveCount(0);
  await expect(mate.page.getByRole("button", { name: "Archive channel" })).toHaveCount(0);
  await expect(mate.page.getByRole("button", { name: "Remove" })).toHaveCount(0);

  // The manager renames it.
  await owner.page.getByLabel("Channel name").fill("Plans 2");
  await owner.page.getByRole("button", { name: "Rename" }).click();
  await expect(owner.page.getByRole("heading", { name: "Plans 2" })).toBeVisible();

  // The member leaves, and loses access straight away.
  await mate.page.getByRole("button", { name: "Leave channel" }).click();
  await confirm(mate.page);
  await expect(mate.page).toHaveURL(/\/messages$/);
  await expect(mate.page.getByText("Plans 2")).toHaveCount(0);
  await gotoMissing(mate.page, channelPath);
  await expect(mate.page.getByText(/could not be found/i)).toBeVisible();

  // The manager adds them back, then archives and restores the channel.
  await owner.page.reload();
  await owner.page.getByRole("button", { name: /People \(1\)/ }).click();
  await owner.page.getByRole("dialog").getByRole("combobox").first().click();
  await owner.page.locator(`.ant-select-item-option[title="${mate.name}"]`).click();
  await owner.page.locator(".ant-modal-title").click();
  await owner.page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(owner.page.getByRole("button", { name: /People \(2\)/ })).toBeVisible();

  await owner.page.getByRole("button", { name: "Archive channel" }).click();
  await expect(owner.page.getByText("Unarchive this channel to send messages.")).toBeVisible();
  await owner.page.goto(`/messages?archived=1`);
  await expect(owner.page.getByText("Plans 2")).toBeVisible();
  await owner.page.goto(`/messages`);
  await expect(owner.page.getByText("Plans 2")).toHaveCount(0);

  for (const s of [owner, mate]) await s.context.close();
});

test("channels: people from synced households only, and only if all the households are connected", async ({ browser }) => {
  const a = await newSession(browser);
  const b = await newSession(browser);
  const c = await newSession(browser);
  const d = await newSession(browser);
  await newOwner(a.page, "cha", "The Chas");
  const ownerB = await newOwner(b.page, "chb", "The Chbs");
  const ownerC = await newOwner(c.page, "chc", "The Chcs");
  await newOwner(d.page, "chd", "The Chds");

  // A is synced with B and with C, but B and C are not synced with each other. D is synced with no one.
  await syncHouseholds(a.page, b.page, ownerB.email, "chb");
  await syncHouseholds(a.page, c.page, ownerC.email, "chc");

  // D can pick only their own household; nobody else is offered.
  await d.page.goto(`/messages`);
  await d.page.getByRole("button", { name: "New channel" }).click();
  await d.page.getByRole("dialog").getByRole("combobox").click();
  await expect(d.page.locator(".ant-select-item-option")).toHaveCount(0);
  await expect(d.page.getByText(/No one else is available yet/)).toBeVisible();

  // A can offer people from both households. A channel with B's person is shared.
  await newChannel(a.page, "With B", ["Casey chb"]);
  await expect(a.page.getByText("Shared")).toBeVisible();
  await a.page.getByRole("button", { name: /People \(2\)/ }).click();
  await expect(a.page.getByRole("dialog").getByText("The Chbs")).toBeVisible();

  // Adding C's person would put B and C in one channel without being connected: refused.
  await a.page.getByRole("dialog").getByRole("combobox").first().click();
  await a.page.locator(`.ant-select-item-option[title="Casey chc"]`).click();
  await a.page.locator(".ant-modal-title").click();
  await a.page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(a.page.getByText("Everyone in a channel must be in households that are connected to each other.")).toBeVisible();

  // The same mix is refused when creating a channel.
  await a.page.goto(`/messages`);
  await a.page.getByRole("button", { name: "New channel" }).click();
  await a.page.getByPlaceholder("Name, e.g. Weekend plans").fill("Everyone");
  await a.page.getByRole("dialog").getByRole("combobox").click();
  await a.page.locator(`.ant-select-item-option[title="Casey chb"]`).click();
  await a.page.locator(`.ant-select-item-option[title="Casey chc"]`).click();
  await a.page.locator(".ant-modal-title").click();
  await a.page.getByRole("button", { name: "Create" }).click();
  await expect(a.page.getByText("Everyone in a channel must be in households that are connected to each other.")).toBeVisible();

  for (const s of [a, b, c, d]) await s.context.close();
});
