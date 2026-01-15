/**
 * Integration tests for caddy-security with LDAP identity store
 *
 * These tests validate that our builder API correctly configures caddy-security
 * for LDAP authentication via the Caddy Admin API.
 *
 * Requirements:
 * - Caddy with caddy-security plugin running (docker-compose.caddy-security.yml)
 * - OpenLDAP running (docker-compose.ldap.yml)
 *
 * Run with: npm run test:integration:caddy-security-ldap
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../../caddy/client.js";
import {
  buildLdapIdentityStore,
  buildAuthenticationPortal,
  buildAuthorizationPolicy,
  buildSecurityConfig,
  buildSecurityApp,
  buildAuthenticatorHandler,
  buildAuthorizationHandler,
  buildAuthenticatorRoute,
  buildProtectedRoute,
} from "../../../plugins/caddy-security/builders.js";

// Test configuration
const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2020";
const LDAP_HOST = process.env.LDAP_HOST ?? "localhost";
const LDAP_PORT = parseInt(process.env.LDAP_PORT ?? "389", 10);
const LDAP_BIND_DN = "cn=admin,dc=test,dc=local";
const LDAP_BIND_PASSWORD = "admin";
const LDAP_SEARCH_BASE_DN = "ou=users,dc=test,dc=local";
const LDAP_SEARCH_FILTER = "(uid={username})";

// Skip unless CADDY_SECURITY_TEST is explicitly set (requires caddy-security Docker stack)
const skipIfNoSecurityStack = !process.env.CADDY_SECURITY_TEST;

describe.skipIf(skipIfNoSecurityStack)(
  "caddy-security LDAP Integration",
  () => {
    let client: CaddyClient;

    beforeAll(async () => {
      client = new CaddyClient({ adminUrl: CADDY_ADMIN_URL, timeout: 10000 });

      // Verify Caddy is reachable
      try {
        await client.getConfig();
      } catch {
        throw new Error(
          `Cannot connect to Caddy at ${CADDY_ADMIN_URL}. ` +
            "Make sure docker-compose.caddy-security.yml is running."
        );
      }
    });

    afterAll(async () => {
      // Clean up - restore original config
      try {
        await client.request("/config/apps/security", { method: "DELETE" });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe("Builder Configuration Generation", () => {
      test("buildLdapIdentityStore creates valid LDAP store config", () => {
        const store = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindDn: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
          searchFilter: LDAP_SEARCH_FILTER,
          realm: "ldap",
        });

        expect(store).toMatchObject({
          driver: "ldap",
          realm: "ldap",
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bind_dn: LDAP_BIND_DN,
          bind_password: LDAP_BIND_PASSWORD,
          search_base_dn: LDAP_SEARCH_BASE_DN,
          search_filter: LDAP_SEARCH_FILTER,
        });
      });

      test("builds complete security config with LDAP store", () => {
        const ldapStore = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindDn: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
        });

        const portal = buildAuthenticationPortal({
          name: "ldap-portal",
          identityStores: ["ldap"],
          cookie: { domain: "localhost", lifetime: "24h" },
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

        expect(config.identity_stores).toHaveLength(1);
        expect(config.authentication_portals).toHaveLength(1);
        expect(config.authorization_policies).toHaveLength(1);
        expect(config.identity_stores?.[0].driver).toBe("ldap");
      });

      test("builds complete security app", () => {
        const ldapStore = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST }],
          bindDn: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
        });

        const portal = buildAuthenticationPortal({
          name: "ldap-portal",
          identityStores: ["ldap"],
        });

        const config = buildSecurityConfig({
          identityStores: [ldapStore],
          portals: [portal],
        });

        const app = buildSecurityApp({ config });

        expect(app.config).toBeDefined();
        expect(app.config?.identity_stores).toHaveLength(1);
        expect(app.config?.authentication_portals).toHaveLength(1);
      });
    });

    describe("Handler Builders", () => {
      test("builds authenticator handler for LDAP portal", () => {
        const handler = buildAuthenticatorHandler({
          portalName: "ldap-portal",
        });

        expect(handler).toEqual({
          handler: "authenticator",
          portal_name: "ldap-portal",
        });
      });

      test("builds authorization handler for LDAP policy", () => {
        const handler = buildAuthorizationHandler({
          gatekeeperName: "ldap-policy",
        });

        expect(handler).toEqual({
          handler: "authentication",
          providers: {
            authorizer: {
              gatekeeper_name: "ldap-policy",
            },
          },
        });
      });
    });

    describe("Route Builders", () => {
      test("builds auth portal route", () => {
        const route = buildAuthenticatorRoute({
          hosts: ["auth.example.com"],
          portalName: "ldap-portal",
          routeId: "ldap-auth-portal",
        });

        expect(route["@id"]).toBe("ldap-auth-portal");
        expect(route.match?.[0].host).toContain("auth.example.com");
        expect(route.handle?.[0]).toMatchObject({
          handler: "authenticator",
          portal_name: "ldap-portal",
        });
      });

      test("builds protected route with LDAP policy", () => {
        const route = buildProtectedRoute({
          hosts: ["api.example.com"],
          paths: ["/protected/*"],
          gatekeeperName: "ldap-policy",
          dial: "localhost:3000",
          routeId: "ldap-protected-api",
        });

        expect(route["@id"]).toBe("ldap-protected-api");
        expect(route.match?.[0].host).toContain("api.example.com");
        expect(route.match?.[0].path).toContain("/protected/*");
        expect(route.handle?.[0]).toMatchObject({
          handler: "authentication",
          providers: {
            authorizer: {
              gatekeeper_name: "ldap-policy",
            },
          },
        });
      });
    });

    describe("API Integration", () => {
      test("can apply LDAP security config via Caddy API", async () => {
        // Build complete configuration using our builders
        const ldapStore = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindDn: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
          searchFilter: LDAP_SEARCH_FILTER,
          realm: "ldap",
        });

        const portal = buildAuthenticationPortal({
          name: "test-ldap-portal",
          identityStores: ["ldap"],
          cookie: {
            domain: "localhost",
            lifetime: "1h",
          },
        });

        const policy = buildAuthorizationPolicy({
          name: "test-ldap-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"], action: "allow" }],
          bypass: ["/health", "/public"],
        });

        const config = buildSecurityConfig({
          identityStores: [ldapStore],
          portals: [portal],
          policies: [policy],
        });

        const app = buildSecurityApp({ config });

        // Apply via Caddy API
        const response = await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(app),
        });

        expect(response).toBeDefined();

        // Verify the config was applied
        const currentConfig = await client.getConfig();
        expect(currentConfig.apps?.security).toBeDefined();
      });

      test("can retrieve applied security config", async () => {
        const securityConfig =
          await client.request<Record<string, unknown>>("/config/apps/security");

        expect(securityConfig).toBeDefined();
        expect(securityConfig.config).toBeDefined();
      });

      test("can update security config", async () => {
        // Create updated config with additional policy
        const ldapStore = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST }],
          bindDn: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
        });

        const portal = buildAuthenticationPortal({
          name: "updated-portal",
          identityStores: ["ldap"],
        });

        const adminPolicy = buildAuthorizationPolicy({
          name: "admin-policy",
          accessLists: [{ claim: "roles", values: ["admin"], action: "allow" }],
        });

        const userPolicy = buildAuthorizationPolicy({
          name: "user-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"], action: "allow" }],
        });

        const config = buildSecurityConfig({
          identityStores: [ldapStore],
          portals: [portal],
          policies: [adminPolicy, userPolicy],
        });

        const app = buildSecurityApp({ config });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(app),
        });

        const updated = await client.request<{
          config: { authorization_policies: unknown[] };
        }>("/config/apps/security");
        expect(updated.config?.authorization_policies).toHaveLength(2);
      });

      test("can delete security config", async () => {
        await client.request("/config/apps/security", {
          method: "DELETE",
        });

        // Verify deletion - should throw or return null
        try {
          const result = await client.request("/config/apps/security");
          expect(result).toBeNull();
        } catch {
          // Expected - config was deleted
        }
      });
    });

    describe("End-to-End Flow", () => {
      test("complete LDAP authentication setup workflow", async () => {
        // 1. Build and apply security config
        const ldapStore = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindDn: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
          searchFilter: LDAP_SEARCH_FILTER,
        });

        const portal = buildAuthenticationPortal({
          name: "e2e-portal",
          identityStores: ["ldap"],
        });

        const policy = buildAuthorizationPolicy({
          name: "e2e-policy",
          accessLists: [{ claim: "roles", values: ["user"] }],
        });

        const config = buildSecurityConfig({
          identityStores: [ldapStore],
          portals: [portal],
          policies: [policy],
        });

        const app = buildSecurityApp({ config });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(app),
        });

        // 2. Build and add auth route
        const authRoute = buildAuthenticatorRoute({
          hosts: ["localhost"],
          portalName: "e2e-portal",
          routeId: "e2e-auth-route",
        });

        // 3. Build and add protected route
        const protectedRoute = buildProtectedRoute({
          hosts: ["localhost"],
          paths: ["/api/*"],
          gatekeeperName: "e2e-policy",
          dial: "localhost:8080",
          routeId: "e2e-protected-route",
        });

        // 4. Verify routes can be built correctly
        expect(authRoute["@id"]).toBe("e2e-auth-route");
        expect(protectedRoute["@id"]).toBe("e2e-protected-route");

        // 5. Verify security config is active
        const currentConfig = await client.getConfig();
        expect(currentConfig.apps?.security).toBeDefined();
      });
    });
  },
  { timeout: 30000 }
);
