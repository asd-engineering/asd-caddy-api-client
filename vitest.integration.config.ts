import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/integration/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", ".asd/**"],
    testTimeout: 30000, // 30s for integration tests with real Caddy
    // Run test files sequentially to avoid Caddy state conflicts
    fileParallelism: false,
    // Disable isolation to keep global state between tests
    isolate: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage/integration",
      exclude: [
        "node_modules/",
        "dist/",
        ".asd/",
        "**/*.test.ts",
        "**/*.config.ts",
        "**/*.config.mjs",
        "examples/",
        "test/",
      ],
    },
  },
});
