/**
 * Integration tests for caddy-security with OIDC identity provider
 *
 * These tests validate that our builder API correctly configures caddy-security
 * for OIDC authentication (Keycloak) via the Caddy Admin API.
 *
 * Requirements:
 * - Caddy with caddy-security plugin running (docker-compose.caddy-security.yml)
 * - Keycloak running (docker-compose.keycloak.yml)
 *
 * Run with: npm run test:integration:caddy-security-oidc
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
  buildSecurityApp,
  buildAuthenticatorHandler,
  buildAuthorizationHandler,
  buildAuthenticatorRoute,
  buildProtectedRoute,
} from "../../../plugins/caddy-security/builders.js";

// Test configuration
const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2020";
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8081";
const KEYCLOAK_REALM = "test-realm";
const KEYCLOAK_CLIENT_ID = "caddy-app";
const KEYCLOAK_CLIENT_SECRET = "test-client-secret";

// Skip if not in CI or docker environment
const skipIfNoDocker = !process.env.CI && !process.env.DOCKER_TEST;

describe.skipIf(skipIfNoDocker)(
  "caddy-security OIDC Integration",
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
      test("buildOidcProvider creates valid OIDC provider config", () => {
        const provider = buildOidcProvider({
          provider: "keycloak",
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          discoveryUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile", "roles"],
        });

        expect(provider).toMatchObject({
          driver: "oidc",
          realm: "keycloak",
          provider: "keycloak",
          client_id: KEYCLOAK_CLIENT_ID,
          client_secret: KEYCLOAK_CLIENT_SECRET,
          discovery_url: expect.stringContaining(".well-known/openid-configuration"),
          scopes: ["openid", "email", "profile", "roles"],
        });
      });

      test("buildOAuth2Provider creates valid OAuth2 provider config", () => {
        const provider = buildOAuth2Provider({
          provider: "github",
          clientId: "github-client-id",
          clientSecret: "github-client-secret",
          scopes: ["user:email", "read:user"],
        });

        expect(provider).toMatchObject({
          driver: "oauth2",
          realm: "github",
          provider: "github",
          client_id: "github-client-id",
          client_secret: "github-client-secret",
          scopes: ["user:email", "read:user"],
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
          discoveryUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
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
          discoveryUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
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

        // Verify providers have correct drivers
        expect(config.identity_providers?.[0].driver).toBe("oidc");
        expect(config.identity_providers?.[1].driver).toBe("oauth2");
        expect(config.identity_providers?.[2].driver).toBe("oauth2");
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
          priority: 10,
        });

        expect(route["@id"]).toBe("oidc-auth-route");
        expect(route.priority).toBe(10);
        expect(route.terminal).toBe(true);
      });

      test("builds protected route with OIDC policy", () => {
        const route = buildProtectedRoute({
          hosts: ["api.example.com"],
          paths: ["/api/v1/*", "/api/v2/*"],
          gatekeeperName: "oidc-policy",
          dial: "localhost:3000",
          routeId: "oidc-protected-api",
          priority: 50,
        });

        expect(route["@id"]).toBe("oidc-protected-api");
        expect(route.match?.[0].path).toHaveLength(2);
        expect(route.priority).toBe(50);
      });
    });

    describe("API Integration", () => {
      test("can apply OIDC security config via Caddy API", async () => {
        const oidcProvider = buildOidcProvider({
          provider: "keycloak",
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          discoveryUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile"],
        });

        const portal = buildAuthenticationPortal({
          name: "oidc-test-portal",
          identityProviders: ["keycloak"],
          cookie: {
            domain: "localhost",
            lifetime: "1h",
          },
        });

        const policy = buildAuthorizationPolicy({
          name: "oidc-test-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"], action: "allow" }],
        });

        const config = buildSecurityConfig({
          identityProviders: [oidcProvider],
          portals: [portal],
          policies: [policy],
        });

        const app = buildSecurityApp({ config });

        const response = await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(app),
        });

        expect(response).toBeDefined();

        // Verify the config was applied
        const currentConfig = await client.getConfig();
        expect(currentConfig.apps?.security).toBeDefined();
      });

      test("can update OIDC provider config", async () => {
        const updatedProvider = buildOidcProvider({
          provider: "keycloak",
          clientId: "updated-client-id",
          clientSecret: "updated-client-secret",
          discoveryUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile", "roles", "groups"],
        });

        const portal = buildAuthenticationPortal({
          name: "updated-oidc-portal",
          identityProviders: ["keycloak"],
        });

        const config = buildSecurityConfig({
          identityProviders: [updatedProvider],
          portals: [portal],
        });

        const app = buildSecurityApp({ config });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(app),
        });

        const updated = await client.request<{
          config: { identity_providers: { scopes: string[] }[] };
        }>("/config/apps/security");

        expect(updated.config?.identity_providers?.[0].scopes).toContain("groups");
      });
    });

    describe("End-to-End Flow", () => {
      test("complete OIDC authentication setup workflow", async () => {
        // 1. Build local identity store (for fallback)
        const localStore = buildLocalIdentityStore({
          path: "/data/users.json",
          realm: "local",
        });

        // 2. Build OIDC provider
        const oidcProvider = buildOidcProvider({
          provider: "keycloak",
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          discoveryUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
        });

        // 3. Build portal with both local and OIDC
        const portal = buildAuthenticationPortal({
          name: "e2e-oidc-portal",
          identityStores: ["local"],
          identityProviders: ["keycloak"],
          ui: { theme: "basic" },
          cookie: { domain: "localhost", lifetime: "8h" },
        });

        // 4. Build policies for different access levels
        const userPolicy = buildAuthorizationPolicy({
          name: "user-policy",
          accessLists: [{ claim: "roles", values: ["user", "admin"], action: "allow" }],
          bypass: ["/health", "/public"],
        });

        const adminPolicy = buildAuthorizationPolicy({
          name: "admin-policy",
          accessLists: [{ claim: "roles", values: ["admin"], action: "allow" }],
        });

        // 5. Build complete security config
        const config = buildSecurityConfig({
          identityStores: [localStore],
          identityProviders: [oidcProvider],
          portals: [portal],
          policies: [userPolicy, adminPolicy],
        });

        const app = buildSecurityApp({ config });

        // 6. Apply via Caddy API
        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(app),
        });

        // 7. Build routes
        const authRoute = buildAuthenticatorRoute({
          hosts: ["localhost"],
          portalName: "e2e-oidc-portal",
          routeId: "oidc-auth-route",
        });

        const userApiRoute = buildProtectedRoute({
          hosts: ["localhost"],
          paths: ["/api/*"],
          gatekeeperName: "user-policy",
          dial: "localhost:8080",
          routeId: "user-api-route",
        });

        const adminApiRoute = buildProtectedRoute({
          hosts: ["localhost"],
          paths: ["/admin/*"],
          gatekeeperName: "admin-policy",
          dial: "localhost:8080",
          routeId: "admin-api-route",
        });

        // 8. Verify all routes were built correctly
        expect(authRoute["@id"]).toBe("oidc-auth-route");
        expect(userApiRoute["@id"]).toBe("user-api-route");
        expect(adminApiRoute["@id"]).toBe("admin-api-route");

        // 9. Verify security config is active
        const currentConfig = await client.getConfig();
        expect(currentConfig.apps?.security).toBeDefined();

        const securityApp = await client.request<{
          config: {
            identity_stores: unknown[];
            identity_providers: unknown[];
            authentication_portals: unknown[];
            authorization_policies: unknown[];
          };
        }>("/config/apps/security");

        expect(securityApp.config?.identity_stores).toHaveLength(1);
        expect(securityApp.config?.identity_providers).toHaveLength(1);
        expect(securityApp.config?.authentication_portals).toHaveLength(1);
        expect(securityApp.config?.authorization_policies).toHaveLength(2);
      });

      test("complete multi-provider setup workflow", async () => {
        // Setup with multiple OAuth/OIDC providers
        const keycloakProvider = buildOidcProvider({
          provider: "keycloak",
          clientId: "keycloak-client",
          clientSecret: "keycloak-secret",
          discoveryUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
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

        const portal = buildAuthenticationPortal({
          name: "multi-provider-portal",
          identityProviders: ["keycloak", "github", "google"],
          ui: {
            theme: "basic",
            logoUrl: "https://example.com/logo.png",
          },
        });

        const config = buildSecurityConfig({
          identityProviders: [keycloakProvider, githubProvider, googleProvider],
          portals: [portal],
          policies: [
            buildAuthorizationPolicy({
              name: "multi-provider-policy",
              accessLists: [{ claim: "sub", values: ["*"], action: "allow" }],
            }),
          ],
        });

        const app = buildSecurityApp({ config });

        await client.request("/config/apps/security", {
          method: "PUT",
          body: JSON.stringify(app),
        });

        const securityConfig = await client.request<{
          config: { identity_providers: unknown[] };
        }>("/config/apps/security");

        expect(securityConfig.config?.identity_providers).toHaveLength(3);
      });
    });
  },
  { timeout: 30000 }
);
