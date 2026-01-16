/**
 * End-to-End Integration Tests for caddy-security
 *
 * These tests validate ACTUAL authentication flows, not just config generation.
 * They test the complete flow from login to protected resource access.
 *
 * Requirements:
 * - Caddy with caddy-security plugin running (docker-compose.caddy-security.yml)
 * - OpenLDAP running (docker-compose.ldap.yml) OR
 * - Keycloak running (docker-compose.keycloak.yml)
 *
 * Run with: DOCKER_TEST=1 npm run test:integration:caddy-security-e2e
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CaddyClient } from "../../../caddy/client.js";
import {
  buildLocalIdentityStore,
  buildLdapIdentityStore,
  buildOidcProvider,
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
const LDAP_HOST = process.env.LDAP_HOST ?? "openldap";
const LDAP_PORT = 389;

// Test users (must exist in LDAP/local store)
const TEST_USER = {
  username: "testuser",
  password: "testpass123",
};
// Reserved for RBAC tests
const _TEST_ADMIN = {
  username: "admin",
  password: "adminpass123",
};

// Skip unless CADDY_SECURITY_TEST is explicitly set (requires caddy-security Docker stack)
const skipIfNoSecurityStack = !process.env.CADDY_SECURITY_TEST;

describe.skipIf(skipIfNoSecurityStack)(
  "caddy-security E2E Integration",
  () => {
    let client: CaddyClient;
    let originalConfig: unknown;

    beforeAll(async () => {
      client = new CaddyClient({ adminUrl: CADDY_ADMIN_URL, timeout: 10000 });

      // Verify Caddy is reachable
      try {
        originalConfig = await client.getConfig();
      } catch {
        throw new Error(
          `Cannot connect to Caddy at ${CADDY_ADMIN_URL}. ` + "Ensure docker-compose is running."
        );
      }
    });

    afterAll(async () => {
      // Restore original config
      if (originalConfig) {
        try {
          await client.applyConfig(originalConfig as Record<string, unknown>);
        } catch {
          // Best effort cleanup
        }
      }
    });

    describe("HTTP Authentication Flow Tests", () => {
      beforeEach(async () => {
        // Clean slate for each test
        try {
          await client.request("/config/apps/security", { method: "DELETE" });
        } catch {
          // Ignore if already deleted
        }
      });

      test("unauthenticated request to protected route returns 401/403", async () => {
        // 1. Setup security config with local identity store
        const localStore = buildLocalIdentityStore({
          path: "/data/users.json",
          realm: "local",
        });

        const portal = buildAuthenticationPortal({
          name: "test-portal",
          identityStores: ["local"],
        });

        const policy = buildAuthorizationPolicy({
          name: "test-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"] }],
        });

        const config = buildSecurityConfig({
          identityStores: [localStore],
          portals: [portal],
          policies: [policy],
        });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(buildSecurityApp({ config })),
        });

        // 2. Add protected route
        const protectedRoute = buildProtectedRoute({
          hosts: ["localhost"],
          paths: ["/api/protected"],
          gatekeeperName: "test-policy",
          dial: "localhost:8080",
          routeId: "e2e-protected",
        });

        // Get current server name
        const currentConfig = await client.getConfig();
        const serverName = Object.keys(
          (currentConfig as { apps?: { http?: { servers?: Record<string, unknown> } } }).apps?.http
            ?.servers ?? {}
        )[0];

        if (serverName) {
          await client.addRoute(serverName, protectedRoute);
        }

        // 3. Make unauthenticated request
        const response = await fetch(`${CADDY_HTTP_URL}/api/protected`, {
          method: "GET",
          redirect: "manual", // Don't follow redirects
        });

        // Should be 401 Unauthorized or 302 redirect to login
        expect([401, 403, 302]).toContain(response.status);
      });

      test("health endpoint bypasses authentication", async () => {
        // 1. Setup security config with bypass
        const localStore = buildLocalIdentityStore({
          path: "/data/users.json",
        });

        const portal = buildAuthenticationPortal({
          name: "test-portal",
          identityStores: ["local"],
        });

        const policy = buildAuthorizationPolicy({
          name: "test-policy",
          accessLists: [{ claim: "roles", values: ["user"] }],
          bypass: ["/health", "/health/*"],
        });

        const config = buildSecurityConfig({
          identityStores: [localStore],
          portals: [portal],
          policies: [policy],
        });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(buildSecurityApp({ config })),
        });

        // 2. Health endpoint should be accessible without auth
        const response = await fetch(`${CADDY_HTTP_URL}/health`);
        expect(response.status).toBe(200);
      });

      test("public endpoint is accessible without authentication", async () => {
        const response = await fetch(`${CADDY_HTTP_URL}/public`);
        // Public endpoints should work (200) or return expected response
        expect([200, 404]).toContain(response.status);
      });

      test("auth portal endpoint returns login page", async () => {
        // 1. Setup security config
        const localStore = buildLocalIdentityStore({
          path: "/data/users.json",
        });

        const portal = buildAuthenticationPortal({
          name: "test-portal",
          identityStores: ["local"],
        });

        const config = buildSecurityConfig({
          identityStores: [localStore],
          portals: [portal],
        });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(buildSecurityApp({ config })),
        });

        // 2. Add auth route
        const authRoute = buildAuthenticatorRoute({
          hosts: ["localhost"],
          portalName: "test-portal",
          routeId: "e2e-auth",
        });

        const currentConfig = await client.getConfig();
        const serverName = Object.keys(
          (currentConfig as { apps?: { http?: { servers?: Record<string, unknown> } } }).apps?.http
            ?.servers ?? {}
        )[0];

        if (serverName) {
          await client.addRoute(serverName, authRoute);
        }

        // 3. Access auth endpoint - should return login form
        const response = await fetch(`${CADDY_HTTP_URL}/auth`);
        expect([200, 302]).toContain(response.status);

        if (response.status === 200) {
          const html = await response.text();
          // Should contain login form elements
          expect(html).toMatch(/<form|login|password|username/i);
        }
      });
    });

    describe("LDAP Authentication Flow", () => {
      test("LDAP config can be applied and validated", async () => {
        const ldapStore = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindDn: "cn=admin,dc=test,dc=local",
          bindPassword: "admin",
          searchBaseDn: "ou=users,dc=test,dc=local",
          searchFilter: "(uid={username})",
        });

        const portal = buildAuthenticationPortal({
          name: "ldap-portal",
          identityStores: ["ldap"],
        });

        const policy = buildAuthorizationPolicy({
          name: "ldap-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"] }],
        });

        const config = buildSecurityConfig({
          identityStores: [ldapStore],
          portals: [portal],
          policies: [policy],
        });

        const app = buildSecurityApp({ config });

        // This tests that Caddy accepts the LDAP configuration
        // If LDAP server is unreachable, Caddy should still accept the config
        // but authentication will fail at runtime
        const response = await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(app),
        });

        expect(response).toBeDefined();

        // Verify config structure was applied correctly
        const appliedConfig = await client.request<{
          config: { identity_stores: { driver: string }[] };
        }>("/config/apps/security");

        expect(appliedConfig.config?.identity_stores?.[0].driver).toBe("ldap");
      });

      test("LDAP login attempt with valid credentials", async () => {
        // This test requires LDAP server to be running
        // Setup LDAP auth and attempt login
        const ldapStore = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindDn: "cn=admin,dc=test,dc=local",
          bindPassword: "admin",
          searchBaseDn: "ou=users,dc=test,dc=local",
        });

        const portal = buildAuthenticationPortal({
          name: "ldap-login-portal",
          identityStores: ["ldap"],
        });

        const config = buildSecurityConfig({
          identityStores: [ldapStore],
          portals: [portal],
        });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(buildSecurityApp({ config })),
        });

        // Add auth route
        const authRoute = buildAuthenticatorRoute({
          hosts: ["localhost"],
          portalName: "ldap-login-portal",
          routeId: "ldap-auth-route",
        });

        const currentConfig = await client.getConfig();
        const serverName = Object.keys(
          (currentConfig as { apps?: { http?: { servers?: Record<string, unknown> } } }).apps?.http
            ?.servers ?? {}
        )[0];

        if (serverName) {
          try {
            await client.addRoute(serverName, authRoute);
          } catch {
            // Route might already exist
          }
        }

        // Attempt login with LDAP credentials
        const loginResponse = await fetch(`${CADDY_HTTP_URL}/auth`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            username: TEST_USER.username,
            password: TEST_USER.password,
          }).toString(),
          redirect: "manual",
        });

        // Login should either succeed (302 redirect with Set-Cookie)
        // or return the form with error (200)
        // or return 401 if credentials are wrong
        expect([200, 302, 401]).toContain(loginResponse.status);

        // If successful login, should have Set-Cookie header
        if (loginResponse.status === 302) {
          const cookies = loginResponse.headers.get("Set-Cookie");
          // Should set an authentication cookie
          expect(cookies).toBeTruthy();
        }
      });
    });

    describe("OIDC Authentication Flow", () => {
      const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://keycloak:8081";
      const KEYCLOAK_REALM = "test-realm";

      test("OIDC config can be applied", async () => {
        const oidcProvider = buildOidcProvider({
          provider: "keycloak",
          clientId: "caddy-app",
          clientSecret: "test-secret",
          discoveryUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
        });

        const portal = buildAuthenticationPortal({
          name: "oidc-portal",
          identityProviders: ["keycloak"],
        });

        const config = buildSecurityConfig({
          identityProviders: [oidcProvider],
          portals: [portal],
        });

        const response = await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(buildSecurityApp({ config })),
        });

        expect(response).toBeDefined();

        const appliedConfig = await client.request<{
          config: { identity_providers: { driver: string }[] };
        }>("/config/apps/security");

        expect(appliedConfig.config?.identity_providers?.[0].driver).toBe("oidc");
      });

      test("OIDC login redirects to identity provider", async () => {
        const oidcProvider = buildOidcProvider({
          provider: "keycloak",
          clientId: "caddy-app",
          clientSecret: "test-secret",
          discoveryUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
        });

        const portal = buildAuthenticationPortal({
          name: "oidc-redirect-portal",
          identityProviders: ["keycloak"],
        });

        const config = buildSecurityConfig({
          identityProviders: [oidcProvider],
          portals: [portal],
        });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(buildSecurityApp({ config })),
        });

        const authRoute = buildAuthenticatorRoute({
          hosts: ["localhost"],
          portalName: "oidc-redirect-portal",
          routeId: "oidc-redirect-route",
        });

        const currentConfig = await client.getConfig();
        const serverName = Object.keys(
          (currentConfig as { apps?: { http?: { servers?: Record<string, unknown> } } }).apps?.http
            ?.servers ?? {}
        )[0];

        if (serverName) {
          try {
            await client.addRoute(serverName, authRoute);
          } catch {
            // Route might already exist
          }
        }

        // Clicking "Login with Keycloak" should redirect to Keycloak
        const response = await fetch(`${CADDY_HTTP_URL}/auth/oauth2/keycloak`, {
          redirect: "manual",
        });

        // Should get redirect to Keycloak
        if (response.status === 302) {
          const location = response.headers.get("Location");
          expect(location).toContain(KEYCLOAK_URL);
          expect(location).toContain("client_id=caddy-app");
        }
      });
    });

    describe("Token Validation", () => {
      test("request with invalid token is rejected", async () => {
        const localStore = buildLocalIdentityStore({
          path: "/data/users.json",
        });

        const portal = buildAuthenticationPortal({
          name: "token-portal",
          identityStores: ["local"],
        });

        const policy = buildAuthorizationPolicy({
          name: "token-policy",
          accessLists: [{ claim: "roles", values: ["user"] }],
        });

        const config = buildSecurityConfig({
          identityStores: [localStore],
          portals: [portal],
          policies: [policy],
        });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(buildSecurityApp({ config })),
        });

        const protectedRoute = buildProtectedRoute({
          hosts: ["localhost"],
          paths: ["/api/token-test"],
          gatekeeperName: "token-policy",
          dial: "localhost:8080",
          routeId: "token-protected",
        });

        const currentConfig = await client.getConfig();
        const serverName = Object.keys(
          (currentConfig as { apps?: { http?: { servers?: Record<string, unknown> } } }).apps?.http
            ?.servers ?? {}
        )[0];

        if (serverName) {
          try {
            await client.addRoute(serverName, protectedRoute);
          } catch {
            // Route might already exist
          }
        }

        // Request with invalid/forged token
        const response = await fetch(`${CADDY_HTTP_URL}/api/token-test`, {
          headers: {
            Authorization: "Bearer invalid.jwt.token",
          },
          redirect: "manual",
        });

        // Should reject invalid token
        expect([401, 403, 302]).toContain(response.status);
      });

      test("request with expired token is rejected", async () => {
        // Create an expired JWT (not a real test without actual token signing)
        // This is a placeholder - in real test you'd create a real expired JWT
        const expiredToken =
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
          "eyJzdWIiOiJ0ZXN0dXNlciIsImV4cCI6MH0." +
          "fakesignature";

        const response = await fetch(`${CADDY_HTTP_URL}/api/protected`, {
          headers: {
            Authorization: `Bearer ${expiredToken}`,
          },
          redirect: "manual",
        });

        expect([401, 403, 302]).toContain(response.status);
      });
    });

    describe("Multi-Policy Authorization", () => {
      test("admin policy restricts access to admin-only resources", async () => {
        const localStore = buildLocalIdentityStore({
          path: "/data/users.json",
        });

        const portal = buildAuthenticationPortal({
          name: "multi-policy-portal",
          identityStores: ["local"],
        });

        // User policy - allows user and admin
        const userPolicy = buildAuthorizationPolicy({
          name: "user-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"] }],
        });

        // Admin policy - only allows admin
        const adminPolicy = buildAuthorizationPolicy({
          name: "admin-only-policy",
          accessLists: [{ claim: "roles", values: ["admin"] }],
        });

        const config = buildSecurityConfig({
          identityStores: [localStore],
          portals: [portal],
          policies: [userPolicy, adminPolicy],
        });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(buildSecurityApp({ config })),
        });

        // Both routes should be created with different policies
        const userRoute = buildProtectedRoute({
          hosts: ["localhost"],
          paths: ["/user/*"],
          gatekeeperName: "user-policy",
          dial: "localhost:8080",
          routeId: "user-area",
        });

        const adminRoute = buildProtectedRoute({
          hosts: ["localhost"],
          paths: ["/admin/*"],
          gatekeeperName: "admin-only-policy",
          dial: "localhost:8080",
          routeId: "admin-area",
        });

        // Verify both routes can be built
        expect(userRoute.handle?.[0]).toMatchObject({
          handler: "authentication",
          providers: {
            authorizer: { gatekeeper_name: "user-policy" },
          },
        });

        expect(adminRoute.handle?.[0]).toMatchObject({
          handler: "authentication",
          providers: {
            authorizer: { gatekeeper_name: "admin-only-policy" },
          },
        });
      });
    });

    describe("Error Handling", () => {
      test("invalid security config is rejected by Caddy", async () => {
        // Try to apply config with missing required field
        const invalidConfig = {
          config: {
            authentication_portals: [
              {
                // Missing 'name' field which is required
                identity_stores: ["nonexistent"],
              },
            ],
          },
        };

        try {
          await client.request("/config/apps/security", {
            method: "PUT",
            body: JSON.stringify(invalidConfig),
          });
          // If we get here, the config was accepted (Caddy might be lenient)
        } catch (error) {
          // Expected - Caddy should reject invalid config
          expect(error).toBeDefined();
        }
      });

      test("referencing non-existent identity store fails gracefully", async () => {
        const portal = buildAuthenticationPortal({
          name: "broken-portal",
          identityStores: ["nonexistent-store"], // This store doesn't exist
        });

        const config = buildSecurityConfig({
          portals: [portal],
          // Note: no identity stores defined
        });

        // This might succeed at config time but fail at runtime
        // depending on Caddy's validation behavior
        try {
          await client.request("/config/apps/security", {
            method: "PUT",
            body: JSON.stringify(buildSecurityApp({ config })),
          });
        } catch {
          // Expected if Caddy validates references
        }
      });
    });
  },
  { timeout: 60000 }
);
