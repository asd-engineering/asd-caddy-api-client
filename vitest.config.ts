import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // vscode-extension imports this via its own published subpath,
      // resolved through vscode-extension/node_modules (npm) -- which
      // doesn't exist in this repo's bun-only root test run. Alias straight
      // to source instead.
      "@accelerated-software-development/caddy-api-client/extension-assets": `${__dirname}src/generated/extension-assets.ts`,
    },
  },
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
        "src/__tests__/fuzz/", // Differential fuzz-testing harness (run separately via test:fuzz)
      ],
    },
    testTimeout: 10000, // 10s for integration tests
  },
});
