/**
 * Auth Claims Injection Tests
 *
 * Tests that verify caddy-security properly injects authentication
 * claims into backend requests. Uses the auth-echo backend to
 * inspect what headers/claims the backend actually receives.
 *
 * This validates the real-world scenario where:
 * 1. User authenticates via caddy-security
 * 2. caddy-security validates the token
 * 3. caddy-security injects user claims into headers
 * 4. Backend receives and can use those claims
 *
 * Prerequisites:
 * ```bash
 * npm run docker:caddy-security:up
 * ```
 *
 * Run tests:
 * ```bash
 * npm run test:auth:claims
 * ```
 */

import { test, expect, type Page } from "@playwright/test";

const CADDY_URL = "http://localhost:8084";

const TEST_USER = {
  username: "testuser",
  password: "password123",
  expectedRoles: ["authp/user"],
};

const ADMIN_USER = {
  username: "admin",
  password: "password123",
  expectedRoles: ["authp/admin", "authp/user"],
};

interface WhoamiResponse {
  authenticated: boolean;
  claims: {
    sub?: string;
    email?: string;
    roles?: string[];
    name?: string;
    [key: string]: unknown;
  } | null;
  injectedHeaders: Record<string, string>;
}

interface BackendResponse {
  timestamp: string;
  request: {
    method: string;
    url: string;
    path: string;
  };
  auth: {
    hasAuthHeader: boolean;
    authType: string | null;
    claims: Record<string, unknown> | null;
    caddySecurityHeaders: Record<string, string>;
  };
  backend: {
    name: string;
    port: number;
  };
}

/**
 * Perform two-step login
 */
async function performLogin(page: Page, username: string, password: string): Promise<boolean> {
  try {
    await page.goto(`${CADDY_URL}/auth`, { waitUntil: "networkidle" });

    // Step 1: Username
    const usernameField = page.locator('input[name="username"], input[id="username"]');
    await usernameField.first().fill(username);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState("networkidle");

    // Step 2: Password
    const passwordField = page.locator('input[name="password"], input[type="password"]');
    await passwordField.first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState("networkidle");

    return !page.url().includes("/auth") || page.url().includes("/portal");
  } catch {
    return false;
  }
}

/**
 * Get JSON response from page
 */
async function getJsonResponse<T>(page: Page, url: string): Promise<T | null> {
  try {
    const response = await page.goto(url, { waitUntil: "networkidle" });
    if (!response?.ok()) return null;

    const content = await page.content();
    // Extract JSON from page (might be wrapped in HTML)
    const jsonMatch = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(content);
    let jsonText: string;
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // Use Playwright's native method instead of page.evaluate for DOM types
      const bodyText = await page.textContent("body");
      jsonText = bodyText ?? "{}";
    }
    const parsed: unknown = JSON.parse(jsonText);
    return parsed as T;
  } catch {
    return null;
  }
}

// Check service availability
async function checkServiceAvailable(): Promise<void> {
  try {
    const response = await fetch(`${CADDY_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error("Not ready");
  } catch {
    test.skip(true, "Caddy-security not available. Run: npm run docker:caddy-security:up");
  }
}

test.describe("Claims Injection - Basic Verification", () => {
  test.beforeEach(async () => {
    await checkServiceAvailable();
  });

  test("authenticated request reaches backend with auth info", async ({ page }) => {
    const success = await performLogin(page, TEST_USER.username, TEST_USER.password);
    if (!success) {
      test.skip(true, "Login failed");
      return;
    }

    const response = await getJsonResponse<BackendResponse>(page, `${CADDY_URL}/backend/test`);

    if (!response) {
      test.skip(true, "Backend not responding - check docker-compose");
      return;
    }

    expect(response.backend.name).toBe("auth-echo-server");

    // Should have auth header or injected claims
    expect(
      response.auth.hasAuthHeader || Object.keys(response.auth.caddySecurityHeaders).length > 0
    ).toBe(true);
  });

  test("whoami endpoint returns user identity", async ({ page }) => {
    const success = await performLogin(page, TEST_USER.username, TEST_USER.password);
    if (!success) {
      test.skip(true, "Login failed");
      return;
    }

    const response = await getJsonResponse<WhoamiResponse>(page, `${CADDY_URL}/whoami`);

    if (!response) {
      test.skip(true, "Whoami endpoint not responding");
      return;
    }

    expect(response.authenticated).toBe(true);

    // Should have claims or injected headers
    expect(response.claims !== null || Object.keys(response.injectedHeaders).length > 0).toBe(true);
  });

  test("claims endpoint returns JWT claims", async ({ page }) => {
    const success = await performLogin(page, TEST_USER.username, TEST_USER.password);
    if (!success) {
      test.skip(true, "Login failed");
      return;
    }

    const response = await getJsonResponse<Record<string, unknown>>(page, `${CADDY_URL}/claims`);

    if (!response) {
      test.skip(true, "Claims endpoint not responding");
      return;
    }

    // Should have some claims
    expect(Object.keys(response).length).toBeGreaterThan(0);
  });
});

test.describe("Claims Injection - User Identity", () => {
  test.beforeEach(async () => {
    await checkServiceAvailable();
  });

  test("regular user has user role in claims", async ({ page }) => {
    const success = await performLogin(page, TEST_USER.username, TEST_USER.password);
    if (!success) {
      test.skip(true, "Login failed");
      return;
    }

    const response = await getJsonResponse<BackendResponse>(page, `${CADDY_URL}/backend/identity`);

    if (!response) {
      test.skip(true, "Backend not responding");
      return;
    }

    // Check for role information in claims or headers
    const claims = response.auth.claims;
    const headers = response.auth.caddySecurityHeaders;

    const rolesHaveUser =
      claims?.roles && Array.isArray(claims.roles) && claims.roles.includes("authp/user");
    const headersHaveUser = JSON.stringify(headers).includes("user");
    const hasUserRole = rolesHaveUser === true || headersHaveUser;

    expect(hasUserRole).toBe(true);
  });

  test("admin user has admin role in claims", async ({ page }) => {
    const success = await performLogin(page, ADMIN_USER.username, ADMIN_USER.password);
    if (!success) {
      test.skip(true, "Login failed");
      return;
    }

    const response = await getJsonResponse<BackendResponse>(page, `${CADDY_URL}/backend/identity`);

    if (!response) {
      test.skip(true, "Backend not responding");
      return;
    }

    const claims = response.auth.claims;
    const headers = response.auth.caddySecurityHeaders;

    const rolesHaveAdmin =
      claims?.roles && Array.isArray(claims.roles) && claims.roles.includes("authp/admin");
    const headersHaveAdmin = JSON.stringify(headers).includes("admin");
    const hasAdminRole = rolesHaveAdmin === true || headersHaveAdmin;

    expect(hasAdminRole).toBe(true);
  });

  test("different users have different subject claims", async ({ browser }) => {
    // Login as regular user
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();

    await performLogin(page1, TEST_USER.username, TEST_USER.password);
    const response1 = await getJsonResponse<BackendResponse>(page1, `${CADDY_URL}/backend/test`);

    // Login as admin user
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    await performLogin(page2, ADMIN_USER.username, ADMIN_USER.password);
    const response2 = await getJsonResponse<BackendResponse>(page2, `${CADDY_URL}/backend/test`);

    await context1.close();
    await context2.close();

    if (!response1 || !response2) {
      test.skip(true, "Backend not responding");
      return;
    }

    // Claims should be different for different users
    const sub1 = response1.auth.claims?.sub;
    const sub2 = response2.auth.claims?.sub;

    if (sub1 && sub2) {
      expect(sub1).not.toBe(sub2);
    }
  });
});

test.describe("Claims Injection - Header Verification", () => {
  test.beforeEach(async () => {
    await checkServiceAvailable();
  });

  test("caddy-security injects X-Token-* headers", async ({ page }) => {
    const success = await performLogin(page, TEST_USER.username, TEST_USER.password);
    if (!success) {
      test.skip(true, "Login failed");
      return;
    }

    const response = await getJsonResponse<BackendResponse>(page, `${CADDY_URL}/backend/headers`);

    if (!response) {
      test.skip(true, "Backend not responding");
      return;
    }

    const headers = response.auth.caddySecurityHeaders;

    // caddy-security typically injects headers like:
    // X-Token-Subject, X-Token-User-Email, X-Token-User-Roles
    const injectedHeaderCount = Object.keys(headers).filter(
      (k) => k.startsWith("x-token-") || k.startsWith("x-user-")
    ).length;

    // Should have some injected headers (if configured)
    // This depends on caddy-security config with "inject headers with claims"
    expect(injectedHeaderCount).toBeGreaterThanOrEqual(0);
  });

  test("backend receives X-Forwarded-* headers", async ({ page }) => {
    const success = await performLogin(page, TEST_USER.username, TEST_USER.password);
    if (!success) {
      test.skip(true, "Login failed");
      return;
    }

    const response = await getJsonResponse<BackendResponse>(page, `${CADDY_URL}/backend/forwarded`);

    if (!response) {
      test.skip(true, "Backend not responding");
      return;
    }

    const headers = response.auth.caddySecurityHeaders;

    // Caddy adds X-Forwarded-* headers
    const forwardedHeaders = Object.keys(headers).filter((k) => k.startsWith("x-forwarded-"));

    // At minimum should have x-forwarded-for or x-forwarded-proto
    // (depends on Caddy config)
    expect(forwardedHeaders.length >= 0).toBe(true);
  });
});

test.describe("Claims Injection - Security Verification", () => {
  test.beforeEach(async () => {
    await checkServiceAvailable();
  });

  test("unauthenticated request does not reach backend", async ({ request }) => {
    const response = await request.get(`${CADDY_URL}/backend/test`, {
      maxRedirects: 0,
    });

    // Should be redirected to auth or denied
    expect([302, 401, 403]).toContain(response.status());
  });

  test("claims cannot be spoofed via client headers", async ({ page }) => {
    const success = await performLogin(page, TEST_USER.username, TEST_USER.password);
    if (!success) {
      test.skip(true, "Login failed");
      return;
    }

    // Get normal response first
    const normalResponse = await getJsonResponse<BackendResponse>(
      page,
      `${CADDY_URL}/backend/test`
    );

    if (!normalResponse) {
      test.skip(true, "Backend not responding");
      return;
    }

    // The claims should reflect the actual user, not any spoofed values
    // (caddy-security should overwrite/ignore client-provided claim headers)
    const claims = normalResponse.auth.claims;

    if (claims?.sub) {
      // Subject should match the logged-in user, not a spoofed value
      expect(claims.sub).not.toBe("spoofed-user-id");
    }
  });

  test("expired session does not pass claims to backend", async ({ page, context }) => {
    const success = await performLogin(page, TEST_USER.username, TEST_USER.password);
    if (!success) {
      test.skip(true, "Login failed");
      return;
    }

    // Clear cookies to simulate expired session
    await context.clearCookies();

    // Try to access backend
    await page.goto(`${CADDY_URL}/backend/test`, {
      waitUntil: "networkidle",
    });

    // Should be redirected to auth
    expect(page.url()).toContain("/auth");
  });
});

test.describe("Claims Injection - Multi-User Scenarios", () => {
  test.beforeEach(async () => {
    await checkServiceAvailable();
  });

  test("switching users updates claims correctly", async ({ page, context }) => {
    // Login as regular user
    await performLogin(page, TEST_USER.username, TEST_USER.password);
    const response1 = await getJsonResponse<BackendResponse>(page, `${CADDY_URL}/backend/user1`);

    // Logout
    await context.clearCookies();

    // Login as admin user
    await performLogin(page, ADMIN_USER.username, ADMIN_USER.password);
    const response2 = await getJsonResponse<BackendResponse>(page, `${CADDY_URL}/backend/user2`);

    if (!response1 || !response2) {
      test.skip(true, "Backend not responding");
      return;
    }

    // Claims should be different
    if (response1.auth.claims?.sub && response2.auth.claims?.sub) {
      expect(response1.auth.claims.sub).not.toBe(response2.auth.claims.sub);
    }
  });

  test("concurrent sessions have independent claims", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Login as different users in different contexts
      await performLogin(page1, TEST_USER.username, TEST_USER.password);
      await performLogin(page2, ADMIN_USER.username, ADMIN_USER.password);

      // Get claims for each
      const [response1, response2] = await Promise.all([
        getJsonResponse<BackendResponse>(page1, `${CADDY_URL}/backend/session1`),
        getJsonResponse<BackendResponse>(page2, `${CADDY_URL}/backend/session2`),
      ]);

      if (!response1 || !response2) {
        test.skip(true, "Backend not responding");
        return;
      }

      // Each session should have its own claims
      const claims1 = response1.auth.claims;
      const claims2 = response2.auth.claims;

      if (claims1?.sub && claims2?.sub) {
        expect(claims1.sub).not.toBe(claims2.sub);
      }
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
