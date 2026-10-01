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
      // Every source file is covered; keep it that way.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
