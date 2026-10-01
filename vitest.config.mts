import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup.tsx"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/**/*.{ts,tsx}", "components/**/*.tsx"],
      // db.ts is the Prisma client singleton: it only constructs the client.
      exclude: ["lib/db.ts"],
    },
  },
});
