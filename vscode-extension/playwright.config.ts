import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for VSCode extension tests
 * Tests run against code-server with the extension installed
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // Tests share code-server instance
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker - code-server lifecycle
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60000, // Extension tests can be slow

  use: {
    // Base URL set by fixture based on dynamic port
    baseURL: process.env.CODESERVER_URL || "http://localhost:8443",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Global setup/teardown for code-server
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
});
