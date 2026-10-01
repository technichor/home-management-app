import { describe, it, expect } from "vitest";
import { Prisma, SyncStatus, ConversationScope } from "@prisma/client";

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

  it("has the agreed conversation scopes", () => {
    expect(Object.values(ConversationScope).sort()).toEqual(["HOUSEHOLD", "SYNCED"]);
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
