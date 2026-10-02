import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireHouseholdId: vi.fn() }));
vi.mock("@/lib/db", () => {
  const prisma: any = {
    household: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    activityLogEntry: { create: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import {
  createHouseholdAction,
  updateHouseholdAction,
  deleteHouseholdAction,
} from "@/app/[slug]/(app)/contacts/households/householdActions";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const valid = { displayName: " The Joneses " };
const existing = (over: object = {}) => ({
  id: "x1", ownerHouseholdId: "h1", deletedAt: null, displayName: "The Joneses", mailingAddress: null, tags: [], notes: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireHouseholdId).mockResolvedValue("h1");
  vi.mocked(prisma.household.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.household.findUnique).mockResolvedValue(existing() as any);
});

describe("all three actions require a household session", () => {
  it.each([
    ["create", () => createHouseholdAction("s", valid)],
    ["update", () => updateHouseholdAction("s", "x1", valid)],
    ["delete", () => deleteHouseholdAction("s", "x1")],
  ])("%s", async (_n, call) => {
    vi.mocked(requireHouseholdId).mockRejectedValue(new Error("Not authenticated"));
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.household.create).not.toHaveBeenCalled();
    expect(prisma.household.update).not.toHaveBeenCalled();
  });
});

describe("createHouseholdAction", () => {
  it("reports a missing name without writing", async () => {
    expect(await createHouseholdAction("s", { displayName: "" })).toEqual({
      ok: false,
      error: "Household name is required",
      fieldErrors: { displayName: "Household name is required" },
    });
    expect(prisma.household.create).not.toHaveBeenCalled();
  });

  it("creates the household in the caller's directory and logs it", async () => {
    const r = await createHouseholdAction("s", {
      displayName: " The Joneses ", mailingAddress: "1 Main St", tags: ["a", "a", "b"], notes: "hi",
    });
    expect(r).toEqual({ ok: true, id: "new1" });
    expect(vi.mocked(prisma.household.create).mock.calls[0][0].data).toEqual({
      displayName: "The Joneses", mailingAddress: "1 Main St", tags: ["a", "b"], notes: "hi", ownerHouseholdId: "h1",
    });
    expect(prisma.activityLogEntry.create).toHaveBeenCalledWith({
      data: { entityType: "HOUSEHOLD", entityId: "new1", action: "CREATED", source: "MANUAL" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/s/contacts/households");
  });

  it("stores blank optional fields as null", async () => {
    await createHouseholdAction("s", valid);
    expect(vi.mocked(prisma.household.create).mock.calls[0][0].data).toMatchObject({ mailingAddress: null, notes: null });
  });
});

describe("updateHouseholdAction", () => {
  it.each([
    ["missing", null],
    ["in another directory", existing({ ownerHouseholdId: "other" })],
  ])("won't edit a household that is %s", async (_n, value) => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(value as any);
    expect(await updateHouseholdAction("s", "x1", valid)).toEqual({ ok: false, error: "Household not found." });
    expect(prisma.household.update).not.toHaveBeenCalled();
  });

  it("won't edit a removed household", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(existing({ deletedAt: new Date() }) as any);
    expect(await updateHouseholdAction("s", "x1", valid)).toEqual({ ok: false, error: "Restore this household before editing it." });
  });

  it("can edit the caller's own household record", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(existing({ id: "h1", ownerHouseholdId: null }) as any);
    expect(await updateHouseholdAction("s", "h1", { displayName: "The Beckers" })).toEqual({ ok: true, id: "h1" });
  });

  it("returns field errors", async () => {
    const r = await updateHouseholdAction("s", "x1", { displayName: " " });
    expect(r).toMatchObject({ ok: false, fieldErrors: { displayName: "Household name is required" } });
    expect(prisma.household.update).not.toHaveBeenCalled();
  });

  it("updates only data fields and logs what changed, before and after", async () => {
    const r = await updateHouseholdAction("s", "x1", { displayName: "The Joneses", mailingAddress: "2 Oak St" });
    expect(r).toEqual({ ok: true, id: "x1" });
    const update = vi.mocked(prisma.household.update).mock.calls[0][0];
    expect(update.where).toEqual({ id: "x1" });
    expect(Object.keys(update.data as object).sort()).toEqual(["displayName", "mailingAddress", "notes", "tags"]);
    const log = vi.mocked(prisma.activityLogEntry.create).mock.calls[0][0].data as any;
    expect(log).toMatchObject({ entityType: "HOUSEHOLD", action: "UPDATED", source: "MANUAL" });
    expect(log.changedFields).toEqual({ before: { mailingAddress: null }, after: { mailingAddress: "2 Oak St" } });
    expect(revalidatePath).toHaveBeenCalledWith("/s/contacts/households/x1");
  });
});

describe("deleteHouseholdAction", () => {
  it.each([
    ["missing", null],
    ["in another directory", existing({ ownerHouseholdId: "other" })],
    ["already removed", existing({ deletedAt: new Date() })],
  ])("won't remove a household that is %s", async (_n, value) => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(value as any);
    expect(await deleteHouseholdAction("s", "x1")).toEqual({ ok: false, error: "Household not found." });
    expect(prisma.household.update).not.toHaveBeenCalled();
  });

  it("won't remove the caller's own household", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(existing({ id: "h1", ownerHouseholdId: null }) as any);
    expect(await deleteHouseholdAction("s", "h1")).toEqual({ ok: false, error: "You can't remove your own household." });
    expect(prisma.household.update).not.toHaveBeenCalled();
  });

  it("soft-deletes and logs it", async () => {
    expect(await deleteHouseholdAction("s", "x1")).toEqual({ ok: true, id: "x1" });
    expect(prisma.household.update).toHaveBeenCalledWith({ where: { id: "x1" }, data: { deletedAt: expect.any(Date) } });
    expect(prisma.activityLogEntry.create).toHaveBeenCalledWith({
      data: { entityType: "HOUSEHOLD", entityId: "x1", action: "DELETED", source: "MANUAL" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/s/contacts/removed");
  });
});
