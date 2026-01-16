/**
 * Builder functions for caddy-security plugin
 *
 * Provides convenient functions for creating caddy-security handler
 * configurations with validation.
 *
 * @see https://github.com/greenpau/caddy-security
 * @see local/plugins/caddy-security/README.md
 */
import { validateOrThrow } from "../../utils/validation.js";
import {
  SecurityAuthenticatorHandlerSchema,
  SecurityAuthorizationHandlerSchema,
  LocalIdentityStoreSchema,
  LdapIdentityStoreSchema,
  OAuth2IdentityProviderSchema,
  OidcIdentityProviderSchema,
  AuthenticationPortalSchema,
  AuthorizationPolicySchema,
  SecurityConfigSchema,
  SecurityAppSchema,
  type SecurityAuthenticatorHandler,
  type SecurityAuthorizationHandler,
  type LocalIdentityStore,
  type LdapIdentityStore,
  type OAuth2IdentityProvider,
  type OidcIdentityProvider,
  type AuthenticationPortal,
  type AuthorizationPolicy,
  type SecurityConfig,
  type SecurityApp,
} from "./schemas.js";
import type { CaddyRoute } from "../../types.js";

// ============================================================================
// Identity Store Builders
// ============================================================================

/**
 * Options for building a local identity store
 */
export interface BuildLocalIdentityStoreOptions {
  /**
   * Path to the JSON file containing user credentials
   */
  path: string;
  /**
   * Realm name for this identity store
   * @default "local"
   */
  realm?: string;
}

/**
 * Build a local identity store configuration
 *
 * Creates a local JSON file-based identity store for user credentials.
 *
 * @param options - Store options
 * @returns Validated local identity store configuration
 *
 * @example
 * ```typescript
 * import { buildLocalIdentityStore } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const store = buildLocalIdentityStore({
 *   path: "/etc/caddy/users.json",
 *   realm: "local",
 * });
 * ```
 */
export function buildLocalIdentityStore(
  options: BuildLocalIdentityStoreOptions
): LocalIdentityStore {
  const store = {
    driver: "local" as const,
    realm: options.realm ?? "local",
    path: options.path,
  };

  return validateOrThrow(LocalIdentityStoreSchema, store, "buildLocalIdentityStore");
}

/**
 * LDAP server configuration
 */
export interface LdapServerConfig {
  /**
   * LDAP server address
   */
  address: string;
  /**
   * LDAP server port
   * @default 389
   */
  port?: number;
}

/**
 * Options for building an LDAP identity store
 */
export interface BuildLdapIdentityStoreOptions {
  /**
   * Realm name for this identity store
   * @default "ldap"
   */
  realm?: string;
  /**
   * LDAP server(s) to connect to
   */
  servers: LdapServerConfig[];
  /**
   * Bind DN for LDAP queries
   * @example "cn=admin,dc=example,dc=com"
   */
  bindDn: string;
  /**
   * Bind password for LDAP authentication
   */
  bindPassword: string;
  /**
   * Base DN for user searches
   * @example "ou=users,dc=example,dc=com"
   */
  searchBaseDn: string;
  /**
   * LDAP search filter template
   * @default "(uid={username})"
   */
  searchFilter?: string;
}

/**
 * Build an LDAP identity store configuration
 *
 * Creates an LDAP-based identity store for user authentication.
 *
 * @param options - Store options
 * @returns Validated LDAP identity store configuration
 *
 * @example
 * ```typescript
 * import { buildLdapIdentityStore } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const store = buildLdapIdentityStore({
 *   servers: [{ address: "ldap.example.com", port: 389 }],
 *   bindDn: "cn=admin,dc=example,dc=com",
 *   bindPassword: "secret",
 *   searchBaseDn: "ou=users,dc=example,dc=com",
 *   searchFilter: "(uid={username})",
 * });
 * ```
 */
export function buildLdapIdentityStore(options: BuildLdapIdentityStoreOptions): LdapIdentityStore {
  const store = {
    driver: "ldap" as const,
    realm: options.realm ?? "ldap",
    servers: options.servers.map((s) => ({
      address: s.address,
      ...(s.port && { port: s.port }),
    })),
    bind_dn: options.bindDn,
    bind_password: options.bindPassword,
    search_base_dn: options.searchBaseDn,
    search_filter: options.searchFilter ?? "(uid={username})",
  };

  return validateOrThrow(LdapIdentityStoreSchema, store, "buildLdapIdentityStore");
}

// ============================================================================
// Identity Provider Builders
// ============================================================================

/**
 * Options for building an OAuth2 identity provider
 */
export interface BuildOAuth2ProviderOptions {
  /**
   * Realm name for this provider
   */
  realm?: string;
  /**
   * Provider name (github, google, facebook, etc.)
   */
  provider: string;
  /**
   * OAuth client ID
   */
  clientId: string;
  /**
   * OAuth client secret
   */
  clientSecret: string;
  /**
   * OAuth scopes to request
   * @default ["openid", "email", "profile"]
   */
  scopes?: string[];
}

/**
 * Build an OAuth2 identity provider configuration
 *
 * @param options - Provider options
 * @returns Validated OAuth2 provider configuration
 *
 * @example
 * ```typescript
 * import { buildOAuth2Provider } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const provider = buildOAuth2Provider({
 *   provider: "github",
 *   clientId: "your-client-id",
 *   clientSecret: "your-client-secret",
 *   scopes: ["user:email", "read:user"],
 * });
 * ```
 */
export function buildOAuth2Provider(options: BuildOAuth2ProviderOptions): OAuth2IdentityProvider {
  const provider = {
    driver: "oauth2" as const,
    realm: options.realm ?? options.provider,
    provider: options.provider,
    client_id: options.clientId,
    client_secret: options.clientSecret,
    scopes: options.scopes ?? ["openid", "email", "profile"],
  };

  return validateOrThrow(OAuth2IdentityProviderSchema, provider, "buildOAuth2Provider");
}

/**
 * Options for building an OIDC identity provider
 */
export interface BuildOidcProviderOptions {
  /**
   * Realm name for this provider
   */
  realm?: string;
  /**
   * OIDC provider name (keycloak, okta, auth0, etc.)
   */
  provider: string;
  /**
   * Client ID
   */
  clientId: string;
  /**
   * Client secret
   */
  clientSecret: string;
  /**
   * OIDC discovery URL (.well-known/openid-configuration)
   * @example "https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration"
   */
  discoveryUrl: string;
  /**
   * Scopes to request
   * @default ["openid", "email", "profile"]
   */
  scopes?: string[];
}

/**
 * Build an OIDC identity provider configuration
 *
 * @param options - Provider options
 * @returns Validated OIDC provider configuration
 *
 * @example
 * ```typescript
 * import { buildOidcProvider } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const provider = buildOidcProvider({
 *   provider: "keycloak",
 *   clientId: "my-app",
 *   clientSecret: "secret",
 *   discoveryUrl: "https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration",
 * });
 * ```
 */
export function buildOidcProvider(options: BuildOidcProviderOptions): OidcIdentityProvider {
  const provider = {
    driver: "oidc" as const,
    realm: options.realm ?? options.provider,
    provider: options.provider,
    client_id: options.clientId,
    client_secret: options.clientSecret,
    discovery_url: options.discoveryUrl,
    scopes: options.scopes ?? ["openid", "email", "profile"],
  };

  return validateOrThrow(OidcIdentityProviderSchema, provider, "buildOidcProvider");
}

// ============================================================================
// Portal and Policy Builders
// ============================================================================

/**
 * UI customization options for authentication portal
 */
export interface PortalUiOptions {
  /**
   * Theme name
   */
  theme?: string;
  /**
   * Logo URL
   */
  logoUrl?: string;
  /**
   * Custom CSS
   */
  customCss?: string;
}

/**
 * Cookie configuration options
 */
export interface CookieOptions {
  /**
   * Cookie domain
   */
  domain?: string;
  /**
   * Cookie path
   * @default "/"
   */
  path?: string;
  /**
   * Cookie lifetime
   * @default "24h"
   */
  lifetime?: string;
}

/**
 * Options for building an authentication portal
 */
export interface BuildAuthenticationPortalOptions {
  /**
   * Portal name (referenced by portal_name in handlers)
   */
  name: string;
  /**
   * UI customization settings
   */
  ui?: PortalUiOptions;
  /**
   * Cookie settings
   */
  cookie?: CookieOptions;
  /**
   * Identity store names enabled for this portal
   */
  identityStores?: string[];
  /**
   * Identity provider names enabled for this portal
   */
  identityProviders?: string[];
  /**
   * Transform rules for user claims
   */
  transformUser?: Record<string, unknown>;
}

/**
 * Build an authentication portal configuration
 *
 * @param options - Portal options
 * @returns Validated authentication portal configuration
 *
 * @example
 * ```typescript
 * import { buildAuthenticationPortal } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const portal = buildAuthenticationPortal({
 *   name: "myportal",
 *   identityStores: ["localdb"],
 *   identityProviders: ["keycloak"],
 *   cookie: { domain: ".example.com", lifetime: "24h" },
 * });
 * ```
 */
export function buildAuthenticationPortal(
  options: BuildAuthenticationPortalOptions
): AuthenticationPortal {
  const portal: Record<string, unknown> = {
    name: options.name,
  };

  if (options.ui) {
    portal.ui = {
      ...(options.ui.theme && { theme: options.ui.theme }),
      ...(options.ui.logoUrl && { logo_url: options.ui.logoUrl }),
      ...(options.ui.customCss && { custom_css: options.ui.customCss }),
    };
  }

  if (options.cookie) {
    portal.cookie = {
      ...(options.cookie.domain && { domain: options.cookie.domain }),
      ...(options.cookie.path && { path: options.cookie.path }),
      ...(options.cookie.lifetime && { lifetime: options.cookie.lifetime }),
    };
  }

  if (options.identityStores) {
    portal.identity_stores = options.identityStores;
  }

  if (options.identityProviders) {
    portal.identity_providers = options.identityProviders;
  }

  if (options.transformUser) {
    portal.transform_user = options.transformUser;
  }

  return validateOrThrow(AuthenticationPortalSchema, portal, "buildAuthenticationPortal");
}

/**
 * Access list entry configuration
 */
export interface AccessListEntry {
  /**
   * Action: allow or deny
   * @default "allow"
   */
  action?: "allow" | "deny";
  /**
   * Claim to check
   * @example "roles"
   */
  claim: string;
  /**
   * Required values for the claim
   */
  values: string[];
}

/**
 * Crypto key configuration
 */
export interface CryptoKeyConfig {
  /**
   * Token name
   * @default "access_token"
   */
  tokenName?: string;
  /**
   * Token source (header, cookie, query)
   * @default "cookie"
   */
  source?: string;
}

/**
 * Options for building an authorization policy
 */
export interface BuildAuthorizationPolicyOptions {
  /**
   * Policy name (referenced by gatekeeper_name in handlers)
   */
  name: string;
  /**
   * Access control lists
   */
  accessLists?: AccessListEntry[];
  /**
   * Crypto key configuration for JWT validation
   */
  cryptoKey?: CryptoKeyConfig;
  /**
   * Bypass paths (no auth required)
   */
  bypass?: string[];
}

/**
 * Build an authorization policy (gatekeeper) configuration
 *
 * @param options - Policy options
 * @returns Validated authorization policy configuration
 *
 * @example
 * ```typescript
 * import { buildAuthorizationPolicy } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const policy = buildAuthorizationPolicy({
 *   name: "admin-policy",
 *   accessLists: [
 *     { claim: "roles", values: ["admin", "editor"], action: "allow" },
 *   ],
 *   bypass: ["/health", "/metrics"],
 * });
 * ```
 */
export function buildAuthorizationPolicy(
  options: BuildAuthorizationPolicyOptions
): AuthorizationPolicy {
  const policy: Record<string, unknown> = {
    name: options.name,
  };

  if (options.accessLists && options.accessLists.length > 0) {
    policy.access_lists = options.accessLists.map((entry) => ({
      action: entry.action ?? "allow",
      claim: entry.claim,
      values: entry.values,
    }));
  }

  if (options.cryptoKey) {
    policy.crypto_key = {
      ...(options.cryptoKey.tokenName && { token_name: options.cryptoKey.tokenName }),
      ...(options.cryptoKey.source && { source: options.cryptoKey.source }),
    };
  }

  if (options.bypass && options.bypass.length > 0) {
    policy.bypass = options.bypass;
  }

  return validateOrThrow(AuthorizationPolicySchema, policy, "buildAuthorizationPolicy");
}

// ============================================================================
// Security Config Builders
// ============================================================================

/**
 * Options for building a security configuration
 */
export interface BuildSecurityConfigOptions {
  /**
   * Authentication portals
   */
  portals?: AuthenticationPortal[];
  /**
   * Authorization policies (gatekeepers)
   */
  policies?: AuthorizationPolicy[];
  /**
   * Identity stores
   */
  identityStores?: (LocalIdentityStore | LdapIdentityStore)[];
  /**
   * Identity providers
   */
  identityProviders?: (OAuth2IdentityProvider | OidcIdentityProvider)[];
}

/**
 * Build a security configuration
 *
 * @param options - Configuration options
 * @returns Validated security configuration
 *
 * @example
 * ```typescript
 * import {
 *   buildSecurityConfig,
 *   buildLocalIdentityStore,
 *   buildAuthenticationPortal,
 *   buildAuthorizationPolicy,
 * } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const config = buildSecurityConfig({
 *   identityStores: [
 *     buildLocalIdentityStore({ path: "/etc/caddy/users.json" }),
 *   ],
 *   portals: [
 *     buildAuthenticationPortal({
 *       name: "myportal",
 *       identityStores: ["local"],
 *     }),
 *   ],
 *   policies: [
 *     buildAuthorizationPolicy({
 *       name: "mypolicy",
 *       accessLists: [{ claim: "roles", values: ["user"] }],
 *     }),
 *   ],
 * });
 * ```
 */
export function buildSecurityConfig(options: BuildSecurityConfigOptions): SecurityConfig {
  const config: Record<string, unknown> = {};

  if (options.portals && options.portals.length > 0) {
    config.authentication_portals = options.portals;
  }

  if (options.policies && options.policies.length > 0) {
    config.authorization_policies = options.policies;
  }

  if (options.identityStores && options.identityStores.length > 0) {
    config.identity_stores = options.identityStores;
  }

  if (options.identityProviders && options.identityProviders.length > 0) {
    config.identity_providers = options.identityProviders;
  }

  return validateOrThrow(SecurityConfigSchema, config, "buildSecurityConfig");
}

/**
 * Options for building a complete security app configuration
 */
export interface BuildSecurityAppOptions {
  /**
   * Security configuration
   */
  config: SecurityConfig;
}

/**
 * Build a complete security app configuration
 *
 * Creates the full security app configuration for `/config/apps/security`.
 *
 * @param options - App options
 * @returns Validated security app configuration
 *
 * @example
 * ```typescript
 * import { buildSecurityApp, buildSecurityConfig } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const app = buildSecurityApp({
 *   config: buildSecurityConfig({
 *     // ... config options
 *   }),
 * });
 *
 * // Apply to Caddy
 * await client.request("/config/apps/security", {
 *   method: "PUT",
 *   body: JSON.stringify(app),
 * });
 * ```
 */
export function buildSecurityApp(options: BuildSecurityAppOptions): SecurityApp {
  const app = {
    config: options.config,
  };

  return validateOrThrow(SecurityAppSchema, app, "buildSecurityApp");
}

// ============================================================================
// Handler Builders
// ============================================================================

/**
 * Options for building an authenticator handler
 */
export interface BuildAuthenticatorHandlerOptions {
  /**
   * Name of the authentication portal defined in security app config
   */
  portalName: string;
  /**
   * Optional route matcher pattern
   */
  routeMatcher?: string;
}

/**
 * Build an authenticator portal handler
 *
 * Creates a caddy-security authenticator handler that serves the login portal
 * and handles credential validation.
 *
 * @param options - Handler options
 * @returns Validated authenticator handler configuration
 *
 * @example
 * ```typescript
 * import { buildAuthenticatorHandler } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const handler = buildAuthenticatorHandler({
 *   portalName: "myportal",
 * });
 *
 * // Use in a route
 * const route: CaddyRoute = {
 *   match: [{ host: ["auth.example.com"] }],
 *   handle: [handler],
 *   terminal: true,
 * };
 * ```
 */
export function buildAuthenticatorHandler(
  options: BuildAuthenticatorHandlerOptions
): SecurityAuthenticatorHandler {
  const handler = {
    handler: "authenticator" as const,
    portal_name: options.portalName,
    ...(options.routeMatcher && { route_matcher: options.routeMatcher }),
  };

  return validateOrThrow(SecurityAuthenticatorHandlerSchema, handler, "buildAuthenticatorHandler");
}

/**
 * Options for building an authorization handler
 */
export interface BuildAuthorizationHandlerOptions {
  /**
   * Name of the gatekeeper/policy defined in security app config
   */
  gatekeeperName: string;
  /**
   * Optional route matcher pattern
   */
  routeMatcher?: string;
}

/**
 * Build an authorization handler
 *
 * Creates a caddy-security authorization handler that validates JWT/PASETO
 * tokens and enforces access control policies.
 *
 * This uses Caddy's built-in `authentication` handler with the caddy-security
 * `authorizer` provider.
 *
 * @param options - Handler options
 * @returns Validated authorization handler configuration
 *
 * @example
 * ```typescript
 * import { buildAuthorizationHandler } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const handler = buildAuthorizationHandler({
 *   gatekeeperName: "mygatekeeper",
 * });
 *
 * // Protect a route
 * const route: CaddyRoute = {
 *   match: [{ host: ["api.example.com"] }],
 *   handle: [
 *     handler,  // Check auth first
 *     { handler: "reverse_proxy", upstreams: [{ dial: "localhost:3000" }] },
 *   ],
 *   terminal: true,
 * };
 * ```
 */
export function buildAuthorizationHandler(
  options: BuildAuthorizationHandlerOptions
): SecurityAuthorizationHandler {
  const handler = {
    handler: "authentication" as const,
    providers: {
      authorizer: {
        gatekeeper_name: options.gatekeeperName,
        ...(options.routeMatcher && { route_matcher: options.routeMatcher }),
      },
    },
  };

  return validateOrThrow(SecurityAuthorizationHandlerSchema, handler, "buildAuthorizationHandler");
}

// ============================================================================
// Route Builders
// ============================================================================

/**
 * Options for building an authentication portal route
 */
export interface BuildAuthenticationRouteOptions {
  /**
   * Host(s) to match for the authentication portal
   */
  hosts: string[];
  /**
   * Name of the authentication portal
   */
  portalName: string;
  /**
   * Route ID for tracking
   */
  routeId?: string;
  /**
   * Route priority (lower = higher priority)
   * @default 10 (AUTH_DOMAIN priority)
   */
  priority?: number;
}

/**
 * Build a complete authentication portal route
 *
 * Creates a Caddy route that serves the authentication portal on specified hosts.
 *
 * @param options - Route options
 * @returns Complete Caddy route configuration
 *
 * @example
 * ```typescript
 * import { buildAuthenticatorRoute } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const route = buildAuthenticatorRoute({
 *   hosts: ["auth.example.com"],
 *   portalName: "myportal",
 *   routeId: "auth-portal",
 * });
 *
 * await client.addRoute("https_server", route);
 * ```
 */
export function buildAuthenticatorRoute(options: BuildAuthenticationRouteOptions): CaddyRoute {
  const handler = buildAuthenticatorHandler({
    portalName: options.portalName,
  });

  return {
    "@id": options.routeId ?? `auth-portal-${options.portalName}`,
    match: [{ host: options.hosts }],
    handle: [handler],
    terminal: true,
    priority: options.priority ?? 10,
  };
}

/**
 * Options for building a protected route
 */
export interface BuildProtectedRouteOptions {
  /**
   * Host(s) to match
   */
  hosts: string[];
  /**
   * Path(s) to match (optional)
   */
  paths?: string[];
  /**
   * Name of the gatekeeper/policy for authorization
   */
  gatekeeperName: string;
  /**
   * Upstream dial address (host:port)
   */
  dial: string;
  /**
   * Route ID for tracking
   */
  routeId?: string;
  /**
   * Route priority (lower = higher priority)
   * @default 50 (SERVICE priority)
   */
  priority?: number;
}

/**
 * Build a protected route with authorization
 *
 * Creates a Caddy route that requires valid JWT/PASETO tokens before
 * proxying to the upstream service.
 *
 * @param options - Route options
 * @returns Complete Caddy route configuration
 *
 * @example
 * ```typescript
 * import { buildProtectedRoute } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const route = buildProtectedRoute({
 *   hosts: ["api.example.com"],
 *   paths: ["/admin/*"],
 *   gatekeeperName: "admin-policy",
 *   dial: "localhost:3000",
 *   routeId: "protected-admin-api",
 * });
 *
 * await client.addRoute("https_server", route);
 * ```
 */
export function buildProtectedRoute(options: BuildProtectedRouteOptions): CaddyRoute {
  const authHandler = buildAuthorizationHandler({
    gatekeeperName: options.gatekeeperName,
  });

  const match: { host: string[]; path?: string[] } = {
    host: options.hosts,
  };

  if (options.paths) {
    match.path = options.paths;
  }

  return {
    "@id": options.routeId ?? `protected-${options.gatekeeperName}`,
    match: [match],
    handle: [
      authHandler,
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: options.dial }],
      },
    ],
    terminal: true,
    priority: options.priority ?? 50,
  };
}
