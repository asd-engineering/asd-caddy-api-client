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
   * Name of the identity store (used to reference it in portals)
   * @default "local"
   */
  name?: string;
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
 * Uses the authcrunch wrapper structure: name, kind, params
 *
 * @param options - Store options
 * @returns Validated local identity store configuration
 *
 * @example
 * ```typescript
 * import { buildLocalIdentityStore } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const store = buildLocalIdentityStore({
 *   name: "localdb",
 *   path: "/etc/caddy/users.json",
 *   realm: "local",
 * });
 * ```
 */
export function buildLocalIdentityStore(
  options: BuildLocalIdentityStoreOptions
): LocalIdentityStore {
  const store = {
    name: options.name ?? "local",
    kind: "local" as const,
    params: {
      realm: options.realm ?? "local",
      path: options.path,
    },
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
 * LDAP group to role mapping
 */
export interface LdapGroupConfig {
  /**
   * LDAP group DN
   * @example "CN=Admins,OU=Groups,DC=example,DC=com"
   */
  groupDn?: string;
  /**
   * Roles to assign when user is member of this group
   */
  roles?: string[];
}

/**
 * Options for building an LDAP identity store
 */
export interface BuildLdapIdentityStoreOptions {
  /**
   * Name of the identity store (used to reference it in portals)
   * @default "ldapdb"
   */
  name?: string;
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
   * Bind username for LDAP queries (full DN)
   * @example "cn=admin,dc=example,dc=com"
   */
  bindUsername: string;
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
   * LDAP search filter template for users
   * @default "(uid={username})"
   */
  searchUserFilter?: string;
  /**
   * Group to role mappings
   * @default []
   */
  groups?: LdapGroupConfig[];
}

/**
 * Build an LDAP identity store configuration
 *
 * Creates an LDAP-based identity store for user authentication.
 * Uses the authcrunch wrapper structure: name, kind, params
 *
 * @param options - Store options
 * @returns Validated LDAP identity store configuration
 *
 * @example
 * ```typescript
 * import { buildLdapIdentityStore } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const store = buildLdapIdentityStore({
 *   name: "ldapdb",
 *   servers: [{ address: "ldap.example.com", port: 389 }],
 *   bindUsername: "cn=admin,dc=example,dc=com",
 *   bindPassword: "secret",
 *   searchBaseDn: "ou=users,dc=example,dc=com",
 *   searchUserFilter: "(uid={username})",
 * });
 * ```
 */
export function buildLdapIdentityStore(options: BuildLdapIdentityStoreOptions): LdapIdentityStore {
  const store = {
    name: options.name ?? "ldapdb",
    kind: "ldap" as const,
    params: {
      realm: options.realm ?? "ldap",
      servers: options.servers.map((s) => {
        // Ensure address has ldap:// or ldaps:// prefix
        let address = s.address;
        if (!address.startsWith("ldap://") && !address.startsWith("ldaps://")) {
          // Default to ldap:// if no port or port 389, ldaps:// for port 636
          const prefix = s.port === 636 ? "ldaps://" : "ldap://";
          address = prefix + address;
        }
        return {
          address,
          ...(s.port && { port: s.port }),
        };
      }),
      bind_username: options.bindUsername,
      bind_password: options.bindPassword,
      search_base_dn: options.searchBaseDn,
      search_user_filter: options.searchUserFilter ?? "(uid={username})",
      // Groups field is required by authcrunch
      groups: (options.groups ?? []).map((g) => ({
        ...(g.groupDn && { group_dn: g.groupDn }),
        ...(g.roles && { roles: g.roles }),
      })),
    },
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
   * Name of the identity provider (used to reference it in portals)
   */
  name?: string;
  /**
   * Realm name for this provider
   */
  realm?: string;
  /**
   * Provider name/driver (github, google, facebook, etc.)
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
  /**
   * Authorization URL (for non-standard providers)
   */
  authorizationUrl?: string;
  /**
   * Token URL (for non-standard providers)
   */
  tokenUrl?: string;
}

/**
 * Build an OAuth2 identity provider configuration
 *
 * Uses the authcrunch wrapper structure: name, kind, params
 *
 * @param options - Provider options
 * @returns Validated OAuth2 provider configuration
 *
 * @example
 * ```typescript
 * import { buildOAuth2Provider } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const provider = buildOAuth2Provider({
 *   name: "github",
 *   provider: "github",
 *   clientId: "your-client-id",
 *   clientSecret: "your-client-secret",
 *   scopes: ["user:email", "read:user"],
 * });
 * ```
 */
export function buildOAuth2Provider(options: BuildOAuth2ProviderOptions): OAuth2IdentityProvider {
  const provider = {
    name: options.name ?? options.provider,
    kind: "oauth" as const,
    params: {
      driver: options.provider, // github, google, etc.
      realm: options.realm ?? options.provider,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      scopes: options.scopes ?? ["openid", "email", "profile"],
      ...(options.authorizationUrl && { authorization_url: options.authorizationUrl }),
      ...(options.tokenUrl && { token_url: options.tokenUrl }),
    },
  };

  return validateOrThrow(OAuth2IdentityProviderSchema, provider, "buildOAuth2Provider");
}

/**
 * Options for building an OIDC identity provider
 */
export interface BuildOidcProviderOptions {
  /**
   * Name of the identity provider (used to reference it in portals)
   */
  name?: string;
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
   * OIDC metadata/discovery URL (.well-known/openid-configuration)
   * @example "https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration"
   */
  metadataUrl: string;
  /**
   * Scopes to request
   * @default ["openid", "email", "profile"]
   */
  scopes?: string[];
}

/**
 * Build an OIDC identity provider configuration
 *
 * Uses the authcrunch wrapper structure: name, kind, params
 *
 * @param options - Provider options
 * @returns Validated OIDC provider configuration
 *
 * @example
 * ```typescript
 * import { buildOidcProvider } from "@.../caddy-api-client/plugins/caddy-security";
 *
 * const provider = buildOidcProvider({
 *   name: "keycloak",
 *   provider: "keycloak",
 *   clientId: "my-app",
 *   clientSecret: "secret",
 *   metadataUrl: "https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration",
 * });
 * ```
 */
export function buildOidcProvider(options: BuildOidcProviderOptions): OidcIdentityProvider {
  // Extract base URL from metadata URL (remove /.well-known/openid-configuration)
  let baseAuthUrl = options.metadataUrl;
  if (baseAuthUrl.endsWith("/.well-known/openid-configuration")) {
    baseAuthUrl = baseAuthUrl.replace("/.well-known/openid-configuration", "");
  }

  const provider = {
    name: options.name ?? options.provider,
    kind: "oauth" as const,
    params: {
      // OIDC providers use "generic" driver with base_auth_url for discovery
      // @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/idp/oauth
      driver: "generic",
      realm: options.realm ?? options.provider,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      base_auth_url: baseAuthUrl,
      scopes: options.scopes ?? ["openid", "email", "profile"],
    },
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
   * Cookie domain (optional - used to create domain-specific config)
   */
  domain?: string;
  /**
   * Cookie path
   * @default "/"
   */
  path?: string;
  /**
   * Cookie lifetime in seconds
   * @default 86400 (24 hours)
   */
  lifetime?: number | string;
  /**
   * Whether to allow insecure cookies (HTTP)
   * @default false
   */
  insecure?: boolean;
  /**
   * SameSite attribute
   */
  sameSite?: string;
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
    // Note: cookie_config uses domains map and numeric lifetime
    // @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/authn/cookie#Config
    const cookieConfig: Record<string, unknown> = {};

    // Parse lifetime to seconds if provided as string (e.g., "24h", "1h", "30m")
    let lifetimeSeconds: number | undefined;
    if (options.cookie.lifetime !== undefined) {
      if (typeof options.cookie.lifetime === "number") {
        lifetimeSeconds = options.cookie.lifetime;
      } else {
        // Parse duration string like "24h", "1h", "30m"
        const match = /^(\d+)(h|m|s)?$/.exec(options.cookie.lifetime);
        if (match) {
          const value = parseInt(match[1], 10);
          const unit = match[2] ?? "s";
          lifetimeSeconds = unit === "h" ? value * 3600 : unit === "m" ? value * 60 : value;
        }
      }
    }

    if (options.cookie.domain) {
      // Domain-specific config in domains map
      const domainConfig: Record<string, unknown> = {};
      if (lifetimeSeconds !== undefined) domainConfig.lifetime = lifetimeSeconds;
      if (options.cookie.insecure !== undefined) domainConfig.insecure = options.cookie.insecure;
      if (options.cookie.sameSite) domainConfig.same_site = options.cookie.sameSite;
      cookieConfig.domains = { [options.cookie.domain]: domainConfig };
    } else {
      // Global config
      if (lifetimeSeconds !== undefined) cookieConfig.lifetime = lifetimeSeconds;
      if (options.cookie.insecure !== undefined) cookieConfig.insecure = options.cookie.insecure;
      if (options.cookie.sameSite) cookieConfig.same_site = options.cookie.sameSite;
    }

    if (options.cookie.path) cookieConfig.path = options.cookie.path;

    if (Object.keys(cookieConfig).length > 0) {
      portal.cookie_config = cookieConfig;
    }
  }

  if (options.identityStores) {
    portal.identity_stores = options.identityStores;
  }

  if (options.identityProviders) {
    portal.identity_providers = options.identityProviders;
  }

  if (options.transformUser) {
    portal.user_transformer_configs = [options.transformUser];
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
    // Note: access_list_rules with conditions array, format: "match <claim> <values...>"
    // @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/acl#RuleConfiguration
    policy.access_list_rules = options.accessLists.map((entry) => ({
      action: entry.action ?? "allow",
      conditions: [`match ${entry.claim} ${entry.values.join(" ")}`],
    }));
  }

  if (options.cryptoKey) {
    // Note: crypto_key_configs (array), not crypto_key
    policy.crypto_key_configs = [
      {
        ...(options.cryptoKey.tokenName && { token_name: options.cryptoKey.tokenName }),
        ...(options.cryptoKey.source && { source: options.cryptoKey.source }),
      },
    ];
  }

  if (options.bypass && options.bypass.length > 0) {
    // Note: bypass_configs (array of objects), not bypass (array of strings)
    policy.bypass_configs = options.bypass.map((uri) => ({
      uri,
    }));
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
