/**
 * caddy-security plugin types
 *
 * This module provides TypeScript types for the caddy-security plugin handlers.
 * These types enable strict type checking for authentication and authorization
 * middleware configurations.
 *
 * @see https://github.com/greenpau/caddy-security
 * @see https://docs.authcrunch.com
 * @see local/plugins/caddy-security/README.md
 *
 * @example
 * ```typescript
 * import type {
 *   SecurityAuthenticationHandler,
 *   SecurityAuthorizationHandler
 * } from "@accelerated-software-development/caddy-api-client/plugins/caddy-security";
 *
 * const authHandler: SecurityAuthenticationHandler = {
 *   handler: "authentication",
 *   portal_name: "myportal",
 * };
 * ```
 */

// ============================================================================
// HTTP Handler Types
// ============================================================================

/**
 * Authentication portal middleware handler
 *
 * Serves the authentication portal UI and handles credential validation.
 * Issues JWT tokens upon successful authentication.
 *
 * **Module ID:** `http.handlers.authentication` (caddy-security override)
 * **Note:** This overrides Caddy's built-in authentication handler with
 * caddy-security's portal-based authentication.
 *
 * @example
 * ```typescript
 * const handler: SecurityAuthenticationHandler = {
 *   handler: "authentication",
 *   portal_name: "myportal",
 *   route_matcher: "example.com",
 * };
 * ```
 */
export interface SecurityAuthenticationHandler {
  handler: "authentication";
  /**
   * Name of the authentication portal defined in the security app config.
   * References a portal in `/config/apps/security/config/authentication_portals`
   */
  portal_name?: string;
  /**
   * Route matcher pattern for this handler.
   * Typically matches the domain serving the portal.
   */
  route_matcher?: string;
}

/**
 * Authorization gateway middleware handler
 *
 * Validates JWT/PASETO tokens and enforces access control policies.
 * Must be configured after the authentication handler in the request chain.
 *
 * **Module ID:** `http.handlers.authorization`
 *
 * @example
 * ```typescript
 * const handler: SecurityAuthorizationHandler = {
 *   handler: "authorization",
 *   gatekeeper_name: "mygatekeeper",
 * };
 * ```
 */
export interface SecurityAuthorizationHandler {
  handler: "authorization";
  /**
   * Name of the gatekeeper/policy defined in the security app config.
   * References a policy in `/config/apps/security/config/authorization_policies`
   */
  gatekeeper_name?: string;
  /**
   * Route matcher pattern for this handler.
   */
  route_matcher?: string;
}

// ============================================================================
// Security App Types (for /config/apps/security)
// ============================================================================

/**
 * Identity provider types supported by caddy-security
 */
export type IdentityProviderType = "local" | "ldap" | "oauth2" | "oidc" | "saml";

/**
 * Local identity store configuration
 *
 * Stores user credentials in a local JSON file.
 */
export interface LocalIdentityStore {
  /** Store driver type */
  driver: "local";
  /** Realm name for this identity store */
  realm?: string;
  /** Path to the JSON file containing user credentials */
  path: string;
}

/**
 * LDAP identity store configuration
 */
export interface LdapIdentityStore {
  driver: "ldap";
  realm?: string;
  /** LDAP server addresses */
  servers?: {
    address: string;
    port?: number;
  }[];
  /** Bind DN for LDAP queries */
  bind_dn?: string;
  /** Bind password */
  bind_password?: string;
  /** Base DN for user searches */
  search_base_dn?: string;
  /** Search filter template */
  search_filter?: string;
}

/**
 * OAuth 2.0 identity provider configuration
 */
export interface OAuth2IdentityProvider {
  driver: "oauth2";
  realm?: string;
  /** Provider name (github, google, facebook, etc.) */
  provider?: string;
  /** OAuth client ID */
  client_id?: string;
  /** OAuth client secret */
  client_secret?: string;
  /** OAuth scopes to request */
  scopes?: string[];
}

/**
 * OpenID Connect identity provider configuration
 */
export interface OidcIdentityProvider {
  driver: "oidc";
  realm?: string;
  /** OIDC provider name */
  provider?: string;
  /** Client ID */
  client_id?: string;
  /** Client secret */
  client_secret?: string;
  /** Discovery URL (.well-known/openid-configuration) */
  discovery_url?: string;
  /** Scopes to request */
  scopes?: string[];
}

/**
 * Union of all identity store/provider types
 */
export type IdentityStore =
  | LocalIdentityStore
  | LdapIdentityStore
  | OAuth2IdentityProvider
  | OidcIdentityProvider;

/**
 * Authentication portal configuration
 */
export interface AuthenticationPortal {
  /** Portal name (referenced by portal_name in handlers) */
  name: string;
  /** UI customization settings */
  ui?: {
    /** Theme name */
    theme?: string;
    /** Logo URL */
    logo_url?: string;
    /** Custom CSS */
    custom_css?: string;
  };
  /** Cookie settings */
  cookie?: {
    /** Cookie domain */
    domain?: string;
    /** Cookie path */
    path?: string;
    /** Cookie lifetime */
    lifetime?: string;
  };
  /** Identity stores enabled for this portal */
  identity_stores?: string[];
  /** Identity providers enabled for this portal */
  identity_providers?: string[];
  /** Transform rules for user claims */
  transform_user?: Record<string, unknown>;
}

/**
 * Authorization policy (gatekeeper) configuration
 */
export interface AuthorizationPolicy {
  /** Policy name (referenced by gatekeeper_name in handlers) */
  name: string;
  /** Access control lists */
  access_lists?: {
    /** Action: allow or deny */
    action?: "allow" | "deny";
    /** Required claims for this rule */
    claim?: string;
    /** Required values for the claim */
    values?: string[];
  }[];
  /** Crypto key configuration for JWT validation */
  crypto_key?: {
    /** Token name */
    token_name?: string;
    /** Token source (header, cookie, query) */
    source?: string;
  };
  /** Bypass paths (no auth required) */
  bypass?: string[];
}

/**
 * Credentials configuration
 */
export interface Credentials {
  /** Generic credentials store */
  generic?: Record<string, unknown>;
}

/**
 * Security app configuration
 *
 * This is the main configuration object at `/config/apps/security/config`
 */
export interface SecurityConfig {
  /** Authentication portals */
  authentication_portals?: AuthenticationPortal[];
  /** Authorization policies (gatekeepers) */
  authorization_policies?: AuthorizationPolicy[];
  /** Credentials for external services */
  credentials?: Credentials;
  /** Identity stores */
  identity_stores?: IdentityStore[];
  /** Identity providers */
  identity_providers?: IdentityStore[];
}

/**
 * Secrets manager interface
 */
export interface SecretsManager {
  /** Driver type (aws_secrets_manager, hashicorp_vault, etc.) */
  driver: string;
  [key: string]: unknown;
}

/**
 * Security app configuration
 *
 * Top-level configuration at `/config/apps/security`
 *
 * @example
 * ```typescript
 * const securityApp: SecurityApp = {
 *   config: {
 *     authentication_portals: [{
 *       name: "myportal",
 *       identity_stores: ["localdb"],
 *     }],
 *     identity_stores: [{
 *       driver: "local",
 *       realm: "local",
 *       path: "/path/to/users.json",
 *     }],
 *   },
 * };
 * ```
 */
export interface SecurityApp {
  /** Security configuration */
  config?: SecurityConfig;
  /** Secrets managers for external secret storage */
  secrets_managers?: SecretsManager[];
}

// ============================================================================
// Combined Handler Type
// ============================================================================

/**
 * Union of all caddy-security handler types
 */
export type SecurityHandler = SecurityAuthenticationHandler | SecurityAuthorizationHandler;
