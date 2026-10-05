import { describe, it, expect } from "vitest";
import { attempt, UserError } from "@/lib/actionResult";

describe("attempt", () => {
  it("wraps a value as ok, and an empty result as plain ok", async () => {
    expect(await attempt(async () => ({ id: "x" }))).toEqual({ ok: true, id: "x" });
    expect(await attempt(async () => {})).toEqual({ ok: true });
  });

  it("turns a UserError into an error result", async () => {
    expect(await attempt(async () => { throw new UserError("Nope"); })).toEqual({ ok: false, error: "Nope" });
  });

  it("lets any other error through", async () => {
    await expect(attempt(async () => { throw new Error("db down"); })).rejects.toThrow("db down");
  });
});
