import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const PrismaClient = vi.fn(function (this: any, options: unknown) {
  this.options = options;
});
vi.mock("@prisma/client", () => ({ PrismaClient }));

const g = globalThis as unknown as { prisma?: unknown };

async function load() {
  vi.resetModules();
  return (await import("@/lib/db")).prisma as any;
}

beforeEach(() => {
  PrismaClient.mockClear();
  delete g.prisma;
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete g.prisma;
});

describe("prisma client singleton", () => {
  it("logs queries, errors and warnings in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const prisma = await load();
    expect(prisma.options).toEqual({ log: ["query", "error", "warn"] });
  });

  it("logs only errors outside development", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const prisma = await load();
    expect(prisma.options).toEqual({ log: ["error"] });
  });

  it("caches the client on globalThis so hot reloads reuse it", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const first = await load();
    expect(g.prisma).toBe(first);
    const second = await load();
    expect(second).toBe(first);
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });

  it("does not cache the client globally in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await load();
    expect(g.prisma).toBeUndefined();
  });
});
