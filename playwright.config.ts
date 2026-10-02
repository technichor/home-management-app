import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_APP_PORT ?? 3100);

// Run through `npm run test:e2e`, which provides the throwaway database and environment.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  // One shared database and an in-order story per file: keep it simple and deterministic.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  // A production build, because that is what runs on Vercel (some problems only show there).
  webServer: {
    command: `npx next build && npx next start -p ${port}`,
    url: `http://localhost:${port}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: process.env as Record<string, string>,
  },
});
