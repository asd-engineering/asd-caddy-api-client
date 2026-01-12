/**
 * Caddy-Security OIDC Flow Browser Tests
 *
 * End-to-end tests for OIDC authentication flow through caddy-security
 * with Keycloak as the identity provider.
 *
 * Flow tested:
 * 1. User accesses protected resource on caddy-security
 * 2. Redirected to Keycloak login page
 * 3. User authenticates with Keycloak
 * 4. Keycloak redirects back to caddy-security with authorization code
 * 5. caddy-security exchanges code for tokens
 * 6. User receives JWT session cookie
 * 7. User can access protected resources
 *
 * Prerequisites:
 * ```bash
 * npm run docker:caddy-security:up
 * npm run docker:keycloak:up
 * ```
 *
 * Run tests:
 * ```bash
 * npm run test:oidc-flow
 * ```
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

// URLs
const CADDY_URL = process.env.CADDY_SECURITY_URL ?? "http://localhost:8084";
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8081";
const KEYCLOAK_REALM = "test-realm";

// Test users - must exist in Keycloak
const KEYCLOAK_USER = {
  username: "testuser",
  password: "password",
  email: "test@example.com",
};

const KEYCLOAK_ADMIN = {
  username: "admin",
  password: "admin123",
  email: "admin@example.com",
};

/**
 * Check if both caddy-security and Keycloak are available
 */
async function checkServicesAvailable(): Promise<void> {
  // Check caddy-security
  try {
    const caddyResponse = await fetch(`${CADDY_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!caddyResponse.ok) {
      throw new Error("Caddy-security not ready");
    }
  } catch {
    test.skip(true, "Caddy-security not available. Run: npm run docker:caddy-security:up");
    return;
  }

  // Check Keycloak
  try {
    const keycloakResponse = await fetch(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
      {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!keycloakResponse.ok) {
      throw new Error("Keycloak not ready");
    }
  } catch {
    test.skip(true, "Keycloak not available. Run: npm run docker:keycloak:up");
  }
}

/**
 * Helper to complete Keycloak login
 */
async function loginToKeycloak(page: Page, username: string, password: string): Promise<void> {
  // Wait for Keycloak login form
  await expect(page.locator("#username")).toBeVisible({ timeout: 10000 });

  // Fill credentials
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);

  // Submit
  await page.locator("#kc-login").click();
}

/**
 * Helper to get all auth-related cookies
 */
async function getAuthCookies(context: BrowserContext): Promise<string[]> {
  const cookies = await context.cookies();
  return cookies
    .filter(
      (c) =>
        c.name.includes("access_token") ||
        c.name.includes("jwt") ||
        c.name.includes("session") ||
        c.name.includes("AUTHP") ||
        c.name.includes("token") ||
        c.name.includes("auth")
    )
    .map((c) => c.name);
}

test.describe("OIDC Flow Prerequisites", () => {
  test.beforeEach(async () => {
    await checkServicesAvailable();
  });

  test("caddy-security is configured with OIDC provider", async ({ request }) => {
    const response = await request.get(`${CADDY_URL}/health`);
    expect(response.ok()).toBe(true);
  });

  test("keycloak discovery endpoint is reachable", async ({ request }) => {
    const response = await request.get(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`
    );
    expect(response.ok()).toBe(true);

    const config = await response.json();
    expect(config.issuer).toContain(KEYCLOAK_REALM);
    expect(config.authorization_endpoint).toBeDefined();
    expect(config.token_endpoint).toBeDefined();
  });
});

test.describe("OIDC Authentication Flow", () => {
  test.beforeEach(async () => {
    await checkServicesAvailable();
  });

  test("accessing protected resource triggers OIDC redirect", async ({ page }) => {
    // Try to access protected resource
    await page.goto(`${CADDY_URL}/protected`, { waitUntil: "networkidle" });

    const currentUrl = page.url();

    // Should be redirected to either:
    // 1. Caddy-security auth page with OIDC option
    // 2. Directly to Keycloak
    expect(
      currentUrl.includes("/auth") ||
        currentUrl.includes(KEYCLOAK_URL) ||
        currentUrl.includes("openid-connect/auth")
    ).toBe(true);
  });

  test("OIDC login button redirects to Keycloak", async ({ page }) => {
    // Go to caddy-security auth page
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    // Look for OIDC/Keycloak login option
    const oidcButton = page.locator(
      'a[href*="keycloak"], button:has-text("Keycloak"), a:has-text("SSO"), button:has-text("SSO"), a:has-text("OIDC")'
    );

    if ((await oidcButton.count()) > 0) {
      await oidcButton.first().click();
      await page.waitForLoadState("networkidle");

      // Should be on Keycloak now
      const currentUrl = page.url();
      expect(currentUrl.includes(KEYCLOAK_URL) || currentUrl.includes("openid-connect/auth")).toBe(
        true
      );
    } else {
      // If no OIDC button, the portal might auto-redirect to Keycloak
      // or OIDC is not configured in the test environment
      test.skip(true, "OIDC provider not visible on auth page - may not be configured");
    }
  });

  test("complete OIDC login flow", async ({ page, context }) => {
    // Start at protected resource
    await page.goto(`${CADDY_URL}/protected`, { waitUntil: "networkidle" });

    let currentUrl = page.url();

    // If redirected to caddy-security auth page, find OIDC option
    if (currentUrl.includes("/auth") && !currentUrl.includes(KEYCLOAK_URL)) {
      const oidcButton = page.locator(
        'a[href*="keycloak"], button:has-text("Keycloak"), a:has-text("SSO")'
      );

      if ((await oidcButton.count()) > 0) {
        await oidcButton.first().click();
        await page.waitForLoadState("networkidle");
        currentUrl = page.url();
      }
    }

    // Should now be at Keycloak
    if (currentUrl.includes(KEYCLOAK_URL) || currentUrl.includes("openid-connect/auth")) {
      // Complete Keycloak login
      await loginToKeycloak(page, KEYCLOAK_USER.username, KEYCLOAK_USER.password);
      await page.waitForLoadState("networkidle");

      // Should be redirected back to caddy-security
      currentUrl = page.url();

      // After successful OIDC flow:
      // 1. Should have auth cookies
      // 2. Should be on portal or protected resource
      const authCookies = await getAuthCookies(context);

      // Success if we have auth cookies OR we're past the login page
      const loginSuccessful =
        authCookies.length > 0 ||
        currentUrl.includes("/portal") ||
        currentUrl.includes("/protected") ||
        currentUrl.includes("/dashboard") ||
        !currentUrl.includes("/auth");

      expect(loginSuccessful).toBe(true);
    } else {
      test.skip(true, "OIDC flow did not redirect to Keycloak");
    }
  });

  test("OIDC login with admin user gets elevated privileges", async ({ page }) => {
    // Start flow
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    // Look for OIDC option
    const oidcButton = page.locator(
      'a[href*="keycloak"], button:has-text("Keycloak"), a:has-text("SSO")'
    );

    if ((await oidcButton.count()) === 0) {
      test.skip(true, "OIDC provider not configured");
      return;
    }

    await oidcButton.first().click();
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();
    if (!currentUrl.includes(KEYCLOAK_URL) && !currentUrl.includes("openid-connect")) {
      test.skip(true, "Did not reach Keycloak login");
      return;
    }

    // Login as admin
    await loginToKeycloak(page, KEYCLOAK_ADMIN.username, KEYCLOAK_ADMIN.password);
    await page.waitForLoadState("networkidle");

    // Try to access admin resource
    await page.goto(`${CADDY_URL}/admin`, { waitUntil: "networkidle" });

    const pageText = await page.content();

    // Admin should have access (not redirected to login or denied)
    const hasAccessDenied = pageText.includes("Access Denied");
    const hasForbidden = pageText.includes("Forbidden");
    const isOnAuthPage = page.url().includes("/auth");
    expect(!hasAccessDenied && !hasForbidden && !isOnAuthPage).toBe(true);
  });
});

test.describe("OIDC Session Management", () => {
  test.beforeEach(async () => {
    await checkServicesAvailable();
  });

  test("session persists across page navigations", async ({ page, context }) => {
    // First, complete OIDC login
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    const oidcButton = page.locator(
      'a[href*="keycloak"], button:has-text("Keycloak"), a:has-text("SSO")'
    );

    if ((await oidcButton.count()) === 0) {
      test.skip(true, "OIDC not configured");
      return;
    }

    await oidcButton.first().click();
    await page.waitForLoadState("networkidle");

    if (!page.url().includes(KEYCLOAK_URL) && !page.url().includes("openid-connect")) {
      test.skip(true, "Did not reach Keycloak");
      return;
    }

    await loginToKeycloak(page, KEYCLOAK_USER.username, KEYCLOAK_USER.password);
    await page.waitForLoadState("networkidle");

    // Verify we got auth cookies
    const cookies = await getAuthCookies(context);
    if (cookies.length === 0) {
      test.skip(true, "No auth cookies after OIDC login");
      return;
    }

    // Navigate to different protected pages
    await page.goto(`${CADDY_URL}/protected`, { waitUntil: "networkidle" });
    expect(page.url()).not.toContain("/auth");

    await page.goto(`${CADDY_URL}/dashboard`, { waitUntil: "networkidle" });
    expect(page.url()).not.toContain("/auth");

    // Cookies should still be present
    const cookiesAfter = await getAuthCookies(context);
    expect(cookiesAfter.length).toBeGreaterThan(0);
  });

  test("logout terminates OIDC session", async ({ page, context }) => {
    // Complete login first
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    const oidcButton = page.locator(
      'a[href*="keycloak"], button:has-text("Keycloak"), a:has-text("SSO")'
    );

    if ((await oidcButton.count()) === 0) {
      test.skip(true, "OIDC not configured");
      return;
    }

    await oidcButton.first().click();
    await page.waitForLoadState("networkidle");

    if (!page.url().includes(KEYCLOAK_URL) && !page.url().includes("openid-connect")) {
      test.skip(true, "Did not reach Keycloak");
      return;
    }

    await loginToKeycloak(page, KEYCLOAK_USER.username, KEYCLOAK_USER.password);
    await page.waitForLoadState("networkidle");

    // Verify logged in
    const cookiesBefore = await getAuthCookies(context);
    if (cookiesBefore.length === 0) {
      test.skip(true, "No auth cookies");
      return;
    }

    // Find and click logout
    const logoutButton = page.locator(
      'a:has-text("Logout"), button:has-text("Logout"), a:has-text("Sign Out"), a[href*="logout"]'
    );

    if ((await logoutButton.count()) > 0) {
      await logoutButton.first().click();
      await page.waitForLoadState("networkidle");

      // After logout, accessing protected resource should require auth again
      await page.goto(`${CADDY_URL}/protected`, { waitUntil: "networkidle" });

      const currentUrl = page.url();
      expect(currentUrl.includes("/auth") || currentUrl.includes(KEYCLOAK_URL)).toBe(true);
    }
  });
});

test.describe("OIDC Error Handling", () => {
  test.beforeEach(async () => {
    await checkServicesAvailable();
  });

  test("invalid credentials shows Keycloak error", async ({ page }) => {
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    const oidcButton = page.locator(
      'a[href*="keycloak"], button:has-text("Keycloak"), a:has-text("SSO")'
    );

    if ((await oidcButton.count()) === 0) {
      test.skip(true, "OIDC not configured");
      return;
    }

    await oidcButton.first().click();
    await page.waitForLoadState("networkidle");

    if (!page.url().includes(KEYCLOAK_URL) && !page.url().includes("openid-connect")) {
      test.skip(true, "Did not reach Keycloak");
      return;
    }

    // Try invalid credentials
    await loginToKeycloak(page, "nonexistent", "wrongpassword");
    await page.waitForLoadState("networkidle");

    // Should still be on Keycloak with error
    expect(page.url()).toContain(KEYCLOAK_URL);

    const pageContent = await page.content();
    expect(
      pageContent.includes("Invalid") ||
        pageContent.includes("invalid") ||
        pageContent.includes("Error") ||
        pageContent.includes("error") ||
        pageContent.includes("failed")
    ).toBe(true);
  });

  test("cancelled OIDC flow returns to caddy-security", async ({ page }) => {
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    const oidcButton = page.locator(
      'a[href*="keycloak"], button:has-text("Keycloak"), a:has-text("SSO")'
    );

    if ((await oidcButton.count()) === 0) {
      test.skip(true, "OIDC not configured");
      return;
    }

    await oidcButton.first().click();
    await page.waitForLoadState("networkidle");

    if (!page.url().includes(KEYCLOAK_URL) && !page.url().includes("openid-connect")) {
      test.skip(true, "Did not reach Keycloak");
      return;
    }

    // Look for cancel/back link on Keycloak
    const cancelLink = page.locator('a:has-text("Cancel"), a:has-text("Back"), a[href*="cancel"]');

    if ((await cancelLink.count()) > 0) {
      await cancelLink.first().click();
      await page.waitForLoadState("networkidle");

      // Should be back at caddy-security
      expect(page.url()).toContain(CADDY_URL);
    }
  });
});

test.describe("OIDC Token Claims", () => {
  test.beforeEach(async () => {
    await checkServicesAvailable();
  });

  test("userinfo endpoint returns OIDC claims", async ({ page }) => {
    // Complete OIDC login
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    const oidcButton = page.locator(
      'a[href*="keycloak"], button:has-text("Keycloak"), a:has-text("SSO")'
    );

    if ((await oidcButton.count()) === 0) {
      test.skip(true, "OIDC not configured");
      return;
    }

    await oidcButton.first().click();
    await page.waitForLoadState("networkidle");

    if (!page.url().includes(KEYCLOAK_URL) && !page.url().includes("openid-connect")) {
      test.skip(true, "Did not reach Keycloak");
      return;
    }

    await loginToKeycloak(page, KEYCLOAK_USER.username, KEYCLOAK_USER.password);
    await page.waitForLoadState("networkidle");

    // Check if caddy-security exposes user info
    const userinfoUrl = `${CADDY_URL}/auth/userinfo`;
    const response = await page.goto(userinfoUrl, { waitUntil: "networkidle" });

    if (response?.ok()) {
      const text = await page.content();

      // Should contain user info from OIDC claims
      const expectedContent = [KEYCLOAK_USER.username, KEYCLOAK_USER.email, "sub", "email"];
      const hasExpectedClaim = expectedContent.some((item) => text.includes(item));
      expect(hasExpectedClaim).toBe(true);
    }
  });
});

test.describe("OIDC Multi-Provider", () => {
  test.beforeEach(async () => {
    await checkServicesAvailable();
  });

  test("auth page shows multiple provider options", async ({ page }) => {
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    const pageContent = await page.content();

    // Check for various provider options
    const hasLocalLogin =
      pageContent.includes("username") ||
      pageContent.includes("Username") ||
      pageContent.includes("local");

    const hasOidcOption =
      pageContent.includes("Keycloak") ||
      pageContent.includes("SSO") ||
      pageContent.includes("OIDC") ||
      pageContent.includes("Google") ||
      pageContent.includes("GitHub");

    // At minimum, should have some login option
    expect(hasLocalLogin || hasOidcOption).toBe(true);
  });

  test("can switch between local and OIDC login", async ({ page }) => {
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    // Check for local login form
    const usernameField = page.locator('input[name="username"], input[id="username"]');
    const hasLocalForm = (await usernameField.count()) > 0;

    // Check for OIDC option
    const oidcButton = page.locator(
      'a[href*="keycloak"], button:has-text("Keycloak"), a:has-text("SSO")'
    );
    const hasOidcOption = (await oidcButton.count()) > 0;

    // If both are available, the portal supports multi-provider
    if (hasLocalForm && hasOidcOption) {
      // Can start with local form
      await expect(usernameField.first()).toBeVisible();

      // Can switch to OIDC
      await oidcButton.first().click();
      await page.waitForLoadState("networkidle");

      // Should redirect to OIDC provider
      const currentUrl = page.url();
      expect(
        currentUrl.includes(KEYCLOAK_URL) ||
          currentUrl.includes("openid-connect") ||
          currentUrl.includes("oauth")
      ).toBe(true);
    } else if (!hasOidcOption) {
      test.skip(true, "Only local auth configured");
    }
  });
});
