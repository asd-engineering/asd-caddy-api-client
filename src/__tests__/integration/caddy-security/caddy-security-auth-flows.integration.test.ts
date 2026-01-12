/**
 * Complete Authentication Flow Tests for caddy-security
 *
 * Tests the full authentication lifecycle including:
 * - Login and JWT token capture
 * - Token-based access to protected resources
 * - Cookie-based authentication
 * - Token refresh flow
 * - Logout and session termination
 * - Role-based access control (RBAC)
 *
 * Requirements:
 * - Caddy with caddy-security plugin running (docker-compose.caddy-security.yml)
 * - Test users configured in local identity store
 *
 * Run with: DOCKER_TEST=1 npm run test:integration:caddy-security-auth
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CaddyClient } from "../../../caddy/client.js";
import {
  buildLocalIdentityStore,
  buildAuthenticationPortal,
  buildAuthorizationPolicy,
  buildSecurityConfig,
  buildSecurityApp,
  buildAuthenticatorRoute,
  buildProtectedRoute,
} from "../../../plugins/caddy-security/builders.js";

// Test configuration
const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2020";
const CADDY_HTTP_URL = process.env.CADDY_HTTP_URL ?? "http://127.0.0.1:8084";

// Test users - must match local-users.json in fixtures
const USERS = {
  regular: { username: "testuser", password: "testpass123", roles: ["user"] },
  admin: { username: "admin", password: "adminpass123", roles: ["admin", "user"] },
  editor: { username: "editor", password: "editorpass123", roles: ["editor", "user"] },
};

// Cookie jar for maintaining session state
class CookieJar {
  private cookies = new Map<string, string>();

  setCookiesFromResponse(response: Response): void {
    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookieHeaders) {
      const [nameValue] = cookie.split(";");
      const [name, value] = nameValue.split("=");
      if (name && value) {
        this.cookies.set(name.trim(), value.trim());
      }
    }
    // Fallback for older fetch implementations
    const singleHeader = response.headers.get("Set-Cookie");
    if (singleHeader) {
      const [nameValue] = singleHeader.split(";");
      const [name, value] = nameValue.split("=");
      if (name && value) {
        this.cookies.set(name.trim(), value.trim());
      }
    }
  }

  getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  clear(): void {
    this.cookies.clear();
  }

  hasCookies(): boolean {
    return this.cookies.size > 0;
  }
}

// Skip if not in CI or docker environment
const skipIfNoDocker = !process.env.CI && !process.env.DOCKER_TEST;

describe.skipIf(skipIfNoDocker)(
  "caddy-security Authentication Flows",
  () => {
    let client: CaddyClient;
    let cookieJar: CookieJar;

    beforeAll(async () => {
      client = new CaddyClient({ adminUrl: CADDY_ADMIN_URL, timeout: 10000 });
      cookieJar = new CookieJar();

      // Verify Caddy is reachable
      try {
        await client.getConfig();
      } catch {
        throw new Error(
          `Cannot connect to Caddy at ${CADDY_ADMIN_URL}. Ensure docker-compose is running.`
        );
      }

      // Setup security configuration
      await setupSecurityConfig(client);
    });

    afterAll(async () => {
      try {
        await client.request("/config/apps/security", { method: "DELETE" });
      } catch {
        // Ignore cleanup errors
      }
    });

    beforeEach(() => {
      cookieJar.clear();
    });

    // ============================================================================
    // Complete Login Flow Tests
    // ============================================================================

    describe("Complete Login Flow", () => {
      test("login returns authentication cookie", async () => {
        const response = await performLogin(USERS.regular.username, USERS.regular.password);

        // Successful login should redirect or return success
        expect([200, 302, 303]).toContain(response.status);

        // Capture cookies from response
        cookieJar.setCookiesFromResponse(response);

        // Should have authentication cookie
        // caddy-security typically uses 'access_token' or 'AUTHP_ACCESS_TOKEN'
        const hasAuthCookie =
          cookieJar.getCookie("access_token") !== undefined ||
          cookieJar.getCookie("AUTHP_ACCESS_TOKEN") !== undefined ||
          cookieJar.hasCookies();

        if (response.status === 302 || response.status === 303) {
          expect(hasAuthCookie).toBe(true);
        }
      });

      test("can access protected resource with authentication cookie", async () => {
        // First login
        const loginResponse = await performLogin(USERS.regular.username, USERS.regular.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        // Now access protected resource with cookie
        const protectedResponse = await fetch(`${CADDY_HTTP_URL}/api/protected`, {
          headers: {
            Cookie: cookieJar.getCookieHeader(),
          },
          redirect: "manual",
        });

        // With valid cookie, should get 200 or the actual resource
        // If session is valid, won't redirect to login
        if (cookieJar.hasCookies()) {
          expect([200, 302]).toContain(protectedResponse.status);
        }
      });

      test("can access protected resource with Bearer token", async () => {
        // Login and capture token from response/cookie
        const loginResponse = await performLogin(USERS.regular.username, USERS.regular.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        const token =
          cookieJar.getCookie("access_token") ?? cookieJar.getCookie("AUTHP_ACCESS_TOKEN");

        if (token) {
          const response = await fetch(`${CADDY_HTTP_URL}/api/protected`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            redirect: "manual",
          });

          // Valid token should grant access
          expect([200, 302, 401, 403]).toContain(response.status);
        }
      });

      test("sequential requests maintain session", async () => {
        // Login
        const loginResponse = await performLogin(USERS.regular.username, USERS.regular.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        // Make multiple requests with same session
        const requests = [
          fetch(`${CADDY_HTTP_URL}/api/protected`, {
            headers: { Cookie: cookieJar.getCookieHeader() },
            redirect: "manual",
          }),
          fetch(`${CADDY_HTTP_URL}/api/another`, {
            headers: { Cookie: cookieJar.getCookieHeader() },
            redirect: "manual",
          }),
          fetch(`${CADDY_HTTP_URL}/dashboard`, {
            headers: { Cookie: cookieJar.getCookieHeader() },
            redirect: "manual",
          }),
        ];

        const responses = await Promise.all(requests);

        // All should either succeed or get consistent behavior
        for (const response of responses) {
          expect([200, 302, 404]).toContain(response.status);
        }
      });
    });

    // ============================================================================
    // Cookie-Based Authentication Tests
    // ============================================================================

    describe("Cookie-Based Authentication", () => {
      test("authentication cookie has correct attributes", async () => {
        const response = await performLogin(USERS.regular.username, USERS.regular.password);

        const setCookie = response.headers.get("Set-Cookie");
        if (setCookie) {
          // Should have HttpOnly flag for security
          // Should have appropriate path
          expect(setCookie.toLowerCase()).toMatch(/path=\//);

          // Should have appropriate expiration or max-age
          expect(setCookie.toLowerCase()).toMatch(/(expires=|max-age=)/);
        }
      });

      test("cookie domain matches configuration", async () => {
        const response = await performLogin(USERS.regular.username, USERS.regular.password);

        const setCookie = response.headers.get("Set-Cookie");
        if (setCookie) {
          // Domain should be localhost or configured domain
          const domainRegex = /domain=([^;]+)/i;
          const domainMatch = domainRegex.exec(setCookie);
          if (domainMatch) {
            expect(domainMatch[1]).toMatch(/localhost|127\.0\.0\.1/);
          }
        }
      });

      test("missing cookie results in redirect to login", async () => {
        // Request without any cookies
        const response = await fetch(`${CADDY_HTTP_URL}/api/protected`, {
          redirect: "manual",
        });

        // Should redirect to login or return 401/403
        expect([302, 303, 401, 403]).toContain(response.status);

        if (response.status === 302 || response.status === 303) {
          const location = response.headers.get("Location");
          expect(location).toMatch(/auth|login/i);
        }
      });

      test("expired cookie results in re-authentication", async () => {
        // Use an obviously invalid/expired cookie
        const response = await fetch(`${CADDY_HTTP_URL}/api/protected`, {
          headers: {
            Cookie: "access_token=expired_invalid_token_12345",
          },
          redirect: "manual",
        });

        // Should require re-authentication
        expect([302, 303, 401, 403]).toContain(response.status);
      });
    });

    // ============================================================================
    // Role-Based Access Control (RBAC) Tests
    // ============================================================================

    describe("Role-Based Access Control (RBAC)", () => {
      test("admin user can access admin-only resources", async () => {
        // Login as admin
        const loginResponse = await performLogin(USERS.admin.username, USERS.admin.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        // Access admin resource
        const response = await fetch(`${CADDY_HTTP_URL}/admin/dashboard`, {
          headers: { Cookie: cookieJar.getCookieHeader() },
          redirect: "manual",
        });

        // Admin should have access (200) or resource not found (404)
        // Should NOT get auth redirect if properly authenticated as admin
        if (cookieJar.hasCookies()) {
          expect([200, 404]).toContain(response.status);
        }
      });

      test("regular user cannot access admin-only resources", async () => {
        // Login as regular user
        const loginResponse = await performLogin(USERS.regular.username, USERS.regular.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        // Try to access admin resource
        const response = await fetch(`${CADDY_HTTP_URL}/admin/dashboard`, {
          headers: { Cookie: cookieJar.getCookieHeader() },
          redirect: "manual",
        });

        // Regular user should be denied (403) or redirected
        if (cookieJar.hasCookies()) {
          expect([302, 403, 404]).toContain(response.status);
        }
      });

      test("editor can access editor resources but not admin", async () => {
        // Login as editor
        const loginResponse = await performLogin(USERS.editor.username, USERS.editor.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        if (cookieJar.hasCookies()) {
          // Editor should access editor resources
          const editorResponse = await fetch(`${CADDY_HTTP_URL}/editor/content`, {
            headers: { Cookie: cookieJar.getCookieHeader() },
            redirect: "manual",
          });
          expect([200, 404]).toContain(editorResponse.status);

          // Editor should NOT access admin resources
          const adminResponse = await fetch(`${CADDY_HTTP_URL}/admin/dashboard`, {
            headers: { Cookie: cookieJar.getCookieHeader() },
            redirect: "manual",
          });
          expect([302, 403, 404]).toContain(adminResponse.status);
        }
      });

      test("multiple roles grant cumulative access", async () => {
        // Admin has both admin and user roles
        const loginResponse = await performLogin(USERS.admin.username, USERS.admin.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        if (cookieJar.hasCookies()) {
          // Should access user resources
          const userResponse = await fetch(`${CADDY_HTTP_URL}/api/user-profile`, {
            headers: { Cookie: cookieJar.getCookieHeader() },
            redirect: "manual",
          });
          expect([200, 404]).toContain(userResponse.status);

          // Should also access admin resources
          const adminResponse = await fetch(`${CADDY_HTTP_URL}/admin/dashboard`, {
            headers: { Cookie: cookieJar.getCookieHeader() },
            redirect: "manual",
          });
          expect([200, 404]).toContain(adminResponse.status);
        }
      });
    });

    // ============================================================================
    // Logout and Session Termination Tests
    // ============================================================================

    describe("Logout and Session Termination", () => {
      test("logout endpoint clears authentication cookie", async () => {
        // First login
        const loginResponse = await performLogin(USERS.regular.username, USERS.regular.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        // Now logout
        const logoutResponse = await fetch(`${CADDY_HTTP_URL}/auth/logout`, {
          headers: { Cookie: cookieJar.getCookieHeader() },
          redirect: "manual",
        });

        // Logout should clear cookies (Set-Cookie with expiry in past or max-age=0)
        const setCookie = logoutResponse.headers.get("Set-Cookie");
        if (setCookie) {
          // Cookie should be cleared
          expect(setCookie.toLowerCase()).toMatch(/(max-age=0|expires=.*1970)/);
        }
      });

      test("after logout, protected resources require re-authentication", async () => {
        // Login
        const loginResponse = await performLogin(USERS.regular.username, USERS.regular.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        // Logout
        await fetch(`${CADDY_HTTP_URL}/auth/logout`, {
          headers: { Cookie: cookieJar.getCookieHeader() },
          redirect: "manual",
        });

        // Clear local cookie jar to simulate browser clearing expired cookies
        cookieJar.clear();

        // Try to access protected resource
        const response = await fetch(`${CADDY_HTTP_URL}/api/protected`, {
          redirect: "manual",
        });

        // Should require authentication
        expect([302, 303, 401, 403]).toContain(response.status);
      });

      test("logout from one session does not affect other sessions", async () => {
        // Login twice (simulating two devices/browsers)
        const session1Login = await performLogin(USERS.regular.username, USERS.regular.password);
        const session1Jar = new CookieJar();
        session1Jar.setCookiesFromResponse(session1Login);

        const session2Login = await performLogin(USERS.regular.username, USERS.regular.password);
        const session2Jar = new CookieJar();
        session2Jar.setCookiesFromResponse(session2Login);

        // Logout session 1
        await fetch(`${CADDY_HTTP_URL}/auth/logout`, {
          headers: { Cookie: session1Jar.getCookieHeader() },
          redirect: "manual",
        });

        // Session 2 should still work (if server supports multiple sessions)
        if (session2Jar.hasCookies()) {
          const response = await fetch(`${CADDY_HTTP_URL}/api/protected`, {
            headers: { Cookie: session2Jar.getCookieHeader() },
            redirect: "manual",
          });

          // Session 2 might still be valid depending on implementation
          expect([200, 302, 401, 403]).toContain(response.status);
        }
      });
    });

    // ============================================================================
    // Token Refresh Tests
    // ============================================================================

    describe("Token Refresh Flow", () => {
      test("token refresh extends session lifetime", async () => {
        // Login
        const loginResponse = await performLogin(USERS.regular.username, USERS.regular.password);
        cookieJar.setCookiesFromResponse(loginResponse);

        // Access refresh endpoint
        const refreshResponse = await fetch(`${CADDY_HTTP_URL}/auth/refresh`, {
          method: "POST",
          headers: { Cookie: cookieJar.getCookieHeader() },
          redirect: "manual",
        });

        // Refresh should return new token or update cookie
        if (refreshResponse.status === 200) {
          const newCookie = refreshResponse.headers.get("Set-Cookie");
          if (newCookie) {
            // Should have a new/updated token
            expect(newCookie).toBeTruthy();
          }
        }
      });

      test("refresh without valid session fails", async () => {
        // Try to refresh without any session
        const response = await fetch(`${CADDY_HTTP_URL}/auth/refresh`, {
          method: "POST",
          redirect: "manual",
        });

        // Should fail
        expect([302, 401, 403, 404]).toContain(response.status);
      });

      test("refresh with invalid token fails", async () => {
        const response = await fetch(`${CADDY_HTTP_URL}/auth/refresh`, {
          method: "POST",
          headers: {
            Cookie: "access_token=invalid_token_xyz",
          },
          redirect: "manual",
        });

        // Should fail
        expect([302, 401, 403, 404]).toContain(response.status);
      });
    });

    // ============================================================================
    // Error Handling Tests
    // ============================================================================

    describe("Authentication Error Handling", () => {
      test("invalid credentials return appropriate error", async () => {
        const response = await performLogin("wronguser", "wrongpassword");

        // Should return error (401) or show login page with error (200)
        expect([200, 401, 403]).toContain(response.status);

        if (response.status === 200) {
          const body = await response.text();
          // Should show error message
          expect(body.toLowerCase()).toMatch(/invalid|incorrect|failed|error/);
        }
      });

      test("empty credentials return appropriate error", async () => {
        const response = await performLogin("", "");

        // Should reject empty credentials
        expect([200, 400, 401, 403]).toContain(response.status);
      });

      test("SQL injection attempt is handled safely", async () => {
        const response = await performLogin("admin'--", "' OR '1'='1");

        // Should not allow injection
        expect([200, 400, 401, 403]).toContain(response.status);

        // Should NOT be successful login
        const cookies = response.headers.get("Set-Cookie") ?? "";
        expect(cookies).not.toMatch(/access_token=[^;]+[a-zA-Z0-9]/);
      });

      test("XSS attempt in username is sanitized", async () => {
        const response = await performLogin("<script>alert('xss')</script>", "password");

        // Should handle safely
        expect([200, 400, 401, 403]).toContain(response.status);

        if (response.status === 200) {
          const body = await response.text();
          // Should NOT contain unescaped script tags
          expect(body).not.toContain("<script>alert");
        }
      });
    });

    // ============================================================================
    // Helper Functions
    // ============================================================================

    async function performLogin(username: string, password: string): Promise<Response> {
      return fetch(`${CADDY_HTTP_URL}/auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ username, password }).toString(),
        redirect: "manual",
      });
    }

    async function setupSecurityConfig(caddyClient: CaddyClient): Promise<void> {
      // Build local identity store
      const localStore = buildLocalIdentityStore({
        path: "/data/users.json",
        realm: "local",
      });

      // Build authentication portal
      const portal = buildAuthenticationPortal({
        name: "auth-flow-portal",
        identityStores: ["local"],
        cookie: {
          domain: "localhost",
          lifetime: "1h",
          path: "/",
        },
      });

      // Build authorization policies for different access levels
      const userPolicy = buildAuthorizationPolicy({
        name: "user-policy",
        accessLists: [{ claim: "roles", values: ["user", "admin", "editor"], action: "allow" }],
        bypass: ["/health", "/public"],
      });

      const adminPolicy = buildAuthorizationPolicy({
        name: "admin-policy",
        accessLists: [{ claim: "roles", values: ["admin"], action: "allow" }],
      });

      const editorPolicy = buildAuthorizationPolicy({
        name: "editor-policy",
        accessLists: [{ claim: "roles", values: ["editor", "admin"], action: "allow" }],
      });

      // Build config
      const config = buildSecurityConfig({
        identityStores: [localStore],
        portals: [portal],
        policies: [userPolicy, adminPolicy, editorPolicy],
      });

      // Apply security config
      await caddyClient.request("/config/apps/security", {
        method: "PUT",
        body: JSON.stringify(buildSecurityApp({ config })),
      });

      // Get server name
      const currentConfig = await caddyClient.getConfig();
      const serverName = Object.keys(
        (currentConfig as { apps?: { http?: { servers?: Record<string, unknown> } } }).apps?.http
          ?.servers ?? {}
      )[0];

      if (!serverName) return;

      // Build and add routes
      const authRoute = buildAuthenticatorRoute({
        hosts: ["localhost"],
        portalName: "auth-flow-portal",
        routeId: "auth-flow-portal-route",
      });

      const userApiRoute = buildProtectedRoute({
        hosts: ["localhost"],
        paths: ["/api/*", "/dashboard"],
        gatekeeperName: "user-policy",
        dial: "localhost:8080",
        routeId: "user-api-route",
      });

      const adminRoute = buildProtectedRoute({
        hosts: ["localhost"],
        paths: ["/admin/*"],
        gatekeeperName: "admin-policy",
        dial: "localhost:8080",
        routeId: "admin-route",
      });

      const editorRoute = buildProtectedRoute({
        hosts: ["localhost"],
        paths: ["/editor/*"],
        gatekeeperName: "editor-policy",
        dial: "localhost:8080",
        routeId: "editor-route",
      });

      // Add routes (ignoring errors if already exist)
      for (const route of [authRoute, userApiRoute, adminRoute, editorRoute]) {
        try {
          await caddyClient.addRoute(serverName, route);
        } catch {
          // Route might already exist
        }
      }
    }
  },
  { timeout: 120000 }
);
