import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for caddy-security integration tests.
 *
 * Key settings:
 * - fileParallelism: false - Tests must run sequentially because they all
 *   modify the same Caddy security configuration. Parallel execution causes
 *   409 Conflict errors.
 * - sequence.shuffle: false - Run tests in consistent order
 * - testTimeout: 30000 - Integration tests need longer timeouts
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/integration/caddy-security/**/*.test.ts"],
    // CRITICAL: Run test files sequentially to avoid 409 Conflict errors
    // All caddy-security tests modify the same Caddy configuration
    fileParallelism: false,
    sequence: {
      shuffle: false,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage/integration",
    },
    testTimeout: 30000, // 30s for integration tests
    hookTimeout: 30000,
  },
});
