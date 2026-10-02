// Runs the browser end-to-end tests against a throwaway database, never the real one.
//
//   npm run test:e2e                 (all tests)
//   npm run test:e2e -- --headed     (extra args go to `playwright test`)
//
// It starts a real Postgres from the `embedded-postgres` npm package in a temp directory, applies
// every migration from scratch (so the migrations are tested too), then lets Playwright build and
// start the app against it. DATABASE_URL is set explicitly here, which overrides .env.local.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = Number(process.env.E2E_PG_PORT ?? 54329);
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const dir = mkdtempSync(join(tmpdir(), "home-mgmt-e2e-"));

const pg = new EmbeddedPostgres({ databaseDir: join(dir, "pg"), user: "postgres", password: "e2e", port: PG_PORT, persistent: false });

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

let exitCode = 1;
try {
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
  };

  console.log("Applying migrations to the test database...");
  exitCode = await run("npx", ["prisma", "migrate", "deploy"], env);
  if (exitCode === 0) exitCode = await run("npx", ["playwright", "test", ...process.argv.slice(2)], env);
} finally {
  await pg.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
process.exit(exitCode);
