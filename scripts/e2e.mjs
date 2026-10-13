// Runs the browser end-to-end tests against a throwaway database, never the real one.
//
//   npm run test:e2e                 (all tests)
//   npm run test:e2e -- --headed     (extra args go to `playwright test`)
//
// It starts a real Postgres from the `embedded-postgres` npm package in a temp directory, applies
// every migration from scratch (so the migrations are tested too), then lets Playwright build and
// start the app against it, with a stand-in Google (scripts/fakeGoogle.mjs). DATABASE_URL is set explicitly here, which overrides .env.local.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { startFakeGoogle } from "./fakeGoogle.mjs";

const PG_PORT = Number(process.env.E2E_PG_PORT ?? 54329);
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const GOOGLE_PORT = Number(process.env.E2E_GOOGLE_PORT ?? 3199);
const dir = mkdtempSync(join(tmpdir(), "home-mgmt-e2e-"));

const pg = new EmbeddedPostgres({ databaseDir: join(dir, "pg"), user: "postgres", password: "e2e", port: PG_PORT, persistent: false });

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

let exitCode = 1;
let google;
try {
  google = await startFakeGoogle(GOOGLE_PORT);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("e2e");

  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://postgres:e2e@127.0.0.1:${PG_PORT}/e2e`,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    EMAIL_OUTBOX_FILE: join(dir, "outbox.jsonl"),
    RESEND_API_KEY: "",
    APP_URL: `http://localhost:${APP_PORT}`,
    E2E_APP_PORT: String(APP_PORT),
    // Google Calendar, against the stand-in Google (scripts/fakeGoogle.mjs).
    GOOGLE_CLIENT_ID: "e2e-client",
    GOOGLE_CLIENT_SECRET: "e2e-secret",
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    GOOGLE_AUTH_URL: `http://localhost:${GOOGLE_PORT}/o/oauth2/v2/auth`,
    GOOGLE_OAUTH_API: `http://localhost:${GOOGLE_PORT}`,
    GOOGLE_CALENDAR_API: `http://localhost:${GOOGLE_PORT}/calendar/v3`,
    E2E_GOOGLE_PORT: String(GOOGLE_PORT),
  };

  console.log("Applying migrations to the test database...");
  exitCode = await run("npx", ["prisma", "migrate", "deploy"], env);
  if (exitCode === 0) exitCode = await run("npx", ["playwright", "test", ...process.argv.slice(2)], env);
} finally {
  google?.close();
  await pg.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
process.exit(exitCode);
