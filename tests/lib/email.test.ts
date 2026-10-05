import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: { emailLogEntry: { create: vi.fn(), deleteMany: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { sendEmail, appUrl } from "@/lib/email";

const message = { to: "a@b.co", subject: "Hi", text: "Hello" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("APP_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  it("logs instead of sending when there is no API key", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await sendEmail(message);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain("a@b.co");
    expect(prisma.emailLogEntry.create).toHaveBeenCalledWith({
      data: { toAddress: "a@b.co", subject: "Hi", status: "NOT_SENT", error: "No RESEND_API_KEY is configured." },
    });
  });

  it("posts to Resend with the test sender by default", async () => {
    vi.stubEnv("RESEND_API_KEY", "key123");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"msg_123"}', { status: 200 }));
    await sendEmail(message);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as any).Authorization).toBe("Bearer key123");
    expect(JSON.parse(init.body as string)).toEqual({ from: "Domata <onboarding@resend.dev>", ...message });
  });

  it("records an accepted send with the provider's message id, and never the body", async () => {
    vi.stubEnv("RESEND_API_KEY", "key123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"msg_123"}', { status: 200 }));
    await sendEmail({ ...message, text: "secret link https://x/reset/abc" });
    const data = vi.mocked(prisma.emailLogEntry.create).mock.calls[0][0].data;
    expect(data).toEqual({ toAddress: "a@b.co", subject: "Hi", status: "SENT", providerId: "msg_123" });
    expect(JSON.stringify(vi.mocked(prisma.emailLogEntry.create).mock.calls)).not.toContain("secret link");
  });

  it("records an accepted send even if the provider's reply has no id", async () => {
    vi.stubEnv("RESEND_API_KEY", "key123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not json", { status: 200 }));
    await sendEmail(message);
    expect(vi.mocked(prisma.emailLogEntry.create).mock.calls[0][0].data).toMatchObject({ status: "SENT", providerId: undefined });
  });

  it("clears out log entries older than a month as it goes", async () => {
    vi.stubEnv("RESEND_API_KEY", "key123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmail(message);
    const cutoff = (vi.mocked(prisma.emailLogEntry.deleteMany).mock.calls[0][0]!.where as any).createdAt.lt as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThan(29 * 24 * 3600_000);
  });

  it("uses EMAIL_FROM when set", async () => {
    vi.stubEnv("RESEND_API_KEY", "key123");
    vi.stubEnv("EMAIL_FROM", "App <noreply@example.com>");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmail(message);
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string).from).toBe("App <noreply@example.com>");
  });

  it("throws with the provider's response when sending fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "key123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad sender", { status: 403 }));
    await expect(sendEmail(message)).rejects.toThrow("Email send failed (403): bad sender");
    expect(prisma.emailLogEntry.create).toHaveBeenCalledWith({
      data: { toAddress: "a@b.co", subject: "Hi", status: "FAILED", error: "Email send failed (403): bad sender" },
    });
  });

  it("records a failure to reach the provider at all, and still throws", async () => {
    vi.stubEnv("RESEND_API_KEY", "key123");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await expect(sendEmail(message)).rejects.toThrow("network down");
    expect(vi.mocked(prisma.emailLogEntry.create).mock.calls[0][0].data).toMatchObject({
      status: "FAILED",
      error: "Could not reach the email provider: network down",
    });
  });

  it("keeps a long provider error to a sensible length", async () => {
    vi.stubEnv("RESEND_API_KEY", "key123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x".repeat(2000), { status: 500 }));
    await expect(sendEmail(message)).rejects.toThrow();
    expect((vi.mocked(prisma.emailLogEntry.create).mock.calls[0][0].data.error as string).length).toBe(500);
  });

  it("never lets a logging problem stop an email going out", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "key123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    vi.mocked(prisma.emailLogEntry.create).mockRejectedValueOnce(new Error("db down"));
    await expect(sendEmail(message)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
  });
});

describe("sendEmail outbox", () => {
  it("appends to EMAIL_OUTBOX_FILE instead of sending (end-to-end tests read it)", async () => {
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const file = join(mkdtempSync(join(tmpdir(), "outbox-")), "outbox.jsonl");
    vi.stubEnv("EMAIL_OUTBOX_FILE", file);
    vi.stubEnv("RESEND_API_KEY", "key123");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await sendEmail(message);
    await sendEmail({ ...message, to: "c@d.co" });
    expect(fetchSpy).not.toHaveBeenCalled();
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.to)).toEqual(["a@b.co", "c@d.co"]);
    expect(vi.mocked(prisma.emailLogEntry.create).mock.calls[0][0].data).toMatchObject({ status: "SENT", providerId: "outbox" });
  });
});

describe("appUrl", () => {
  it("prefers APP_URL, without a trailing slash", () => {
    vi.stubEnv("APP_URL", "https://app.example.com/");
    expect(appUrl()).toBe("https://app.example.com");
  });
  it("falls back to the Vercel production URL, then localhost", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "my-app.vercel.app");
    expect(appUrl()).toBe("https://my-app.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(appUrl()).toBe("http://localhost:3000");
  });
});
