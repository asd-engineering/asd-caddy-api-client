/**
 * Phase 1: Quick Win Tests - Config Generation (No Docker)
 *
 * These tests validate that caddy-security configuration objects
 * can be generated correctly without running any external services.
 */
import { describe, test, expect } from "vitest";
import {
  buildAuthenticatorHandler,
  buildAuthorizationHandler,
  buildAuthenticatorRoute,
  buildProtectedRoute,
} from "../plugins/caddy-security/builders.js";

// Import generated types for type safety
import type { PortalConfig } from "../generated/plugins/authcrunch-authn.js";
import type { PolicyConfig } from "../generated/plugins/authcrunch-authz.js";
import type { IdentityStoreConfig } from "../generated/plugins/authcrunch-ids.js";
import type { Config as OAuthConfig } from "../generated/plugins/authcrunch-oauth.js";
import type { Config as SamlConfig } from "../generated/plugins/authcrunch-saml.js";
import type { CryptoKeyConfig } from "../generated/plugins/authcrunch-kms.js";
import type { RuleConfiguration } from "../generated/plugins/authcrunch-acl.js";

describe("Phase 1: caddy-security Config Generation", () => {
  // ============================================================================
  // Handler Builder Tests
  // ============================================================================

  describe("Handler Builders", () => {
    test("buildAuthenticatorHandler creates valid portal handler", () => {
      const handler = buildAuthenticatorHandler({
        portalName: "myportal",
      });

      expect(handler).toEqual({
        handler: "authenticator",
        portal_name: "myportal",
      });
    });

    test("buildAuthenticatorHandler with route matcher", () => {
      const handler = buildAuthenticatorHandler({
        portalName: "myportal",
        routeMatcher: "/auth/*",
      });

      expect(handler).toEqual({
        handler: "authenticator",
        portal_name: "myportal",
        route_matcher: "/auth/*",
      });
    });

    test("buildAuthorizationHandler creates valid authorization handler", () => {
      const handler = buildAuthorizationHandler({
        gatekeeperName: "mygatekeeper",
      });

      expect(handler).toEqual({
        handler: "authentication",
        providers: {
          authorizer: {
            gatekeeper_name: "mygatekeeper",
          },
        },
      });
    });

    test("buildAuthorizationHandler with route matcher", () => {
      const handler = buildAuthorizationHandler({
        gatekeeperName: "mygatekeeper",
        routeMatcher: "/api/*",
      });

      expect(handler).toEqual({
        handler: "authentication",
        providers: {
          authorizer: {
            gatekeeper_name: "mygatekeeper",
            route_matcher: "/api/*",
          },
        },
      });
    });
  });

  // ============================================================================
  // Route Builder Tests
  // ============================================================================

  describe("Route Builders", () => {
    test("buildAuthenticatorRoute creates complete auth portal route", () => {
      const route = buildAuthenticatorRoute({
        hosts: ["auth.example.com"],
        portalName: "myportal",
        routeId: "auth-portal",
      });

      expect(route).toMatchObject({
        "@id": "auth-portal",
        match: [{ host: ["auth.example.com"] }],
        handle: [
          {
            handler: "authenticator",
            portal_name: "myportal",
          },
        ],
        terminal: true,
        priority: 10,
      });
    });

    test("buildProtectedRoute creates complete protected route", () => {
      const route = buildProtectedRoute({
        hosts: ["api.example.com"],
        paths: ["/admin/*"],
        gatekeeperName: "admin-policy",
        dial: "localhost:3000",
        routeId: "protected-admin",
      });

      expect(route).toMatchObject({
        "@id": "protected-admin",
        match: [{ host: ["api.example.com"], path: ["/admin/*"] }],
        handle: [
          {
            handler: "authentication",
            providers: {
              authorizer: {
                gatekeeper_name: "admin-policy",
              },
            },
          },
          {
            handler: "reverse_proxy",
            upstreams: [{ dial: "localhost:3000" }],
          },
        ],
        terminal: true,
        priority: 50,
      });
    });
  });

  // ============================================================================
  // Identity Store Config Tests
  // ============================================================================

  describe("Identity Store Configs", () => {
    test("local identity store config structure", () => {
      const localStore: IdentityStoreConfig = {
        name: "local_users",
        kind: "local",
        params: {
          realm: "local",
          path: "assets/conf/users.json",
        },
      };

      expect(localStore.name).toBe("local_users");
      expect(localStore.kind).toBe("local");
      expect(localStore.params).toBeDefined();
    });

    test("ldap identity store config structure", () => {
      const ldapStore: IdentityStoreConfig = {
        name: "ldap_users",
        kind: "ldap",
        params: {
          realm: "ldap",
          servers: [
            {
              addr: "ldap://ldap.example.com:389",
              bind_dn: "cn=admin,dc=example,dc=com",
              bind_password: "secret",
            },
          ],
          base_dn: "ou=users,dc=example,dc=com",
          search_filter: "(uid=%s)",
        },
      };

      expect(ldapStore.kind).toBe("ldap");
      expect(ldapStore.params?.servers).toHaveLength(1);
    });
  });

  // ============================================================================
  // Identity Provider Config Tests
  // ============================================================================

  describe("Identity Provider Configs", () => {
    test("generic OAuth provider config structure", () => {
      const oauthConfig: OAuthConfig = {
        name: "google",
        driver: "google",
        realm: "google",
        client_id: "xxx.apps.googleusercontent.com",
        client_secret: "xxx",
        scopes: ["openid", "email", "profile"],
      };

      expect(oauthConfig.driver).toBe("google");
      expect(oauthConfig.scopes).toContain("openid");
    });

    test("keycloak OAuth provider config structure", () => {
      const keycloakConfig: OAuthConfig = {
        name: "keycloak",
        driver: "generic",
        realm: "keycloak",
        client_id: "caddy-app",
        client_secret: "test-secret",
        base_auth_url: "http://keycloak:8080/realms/test-realm",
        scopes: ["openid", "email", "profile"],
        metadata_discovery_disabled: false,
      };

      expect(keycloakConfig.driver).toBe("generic");
      expect(keycloakConfig.base_auth_url).toContain("keycloak");
    });

    test("github OAuth provider config structure", () => {
      const githubConfig: OAuthConfig = {
        name: "github",
        driver: "github",
        realm: "github",
        client_id: "xxx",
        client_secret: "xxx",
        scopes: ["read:user", "user:email"],
      };

      expect(githubConfig.driver).toBe("github");
    });

    test("azure OAuth provider config structure", () => {
      const azureConfig: OAuthConfig = {
        name: "azure",
        driver: "azure",
        realm: "azure",
        client_id: "xxx",
        client_secret: "xxx",
        tenant_id: "xxx-xxx-xxx",
        scopes: ["openid", "email", "profile"],
      };

      expect(azureConfig.driver).toBe("azure");
      expect(azureConfig.tenant_id).toBeDefined();
    });

    test("SAML provider config structure", () => {
      const samlConfig: SamlConfig = {
        name: "azure-saml",
        driver: "azure",
        realm: "azure",
        entity_id: "urn:caddy:security",
        idp_metadata_location:
          "https://login.microsoftonline.com/xxx/federationmetadata/2007-06/federationmetadata.xml",
        acs_urls: ["https://auth.example.com/saml/acs"],
      };

      expect(samlConfig.driver).toBe("azure");
      expect(samlConfig.entity_id).toBeDefined();
    });
  });

  // ============================================================================
  // Portal Config Tests
  // ============================================================================

  describe("Portal Configs", () => {
    test("minimal portal config", () => {
      const portal: PortalConfig = {
        name: "myportal",
        identity_stores: ["local_users"],
      };

      expect(portal.name).toBe("myportal");
      expect(portal.identity_stores).toContain("local_users");
    });

    test("portal with OAuth providers", () => {
      const portal: PortalConfig = {
        name: "myportal",
        identity_stores: ["local_users"],
        identity_providers: ["google", "github"],
      };

      expect(portal.identity_providers).toHaveLength(2);
    });

    test("portal with full configuration", () => {
      const portal: PortalConfig = {
        name: "myportal",
        identity_stores: ["local_users"],
        identity_providers: ["keycloak"],
        cookie_config: {
          domain: "example.com",
          path: "/",
          lifetime: 86400,
        },
        token_validator_options: {
          validate_bearer_header: true,
        },
        token_grantor_options: {
          token_lifetime: 3600,
        },
        api: {
          profile_enabled: true,
          admin_enabled: false,
        },
      };

      expect(portal.cookie_config?.domain).toBe("example.com");
      expect(portal.api?.profile_enabled).toBe(true);
    });
  });

  // ============================================================================
  // Authorization Policy Config Tests
  // ============================================================================

  describe("Authorization Policy Configs", () => {
    test("basic authorization policy config", () => {
      const policy: PolicyConfig = {
        name: "mypolicy",
        auth_url_path: "/auth",
      };

      expect(policy.name).toBe("mypolicy");
    });

    test("policy with ACL rules", () => {
      const aclRule: RuleConfiguration = {
        conditions: ["match roles admin"],
        action: "allow",
      };

      const policy: PolicyConfig = {
        name: "admin-policy",
        auth_url_path: "/auth",
        access_list_configs: [aclRule],
      };

      expect(policy.access_list_configs).toHaveLength(1);
    });
  });

  // ============================================================================
  // Crypto Key Config Tests
  // ============================================================================

  describe("Crypto Key Configs", () => {
    test("auto-generated key config", () => {
      const keyConfig: CryptoKeyConfig = {
        id: "0",
        usage: "sign-verify",
        source: "config",
        algorithm: "hmac",
      };

      expect(keyConfig.algorithm).toBe("hmac");
    });

    test("RSA key config", () => {
      const keyConfig: CryptoKeyConfig = {
        id: "rsa-key",
        usage: "sign-verify",
        source: "config",
        algorithm: "rs256",
      };

      expect(keyConfig.algorithm).toBe("rs256");
    });
  });

  // ============================================================================
  // Full Security App Config Tests
  // ============================================================================

  describe("Full Security App Config", () => {
    test("builds complete security app configuration", () => {
      // This represents what would go in caddy's security app config
      const securityAppConfig = {
        authentication_portals: [
          {
            name: "myportal",
            identity_stores: ["local_users"],
            identity_providers: ["google"],
            cookie_config: {
              domain: "example.com",
            },
          },
        ],
        authorization_policies: [
          {
            name: "mypolicy",
            auth_url_path: "/auth",
            access_list_configs: [
              {
                conditions: ["match roles user admin"],
                action: "allow",
              },
            ],
          },
        ],
        local_identity_stores: [
          {
            name: "local_users",
            realm: "local",
            path: "users.json",
          },
        ],
        oauth_identity_providers: [
          {
            name: "google",
            driver: "google",
            realm: "google",
            client_id: "xxx",
            client_secret: "xxx",
            scopes: ["openid", "email", "profile"],
          },
        ],
      };

      expect(securityAppConfig.authentication_portals).toHaveLength(1);
      expect(securityAppConfig.authorization_policies).toHaveLength(1);
      expect(securityAppConfig.local_identity_stores).toHaveLength(1);
      expect(securityAppConfig.oauth_identity_providers).toHaveLength(1);
    });
  });
});

// ============================================================================
// Type-safe Auth Type Arrays (as requested)
// ============================================================================

/**
 * All supported identity store types
 */
export const IDENTITY_STORE_TYPES = ["local", "ldap"] as const;
export type IdentityStoreType = (typeof IDENTITY_STORE_TYPES)[number];

/**
 * All supported identity provider types
 */
export const IDENTITY_PROVIDER_TYPES = ["oauth", "saml"] as const;
export type IdentityProviderType = (typeof IDENTITY_PROVIDER_TYPES)[number];

/**
 * All supported OAuth drivers
 */
export const OAUTH_DRIVERS = [
  "google",
  "github",
  "gitlab",
  "facebook",
  "azure",
  "okta",
  "cognito",
  "auth0",
  "linkedin",
  "discord",
  "bitbucket",
  "nextcloud",
  "generic",
] as const;
export type OAuthDriver = (typeof OAUTH_DRIVERS)[number];

/**
 * All supported SAML drivers
 */
export const SAML_DRIVERS = ["azure", "generic"] as const;
export type SamlDriver = (typeof SAML_DRIVERS)[number];

/**
 * All supported SSO provider types
 */
export const SSO_PROVIDER_TYPES = ["aws"] as const;
export type SsoProviderType = (typeof SSO_PROVIDER_TYPES)[number];

/**
 * Combined authentication type registry
 */
export const AUTH_TYPE_REGISTRY = {
  identityStores: IDENTITY_STORE_TYPES,
  identityProviders: IDENTITY_PROVIDER_TYPES,
  oauthDrivers: OAUTH_DRIVERS,
  samlDrivers: SAML_DRIVERS,
  ssoProviders: SSO_PROVIDER_TYPES,
} as const;
