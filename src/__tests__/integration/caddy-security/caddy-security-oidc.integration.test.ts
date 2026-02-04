/**
 * Integration tests for caddy-security with OIDC identity provider
 *
 * These tests validate that our builder API correctly configures caddy-security
 * for OIDC authentication (Keycloak) via the Caddy Admin API.
 *
 * IMPORTANT: These tests use an ADDITIVE config strategy:
 * - They ADD new identity providers alongside existing ones
 * - They CLEAN UP only what they added
 * - They work WITH the static Caddyfile config, not against it
 *
 * Note: OIDC tests require Keycloak to be running AND reachable from Caddy.
 * The docker-compose.keycloak.yml has been updated to use a shared network.
 *
 * Requirements:
 * - Caddy with caddy-security plugin running (docker-compose.caddy-security.yml)
 * - Keycloak running (docker-compose.keycloak.yml)
 *
 * Run with: CADDY_SECURITY_TEST=1 npm run test:integration:caddy-security
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../../caddy/client.js";
import {
  buildOidcProvider,
  buildOAuth2Provider,
  buildLocalIdentityStore,
  buildAuthenticationPortal,
  buildAuthorizationPolicy,
  buildSecurityConfig,
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
  type IdentityProvider,
  type AuthorizationPolicy,
} from "./test-utils.js";

// Test configuration
const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2020";
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8081";
const KEYCLOAK_INTERNAL_URL = process.env.KEYCLOAK_INTERNAL_URL ?? "http://keycloak:8081";
const KEYCLOAK_REALM = "test-realm";
const KEYCLOAK_CLIENT_ID = "caddy-app";
const KEYCLOAK_CLIENT_SECRET = "test-client-secret";

// Skip unless CADDY_SECURITY_TEST is explicitly set (requires caddy-security Docker stack)
const skipIfNoSecurityStack = !process.env.CADDY_SECURITY_TEST;

describe.skipIf(skipIfNoSecurityStack)(
  "caddy-security OIDC Integration",
  () => {
    let client: CaddyClient;
    let serverName: string;
    let keycloakAvailable = false;

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

      // Check if Keycloak is available
      try {
        const response = await fetch(`${KEYCLOAK_URL}/health/ready`, {
          signal: AbortSignal.timeout(3000),
        });
        keycloakAvailable = response.ok;
      } catch {
        keycloakAvailable = false;
        console.log("Keycloak not available - some OIDC tests will be skipped");
      }
    });

    describe("Builder Configuration Generation", () => {
      test("buildOidcProvider creates valid OIDC provider config", () => {
        const provider = buildOidcProvider({
          provider: "keycloak",
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          metadataUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile", "roles"],
        });

        // Builder uses wrapper structure: { name, kind, params }
        expect(provider).toMatchObject({
          name: "keycloak",
          kind: "oauth",
          params: {
            driver: "generic", // OIDC uses generic driver with metadata_url for discovery
            realm: "keycloak",
            client_id: KEYCLOAK_CLIENT_ID,
            client_secret: KEYCLOAK_CLIENT_SECRET,
            metadata_url: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
            scopes: ["openid", "email", "profile", "roles"],
          },
        });
      });

      test("buildOAuth2Provider creates valid OAuth2 provider config", () => {
        const provider = buildOAuth2Provider({
          provider: "github",
          clientId: "github-client-id",
          clientSecret: "github-client-secret",
          scopes: ["user:email", "read:user"],
        });

        // Builder uses wrapper structure: { name, kind, params }
        expect(provider).toMatchObject({
          name: "github",
          kind: "oauth",
          params: {
            driver: "github", // OAuth2 uses provider-specific driver
            realm: "github",
            client_id: "github-client-id",
            client_secret: "github-client-secret",
            scopes: ["user:email", "read:user"],
          },
        });
      });

      test("builds portal with both local and OIDC providers", () => {
        const localStore = buildLocalIdentityStore({
          path: "/data/users.json",
          realm: "local",
        });

        const oidcProvider = buildOidcProvider({
          provider: "keycloak",
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          metadataUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
        });

        const portal = buildAuthenticationPortal({
          name: "hybrid-portal",
          identityStores: ["local"],
          identityProviders: ["keycloak"],
          cookie: { domain: "localhost", lifetime: "24h" },
        });

        expect(portal.identity_stores).toContain("local");
        expect(portal.identity_providers).toContain("keycloak");

        // Verify we can build a complete config
        const config = buildSecurityConfig({
          identityStores: [localStore],
          identityProviders: [oidcProvider],
          portals: [portal],
        });

        expect(config.identity_stores).toHaveLength(1);
        expect(config.identity_providers).toHaveLength(1);
        expect(config.authentication_portals).toHaveLength(1);
      });

      test("builds complete security config with multiple providers", () => {
        const localStore = buildLocalIdentityStore({
          path: "/data/users.json",
        });

        const keycloakProvider = buildOidcProvider({
          provider: "keycloak",
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          metadataUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
        });

        const githubProvider = buildOAuth2Provider({
          provider: "github",
          clientId: "github-client-id",
          clientSecret: "github-client-secret",
        });

        const googleProvider = buildOAuth2Provider({
          provider: "google",
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
        });

        const portal = buildAuthenticationPortal({
          name: "multi-provider-portal",
          identityStores: ["local"],
          identityProviders: ["keycloak", "github", "google"],
          ui: {
            theme: "basic",
            logoUrl: "https://example.com/logo.png",
          },
        });

        const policy = buildAuthorizationPolicy({
          name: "multi-policy",
          accessLists: [
            { claim: "roles", values: ["user", "admin"], action: "allow" },
            { claim: "email", values: ["*@example.com"], action: "allow" },
          ],
          bypass: ["/health", "/public/*"],
        });

        const config = buildSecurityConfig({
          identityStores: [localStore],
          identityProviders: [keycloakProvider, githubProvider, googleProvider],
          portals: [portal],
          policies: [policy],
        });

        expect(config.identity_stores).toHaveLength(1);
        expect(config.identity_providers).toHaveLength(3);
        expect(config.authentication_portals).toHaveLength(1);
        expect(config.authorization_policies).toHaveLength(1);

        // Verify providers have correct drivers (in params wrapper)
        expect(config.identity_providers?.[0].params?.driver).toBe("generic"); // OIDC uses generic
        expect(config.identity_providers?.[1].params?.driver).toBe("github"); // OAuth2 uses provider name
        expect(config.identity_providers?.[2].params?.driver).toBe("google"); // OAuth2 uses provider name
      });
    });

    describe("Handler Builders for OIDC", () => {
      test("builds authenticator handler for OIDC portal", () => {
        const handler = buildAuthenticatorHandler({
          portalName: "oidc-portal",
          routeMatcher: "/auth/*",
        });

        expect(handler).toEqual({
          handler: "authenticator",
          portal_name: "oidc-portal",
          route_matcher: "/auth/*",
        });
      });

      test("builds authorization handler for OIDC policy", () => {
        const handler = buildAuthorizationHandler({
          gatekeeperName: "oidc-policy",
          routeMatcher: "/api/*",
        });

        expect(handler).toEqual({
          handler: "authentication",
          providers: {
            authorizer: {
              gatekeeper_name: "oidc-policy",
              route_matcher: "/api/*",
            },
          },
        });
      });
    });

    describe("Route Builders for OIDC", () => {
      test("builds OIDC auth portal route", () => {
        const route = buildAuthenticatorRoute({
          hosts: ["auth.example.com"],
          portalName: "oidc-portal",
          routeId: "oidc-auth-route",
        });

        expect(route["@id"]).toBe("oidc-auth-route");
        expect(route.terminal).toBe(true);
      });

      test("builds protected route with OIDC policy", () => {
        const route = buildProtectedRoute({
          hosts: ["api.example.com"],
          paths: ["/api/v1/*", "/api/v2/*"],
          gatekeeperName: "oidc-policy",
          dial: "localhost:3000",
          routeId: "oidc-protected-api",
        });

        expect(route["@id"]).toBe("oidc-protected-api");
        expect(route.match?.[0].path).toHaveLength(2);
      });
    });

    /**
     * API Integration Tests
     *
     * These tests verify the OIDC builder API creates correct configurations.
     * Tests that actually apply OIDC config require Keycloak to be reachable
     * from within the Caddy container (shared Docker network).
     */
    describe("API Integration", () => {
      // Track additions for cleanup
      const testAdditions: TestAdditions = {
        identityProviders: [],
        portals: [],
        policies: [],
        routeIds: [],
      };

      afterAll(async () => {
        // Clean up test additions
        await removeTestAdditions(client, serverName, testAdditions);
      });

      test("OIDC provider builder creates valid config structure", () => {
        const oidcProvider = buildOidcProvider({
          provider: "oidc-api-test",
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          metadataUrl: `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile"],
        });

        expect(oidcProvider).toMatchObject({
          name: "oidc-api-test",
          kind: "oauth",
          params: {
            driver: "generic",
            client_id: KEYCLOAK_CLIENT_ID,
            client_secret: KEYCLOAK_CLIENT_SECRET,
            metadata_url: `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
            scopes: ["openid", "email", "profile"],
          },
        });
      });

      // SKIPPED: caddy-security doesn't support RSA-OAEP key algorithm that Keycloak 23.0 uses by default.
      // Error: "invalid jwks key: jwks unsupported key algorithm RSA-OAEP"
      // This is a known limitation. To enable, configure Keycloak to use RS256 instead of RSA-OAEP.
      test.skip("can apply OIDC config when Keycloak is reachable", async () => {
        if (!keycloakAvailable) {
          console.log("Skipping: Keycloak not available");
          return;
        }

        const oidcProvider = buildOidcProvider({
          provider: "oidc-api-test-keycloak",
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          metadataUrl: `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile"],
        });

        // Track for cleanup
        testAdditions.identityProviders!.push(oidcProvider as unknown as IdentityProvider);

        // Add to existing security config
        await addSecurityConfig(client, {
          identityProviders: [oidcProvider as unknown as IdentityProvider],
        });

        // Verify provider was added
        const response = await client.request("/config/apps/security/config");
        const config = (await response.json()) as { identity_providers?: { name: string }[] };

        const providerFound = config.identity_providers?.find(
          (p) => p.name === "oidc-api-test-keycloak"
        );
        expect(providerFound).toBeDefined();
      });

      test("OAuth2 provider builder creates valid config for known providers", () => {
        const githubProvider = buildOAuth2Provider({
          provider: "github",
          clientId: "github-client-id",
          clientSecret: "github-client-secret",
          scopes: ["user:email", "read:user"],
        });

        expect(githubProvider).toMatchObject({
          name: "github",
          kind: "oauth",
          params: {
            driver: "github",
            client_id: "github-client-id",
            client_secret: "github-client-secret",
            scopes: ["user:email", "read:user"],
          },
        });

        const googleProvider = buildOAuth2Provider({
          provider: "google",
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
        });

        expect(googleProvider.params?.driver).toBe("google");
      });
    });

    /**
     * End-to-End Flow Tests
     *
     * These tests verify the complete OIDC authentication workflow.
     * Tests that apply config with OIDC providers require Keycloak
     * to be running and reachable from Caddy.
     */
    describe("End-to-End Flow", () => {
      // Track additions for cleanup
      const testAdditions: TestAdditions = {
        identityProviders: [],
        portals: [],
        policies: [],
        routeIds: [],
      };

      afterAll(async () => {
        // Clean up test additions
        await removeTestAdditions(client, serverName, testAdditions);
      });

      // SKIPPED: caddy-security doesn't support RSA-OAEP key algorithm that Keycloak 23.0 uses by default.
      // Error: "invalid jwks key: jwks unsupported key algorithm RSA-OAEP"
      // This is a known limitation. To enable, configure Keycloak to use RS256 instead of RSA-OAEP.
      test.skip("complete OIDC authentication setup workflow", async () => {
        if (!keycloakAvailable) {
          console.log("Skipping: Keycloak not available");
          return;
        }

        // 1. Build OIDC provider
        const oidcProvider = buildOidcProvider({
          provider: "oidc-e2e-keycloak",
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          metadataUrl: `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
        });

        // 2. Build authorization policy
        const policy = buildAuthorizationPolicy({
          name: "oidc-e2e-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"], action: "allow" }],
        });

        // Track for cleanup
        testAdditions.identityProviders!.push(oidcProvider as unknown as IdentityProvider);
        testAdditions.policies!.push(policy as unknown as AuthorizationPolicy);

        // 3. Add to existing security config
        await addSecurityConfig(client, {
          identityProviders: [oidcProvider as unknown as IdentityProvider],
          policies: [policy as unknown as AuthorizationPolicy],
        });

        // 4. Verify config was applied
        const response = await client.request("/config/apps/security/config");
        const config = (await response.json()) as {
          identity_providers?: { name: string }[];
          authorization_policies?: { name: string }[];
        };

        expect(
          config.identity_providers?.find((p) => p.name === "oidc-e2e-keycloak")
        ).toBeDefined();
        expect(
          config.authorization_policies?.find((p) => p.name === "oidc-e2e-policy")
        ).toBeDefined();

        // 5. Verify route builders work correctly
        const protectedRoute = buildProtectedRoute({
          hosts: ["localhost"],
          paths: ["/oidc-e2e-test/*"],
          gatekeeperName: "oidc-e2e-policy",
          dial: "localhost:8080",
          routeId: "oidc-e2e-protected-route",
        });

        expect(protectedRoute["@id"]).toBe("oidc-e2e-protected-route");
        expect(protectedRoute.handle?.[0]).toMatchObject({
          handler: "authentication",
          providers: {
            authorizer: { gatekeeper_name: "oidc-e2e-policy" },
          },
        });
      });

      test("portal builder supports multiple identity providers", () => {
        // Verify portal can be configured with multiple providers
        const portal = buildAuthenticationPortal({
          name: "multi-provider-test-portal",
          identityStores: ["localdb"],
          identityProviders: ["keycloak", "github", "google"],
          ui: {
            theme: "basic",
            logoUrl: "https://example.com/logo.png",
          },
        });

        expect(portal.identity_stores).toContain("localdb");
        expect(portal.identity_providers).toContain("keycloak");
        expect(portal.identity_providers).toContain("github");
        expect(portal.identity_providers).toContain("google");
        expect(portal.identity_providers).toHaveLength(3);
      });

      test("can build complete multi-provider config structure", () => {
        // Verify we can build the complete config structure (without applying)
        const keycloakProvider = buildOidcProvider({
          provider: "keycloak",
          clientId: "keycloak-client",
          clientSecret: "keycloak-secret",
          metadataUrl: `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
        });

        const githubProvider = buildOAuth2Provider({
          provider: "github",
          clientId: "github-client",
          clientSecret: "github-secret",
          scopes: ["user:email", "read:user"],
        });

        const googleProvider = buildOAuth2Provider({
          provider: "google",
          clientId: "google-client",
          clientSecret: "google-secret",
          scopes: ["openid", "email", "profile"],
        });

        // Verify all providers have correct structure
        expect(keycloakProvider.params?.driver).toBe("generic");
        expect(githubProvider.params?.driver).toBe("github");
        expect(googleProvider.params?.driver).toBe("google");
      });
    });
  },
  { timeout: 30000 }
);
