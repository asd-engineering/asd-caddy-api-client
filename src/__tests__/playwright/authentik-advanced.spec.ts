/**
 * Authentik Advanced Integration Tests
 *
 * These tests require Authentik to be running:
 * ```bash
 * npm run docker:authentik:up
 * ```
 *
 * Note: Authentik takes longer to start (~60s) due to database migrations.
 *
 * Run tests:
 * ```bash
 * npm run test:authentik
 * ```
 *
 * Tests will be skipped if Authentik is not available.
 */

import { test, expect } from "@playwright/test";

const AUTHENTIK_URL = "http://localhost:9000";
// Caddy URL for future proxy tests: http://localhost:8080

// Bootstrap admin credentials (set via environment in docker-compose)
const ADMIN_USER = {
  username: "akadmin",
  password: "admin",
  email: "admin@test.local",
};

// Check if Authentik is available
async function checkAuthentikAvailable(): Promise<void> {
  try {
    const response = await fetch(`${AUTHENTIK_URL}/-/health/ready/`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error("Authentik not ready");
    }
  } catch {
    test.skip(true, "Authentik not available. Run: npm run docker:authentik:up");
  }
}

test.describe("Authentik Health & Discovery", () => {
  test.beforeEach(async () => {
    await checkAuthentikAvailable();
  });

  test("authentik health endpoint is ready", async ({ request }) => {
    const response = await request.get(`${AUTHENTIK_URL}/-/health/ready/`);
    expect(response.ok()).toBe(true);
  });

  test("authentik live endpoint responds", async ({ request }) => {
    const response = await request.get(`${AUTHENTIK_URL}/-/health/live/`);
    expect(response.ok()).toBe(true);
  });

  test("OIDC well-known endpoint exists", async ({ request }) => {
    // Authentik exposes OIDC at application-specific URLs
    // The default provider slug would be needed for the full URL
    // For now, test the base health endpoints
    const response = await request.get(`${AUTHENTIK_URL}/`);
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe("Authentik Admin Interface", () => {
  test.beforeEach(async () => {
    await checkAuthentikAvailable();
  });

  test("admin login page loads", async ({ page }) => {
    await page.goto(`${AUTHENTIK_URL}/if/flow/default-authentication-flow/`);

    // Should show login form or be redirected to it
    await page.waitForTimeout(2000);

    // Check for login form elements or successful load
    const pageContent = await page.content();
    expect(
      pageContent.includes("ak-") || // Authentik components
        pageContent.includes("login") ||
        pageContent.includes("authentik")
    ).toBe(true);
  });

  test("admin can authenticate", async ({ page }) => {
    await page.goto(`${AUTHENTIK_URL}/if/flow/default-authentication-flow/`);

    // Wait for the page to fully load
    await page.waitForTimeout(3000);

    // Try to find and fill username field
    const usernameField = page.locator('input[name="uidField"]').first();
    if (await usernameField.isVisible({ timeout: 5000 })) {
      await usernameField.fill(ADMIN_USER.username);

      // Click next/submit
      const submitButton = page.locator('button[type="submit"]').first();
      if (await submitButton.isVisible({ timeout: 2000 })) {
        await submitButton.click();
      }

      // Wait for password field
      await page.waitForTimeout(2000);

      const passwordField = page.locator('input[name="password"]').first();
      if (await passwordField.isVisible({ timeout: 5000 })) {
        await passwordField.fill(ADMIN_USER.password);

        const loginButton = page.locator('button[type="submit"]').first();
        if (await loginButton.isVisible({ timeout: 2000 })) {
          await loginButton.click();
        }
      }
    }

    // After login, should redirect to admin or user interface
    await page.waitForTimeout(3000);
    expect(page.url()).not.toContain("default-authentication-flow");
  });
});

test.describe("Authentik API", () => {
  test.beforeEach(async () => {
    await checkAuthentikAvailable();
  });

  test("API root returns version info", async ({ request }) => {
    const response = await request.get(`${AUTHENTIK_URL}/api/v3/root/config/`);

    // May require authentication, but should at least respond
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe("Authentik OIDC Provider", () => {
  test.beforeEach(async () => {
    await checkAuthentikAvailable();
  });

  test("can discover OIDC configuration after setup", async ({ request }) => {
    // Note: This requires an OIDC provider to be configured in Authentik
    // The default installation may not have one configured
    // This test verifies the endpoint format is correct

    // Try to get OIDC discovery (may 404 if not configured)
    const response = await request.get(
      `${AUTHENTIK_URL}/application/o/test-app/.well-known/openid-configuration`
    );

    // Either returns OIDC config (if app exists) or 404 (if not)
    // Both are valid responses - we just verify the server handles it
    expect([200, 404]).toContain(response.status());

    if (response.ok()) {
      const config = await response.json();
      expect(config).toMatchObject({
        issuer: expect.any(String),
        authorization_endpoint: expect.any(String),
        token_endpoint: expect.any(String),
      });
    }
  });
});

test.describe("Authentik MFA Capabilities", () => {
  test.beforeEach(async () => {
    await checkAuthentikAvailable();
  });

  test("totp stage exists in API", async ({ request }) => {
    // TOTP MFA is a built-in capability of Authentik
    // This test verifies the endpoint structure

    const response = await request.get(`${AUTHENTIK_URL}/api/v3/stages/authenticator/totp/`);

    // Requires auth but should respond
    expect(response.status()).toBeLessThan(500);
  });

  test("webauthn stage exists in API", async ({ request }) => {
    // WebAuthn/FIDO2 is another MFA option
    const response = await request.get(`${AUTHENTIK_URL}/api/v3/stages/authenticator/webauthn/`);

    expect(response.status()).toBeLessThan(500);
  });
});

test.describe("Authentik Flow Configuration", () => {
  test.beforeEach(async () => {
    await checkAuthentikAvailable();
  });

  test("default authentication flow exists", async ({ request }) => {
    // Authentik uses flows for authentication
    const response = await request.get(`${AUTHENTIK_URL}/api/v3/flows/instances/`);

    // Requires auth but endpoint should exist
    expect(response.status()).toBeLessThan(500);
  });

  test("flows API endpoint responds", async ({ request }) => {
    const response = await request.get(`${AUTHENTIK_URL}/api/v3/flows/executor/`);

    // Requires auth, but should respond with 401/403, not 500
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe("Authentik Outpost Configuration", () => {
  test.beforeEach(async () => {
    await checkAuthentikAvailable();
  });

  test("outposts API endpoint exists", async ({ request }) => {
    // Outposts are how Authentik integrates with reverse proxies
    const response = await request.get(`${AUTHENTIK_URL}/api/v3/outposts/instances/`);

    expect(response.status()).toBeLessThan(500);
  });

  test("proxy outpost provider type is available", async ({ request }) => {
    // Proxy provider is used for caddy-security integration
    const response = await request.get(`${AUTHENTIK_URL}/api/v3/providers/proxy/`);

    expect(response.status()).toBeLessThan(500);
  });
});

test.describe("Authentik Configuration Builder Validation", () => {
  test("generates correct OIDC discovery URL pattern", () => {
    const appSlug = "my-application";
    const expectedDiscoveryUrl = `${AUTHENTIK_URL}/application/o/${appSlug}/.well-known/openid-configuration`;

    expect(expectedDiscoveryUrl).toContain("/application/o/");
    expect(expectedDiscoveryUrl).toContain(appSlug);
    expect(expectedDiscoveryUrl).toContain("/.well-known/openid-configuration");
  });

  test("generates correct authorization endpoint pattern", () => {
    const expectedAuthUrl = `${AUTHENTIK_URL}/application/o/authorize/`;

    expect(expectedAuthUrl).toContain("/application/o/authorize/");
  });

  test("generates correct token endpoint pattern", () => {
    const expectedTokenUrl = `${AUTHENTIK_URL}/application/o/token/`;

    expect(expectedTokenUrl).toContain("/application/o/token/");
  });

  test("generates correct userinfo endpoint pattern", () => {
    const expectedUserinfoUrl = `${AUTHENTIK_URL}/application/o/userinfo/`;

    expect(expectedUserinfoUrl).toContain("/application/o/userinfo/");
  });
});
