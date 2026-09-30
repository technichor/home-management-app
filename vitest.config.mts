import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      include: [
        "lib/**/*.ts",
        "app/**/actions.ts",
        "app/**/route.ts",
      ],
      exclude: ["lib/db.ts"],
    },
  },
});
