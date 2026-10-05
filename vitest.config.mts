import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    // Browser tests run through Playwright (npm run test:e2e), not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
    globals: true,
    // The component tests drive Ant Design with userEvent and can run long when the whole suite runs at once.
    testTimeout: 20_000,
    setupFiles: ["tests/setup.tsx"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/**/*.{ts,tsx}", "components/**/*.tsx"],
      // Every source file is covered; keep it that way.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
