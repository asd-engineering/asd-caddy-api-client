import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      "dist/**",
      ".asd/**",
      "examples/**",
      // Exclude integration tests from regular test runs
      "src/__tests__/integration/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage/unit",
      exclude: [
        "node_modules/",
        "dist/",
        ".asd/",
        "docs/",
        "docs/api/",
        "local/",
        "demo/",
        "**/*.test.ts",
        "**/*.config.ts",
        "**/*.config.mjs",
        "examples/",
        "test/",
        "**/index.ts", // Re-export files have no logic
        "scripts/", // Build scripts, not runtime code
        "src/generated/caddy-core.ts", // Type definitions only (no executable code)
        "src/generated/caddy-http.ts", // Type definitions only (no executable code)
        "src/__tests__/helpers/", // Test utilities
        "src/__tests__/integration/", // Integration test code
      ],
    },
    testTimeout: 10000, // 10s for integration tests
  },
});
