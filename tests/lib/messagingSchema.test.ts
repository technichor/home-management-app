import { describe, it, expect } from "vitest";
import { Prisma, SyncStatus, ConversationKind, ConversationRole } from "@prisma/client";

// Guards the messaging schema against accidental renames or drift from the agreed spec.
describe("messaging schema", () => {
  it("has the Sync, Conversation and Message models", () => {
    expect(Object.values(Prisma.ModelName)).toEqual(
      expect.arrayContaining(["Sync", "Conversation", "Message"])
    );
  });

  it("has the agreed sync statuses", () => {
    expect(Object.values(SyncStatus).sort()).toEqual(["ACTIVE", "DECLINED", "PENDING", "REVOKED"]);
  });

  it("has the agreed channel kinds and roles", () => {
    expect(Object.values(ConversationKind).sort()).toEqual(["CHANNEL", "GENERAL"]);
    expect(Object.values(ConversationRole).sort()).toEqual(["MANAGER", "MEMBER"]);
  });

  it("has channel members, and messages are sent by a user", () => {
    expect(Object.values(Prisma.ModelName)).toContain("ConversationMember");
    const fields = Prisma.dmmf.datamodel.models.find((m) => m.name === "Message")!.fields.map((f) => f.name);
    expect(fields).toContain("senderUserId");
    expect(fields).not.toContain("senderContactId");
  });

  it("keeps messages soft-delete only, with no editedAt column", () => {
    const fields = Prisma.dmmf.datamodel.models.find((m) => m.name === "Message")!.fields.map((f) => f.name);
    expect(fields).toContain("deletedAt");
    expect(fields).not.toContain("editedAt");
    expect(fields).not.toContain("updatedAt");
  });

  it("derives synced status from Sync rows rather than storing it on Contact", () => {
    const contact = Prisma.dmmf.datamodel.models.find((m) => m.name === "Contact")!.fields.map((f) => f.name);
    expect(contact).toContain("syncs");
    expect(contact).not.toContain("synced");
    expect(contact).not.toContain("syncStatus");
  });
});
