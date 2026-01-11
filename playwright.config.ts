import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for caddy-security integration tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./src/__tests__/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Web server configuration for integration tests
  // webServer: {
  //   command: 'docker compose -f docker/docker-compose.integration.yml up',
  //   url: 'http://localhost:8080',
  //   reuseExistingServer: !process.env.CI,
  // },
});
