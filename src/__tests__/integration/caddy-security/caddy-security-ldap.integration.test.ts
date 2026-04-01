/**
 * Integration tests for caddy-security with LDAP identity store
 *
 * These tests validate that our builder API correctly configures caddy-security
 * for LDAP authentication via the Caddy Admin API.
 *
 * IMPORTANT: These tests use an ADDITIVE config strategy:
 * - They ADD new identity stores/portals/policies alongside existing ones
 * - They CLEAN UP only what they added
 * - They work WITH the static Caddyfile config, not against it
 *
 * Requirements:
 * - Caddy with caddy-security plugin running (docker-compose.caddy-security.yml)
 * - OpenLDAP running (docker-compose.caddy-security-ldap.yml)
 *
 * Run with: CADDY_SECURITY_TEST=1 npm run test:integration:caddy-security
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
import {
  addSecurityConfig,
  removeTestAdditions,
  getServerName,
  type TestAdditions,
  type IdentityStore,
  type AuthorizationPolicy,
} from "./test-utils.js";

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
    let serverName: string;

    beforeAll(async () => {
      client = new CaddyClient({ adminUrl: CADDY_ADMIN_URL, timeout: 10000 });

      // Verify Caddy is reachable
      try {
        await client.getConfig();
        const name = await getServerName(client);
        if (!name) {
          throw new Error("No HTTP server found in Caddy config");
        }
        serverName = name;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : "Unknown";
        throw new Error(
          `Cannot connect to Caddy at ${CADDY_ADMIN_URL}. ` +
            `Error: ${errorName}: ${errorMsg}. ` +
            "Make sure docker-compose.caddy-security.yml is running."
        );
      }
    });

    describe("Builder Configuration Generation", () => {
      test("buildLdapIdentityStore creates valid LDAP store config", () => {
        const store = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindUsername: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
          searchUserFilter: LDAP_SEARCH_FILTER,
          realm: "ldap",
        });

        // Builder uses wrapper structure: { name, kind, params }
        expect(store).toMatchObject({
          name: "ldapdb",
          kind: "ldap",
          params: {
            realm: "ldap",
            servers: [{ address: `ldap://${LDAP_HOST}`, port: LDAP_PORT }],
            bind_username: LDAP_BIND_DN,
            bind_password: LDAP_BIND_PASSWORD,
            search_base_dn: LDAP_SEARCH_BASE_DN,
            search_user_filter: "(uid=%s)", // Builder auto-converts {username} to %s for admin API
            groups: [{ dn: LDAP_SEARCH_BASE_DN, roles: ["authp/user"] }], // Default group uses searchBaseDn
          },
        });
      });

      test("builds complete security config with LDAP store", () => {
        const ldapStore = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindUsername: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
        });

        const portal = buildAuthenticationPortal({
          name: "ldap-portal",
          identityStores: ["ldapdb"],
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
        // Identity stores use kind field, not driver
        expect(config.identity_stores?.[0].kind).toBe("ldap");
      });

      test("builds complete security app", () => {
        const ldapStore = buildLdapIdentityStore({
          servers: [{ address: LDAP_HOST }],
          bindUsername: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
        });

        const portal = buildAuthenticationPortal({
          name: "ldap-portal",
          identityStores: ["ldapdb"],
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

    /**
     * API Integration Tests
     *
     * These tests verify the LDAP builder API creates correct configurations
     * and can add LDAP stores to existing security config.
     */
    describe("API Integration", () => {
      // Track additions for cleanup
      const testAdditions: TestAdditions = {
        identityStores: [],
        policies: [],
        routeIds: [],
      };

      afterAll(async () => {
        // Clean up test additions
        await removeTestAdditions(client, serverName, testAdditions);
      });

      test("can add LDAP identity store to existing security config", async () => {
        const ldapStore = buildLdapIdentityStore({
          name: "ldap-api-test-store",
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindUsername: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
          searchUserFilter: LDAP_SEARCH_FILTER,
          realm: "ldap-api-test",
        });

        // Track for cleanup
        testAdditions.identityStores!.push(ldapStore as unknown as IdentityStore);

        // Add to existing security config
        await addSecurityConfig(client, {
          identityStores: [ldapStore as unknown as IdentityStore],
        });

        // Verify the store was added
        const response = await client.request("/config/apps/security/config");
        const config = (await response.json()) as { identity_stores?: { name: string }[] };

        const storeFound = config.identity_stores?.find((s) => s.name === "ldap-api-test-store");
        expect(storeFound).toBeDefined();
      });

      test("can retrieve applied security config", async () => {
        // Retrieve security config
        const response = await client.request("/config/apps/security");
        const securityConfig = (await response.json()) as Record<string, unknown>;

        expect(securityConfig).toBeDefined();
        expect(securityConfig.config).toBeDefined();
      });

      test("can add authorization policy alongside existing ones", async () => {
        const testPolicy = buildAuthorizationPolicy({
          name: "ldap-api-test-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"], action: "allow" }],
          bypass: ["/health", "/public"],
        });

        // Track for cleanup
        testAdditions.policies!.push(testPolicy as unknown as AuthorizationPolicy);

        await addSecurityConfig(client, {
          policies: [testPolicy as unknown as AuthorizationPolicy],
        });

        // Verify policy was added
        const response = await client.request("/config/apps/security/config");
        const config = (await response.json()) as { authorization_policies?: { name: string }[] };

        const policyFound = config.authorization_policies?.find(
          (p) => p.name === "ldap-api-test-policy"
        );
        expect(policyFound).toBeDefined();
      });

      test("security config persists across API calls", async () => {
        // Verify previously added items still exist
        const response = await client.request("/config/apps/security/config");
        const config = (await response.json()) as {
          identity_stores?: { name: string }[];
          authorization_policies?: { name: string }[];
        };

        // Check if our test items still exist
        const storeExists = config.identity_stores?.some((s) => s.name === "ldap-api-test-store");
        const policyExists = config.authorization_policies?.some(
          (p) => p.name === "ldap-api-test-policy"
        );

        expect(storeExists).toBe(true);
        expect(policyExists).toBe(true);
      });
    });

    /**
     * End-to-End Flow Tests
     *
     * These tests verify the complete LDAP authentication workflow
     * by building all required components and testing route creation.
     */
    describe("End-to-End Flow", () => {
      // Track additions for cleanup
      const testAdditions: TestAdditions = {
        identityStores: [],
        policies: [],
        routeIds: [],
      };

      afterAll(async () => {
        // Clean up test additions
        await removeTestAdditions(client, serverName, testAdditions);
      });

      test("complete LDAP authentication setup workflow", async () => {
        // 1. Build LDAP identity store
        const ldapStore = buildLdapIdentityStore({
          name: "ldap-e2e-store",
          servers: [{ address: LDAP_HOST, port: LDAP_PORT }],
          bindUsername: LDAP_BIND_DN,
          bindPassword: LDAP_BIND_PASSWORD,
          searchBaseDn: LDAP_SEARCH_BASE_DN,
          searchUserFilter: LDAP_SEARCH_FILTER,
          realm: "ldap-e2e",
        });

        // 2. Build authorization policy
        const policy = buildAuthorizationPolicy({
          name: "ldap-e2e-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"], action: "allow" }],
        });

        // Track for cleanup
        testAdditions.identityStores!.push(ldapStore as unknown as IdentityStore);
        testAdditions.policies!.push(policy as unknown as AuthorizationPolicy);

        // 3. Add to existing security config
        await addSecurityConfig(client, {
          identityStores: [ldapStore as unknown as IdentityStore],
          policies: [policy as unknown as AuthorizationPolicy],
        });

        // 4. Verify config was applied
        const response = await client.request("/config/apps/security/config");
        const config = (await response.json()) as {
          identity_stores?: { name: string }[];
          authorization_policies?: { name: string }[];
        };

        expect(config.identity_stores?.find((s) => s.name === "ldap-e2e-store")).toBeDefined();
        expect(
          config.authorization_policies?.find((p) => p.name === "ldap-e2e-policy")
        ).toBeDefined();

        // 5. Verify route builders work correctly
        const protectedRoute = buildProtectedRoute({
          hosts: ["localhost"],
          paths: ["/ldap-e2e-test/*"],
          gatekeeperName: "ldap-e2e-policy",
          dial: "localhost:8080",
          routeId: "ldap-e2e-protected-route",
        });

        expect(protectedRoute["@id"]).toBe("ldap-e2e-protected-route");
        expect(protectedRoute.handle?.[0]).toMatchObject({
          handler: "authentication",
          providers: {
            authorizer: { gatekeeper_name: "ldap-e2e-policy" },
          },
        });
      });

      test("LDAP store and policy are retrievable after addition", async () => {
        // Verify items added in previous test are still there
        const response = await client.request("/config/apps/security/config");
        const config = (await response.json()) as {
          identity_stores?: { name: string; kind: string }[];
          authorization_policies?: { name: string }[];
        };

        const ldapStore = config.identity_stores?.find((s) => s.name === "ldap-e2e-store");
        expect(ldapStore).toBeDefined();
        expect(ldapStore?.kind).toBe("ldap");

        const policy = config.authorization_policies?.find((p) => p.name === "ldap-e2e-policy");
        expect(policy).toBeDefined();
      });
    });
  },
  { timeout: 30000 }
);
