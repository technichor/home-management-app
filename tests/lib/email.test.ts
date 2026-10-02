import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail, appUrl } from "@/lib/email";

const message = { to: "a@b.co", subject: "Hi", text: "Hello" };

beforeEach(() => {
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
  });

  it("posts to Resend with the test sender by default", async () => {
    vi.stubEnv("RESEND_API_KEY", "key123");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmail(message);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as any).Authorization).toBe("Bearer key123");
    expect(JSON.parse(init.body as string)).toEqual({ from: "Home Management <onboarding@resend.dev>", ...message });
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
