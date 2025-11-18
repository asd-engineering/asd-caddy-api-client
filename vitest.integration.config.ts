import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/integration/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", ".asd/**"],
    testTimeout: 30000, // 30s for integration tests with real Caddy
  },
});
