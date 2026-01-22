/**
 * Zod schemas for caddy-security plugin
 *
 * Provides runtime validation for caddy-security handler configurations.
 *
 * Base types are generated from Go source via tygo + ts-to-zod.
 * Handler schemas extend these with the `handler` discriminator field
 * that Caddy adds based on the module namespace.
 *
 * @see https://github.com/greenpau/caddy-security
 * @see src/generated/plugins/caddy-security.ts (generated types)
 * @see src/generated/plugins/caddy-security.zod.ts (generated schemas)
 */
import { z } from "zod";

// Re-export generated base schemas for reference
export {
  authnMiddlewareSchema as GeneratedAuthnMiddlewareSchema,
  authzMiddlewareSchema as GeneratedAuthzMiddlewareSchema,
  appSchema as GeneratedSecurityAppSchema,
} from "../../generated/plugins/caddy-security.zod.js";

// ============================================================================
// HTTP Handler Schemas
// ============================================================================

/**
 * Authenticator portal handler schema
 *
 * Extends the generated AuthnMiddleware with the handler discriminator.
 * Module ID: `http.handlers.authenticator`
 *
 * @example
 * ```typescript
 * const handler = SecurityAuthenticatorHandlerSchema.parse({
 *   handler: "authenticator",
 *   portal_name: "myportal",
 * });
 * ```
 */
export const SecurityAuthenticatorHandlerSchema = z.object({
  handler: z.literal("authenticator"),
  portal_name: z.string().optional(),
  route_matcher: z.string().optional(),
});

/**
 * Authorizer provider schema
 *
 * Based on generated AuthzMiddleware (without handler field since it's a provider).
 * Module ID: `http.authentication.providers.authorizer`
 *
 * @example
 * ```typescript
 * const provider = SecurityAuthorizerProviderSchema.parse({
 *   gatekeeper_name: "mygatekeeper",
 *   route_matcher: "*",
 * });
 * ```
 */
export const SecurityAuthorizerProviderSchema = z.object({
  gatekeeper_name: z.string().optional(),
  route_matcher: z.string().optional(),
});

/**
 * Authorization handler schema
 *
 * Uses Caddy's built-in `authentication` handler with the `authorizer` provider.
 * The provider config is based on the generated AuthzMiddleware.
 *
 * @example
 * ```typescript
 * const handler = SecurityAuthorizationHandlerSchema.parse({
 *   handler: "authentication",
 *   providers: {
 *     authorizer: {
 *       gatekeeper_name: "mygatekeeper",
 *     },
 *   },
 * });
 * ```
 */
export const SecurityAuthorizationHandlerSchema = z.object({
  handler: z.literal("authentication"),
  providers: z.object({
    authorizer: SecurityAuthorizerProviderSchema,
  }),
});

/**
 * Combined security handler schema (discriminated union)
 *
 * - `authenticator` - Portal handler that serves login UI
 * - `authentication` - Caddy's handler with the authorizer provider for token validation
 */
export const SecurityHandlerSchema = z.discriminatedUnion("handler", [
  SecurityAuthenticatorHandlerSchema,
  SecurityAuthorizationHandlerSchema,
]);

// ============================================================================
// Security App Schemas
// ============================================================================

/**
 * Local identity store params schema
 * Contains the actual configuration parameters for local stores
 */
export const LocalIdentityStoreParamsSchema = z.object({
  realm: z.string().optional(),
  path: z.string(),
});

/**
 * Local identity store schema
 * Uses the authcrunch wrapper structure: name, kind, params
 */
export const LocalIdentityStoreSchema = z.object({
  name: z.string(),
  kind: z.literal("local"),
  params: LocalIdentityStoreParamsSchema,
});

/**
 * LDAP server schema
 */
export const LdapServerSchema = z.object({
  address: z.string(),
  port: z.number().int().positive().max(65535).optional(),
});

/**
 * LDAP user group schema for role mapping
 * @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/ids/ldap#UserGroup
 */
export const LdapUserGroupSchema = z.object({
  group_dn: z.string(), // Required: DN pattern for the group (e.g., "ou=users,dc=test,dc=local")
  roles: z.array(z.string()).optional(),
});

/**
 * LDAP identity store params schema
 * Contains the actual configuration parameters for LDAP stores
 * @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/ids/ldap#Config
 */
export const LdapIdentityStoreParamsSchema = z.object({
  realm: z.string().optional(),
  servers: z.array(LdapServerSchema).optional(),
  bind_username: z.string().optional(), // Note: bind_username, not bind_dn
  bind_password: z.string().optional(),
  search_base_dn: z.string().optional(),
  search_user_filter: z.string().optional(), // Note: search_user_filter, not search_filter
  groups: z.array(LdapUserGroupSchema).optional(), // Required by authcrunch
});

/**
 * LDAP identity store schema
 * Uses the authcrunch wrapper structure: name, kind, params
 */
export const LdapIdentityStoreSchema = z.object({
  name: z.string(),
  kind: z.literal("ldap"),
  params: LdapIdentityStoreParamsSchema,
});

/**
 * OAuth 2.0 identity provider params schema
 * Contains the actual configuration parameters for OAuth providers
 * @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/idp/oauth#Config
 */
export const OAuth2IdentityProviderParamsSchema = z.object({
  driver: z.string().optional(), // oauth2, generic, etc.
  realm: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  // OAuth2 doesn't use metadata_url, only authorization_url and token_url
  authorization_url: z.string().optional(),
  token_url: z.string().optional(),
});

/**
 * OAuth 2.0 identity provider schema
 * Uses the authcrunch wrapper structure: name, kind, params
 */
export const OAuth2IdentityProviderSchema = z.object({
  name: z.string(),
  kind: z.literal("oauth"),
  params: OAuth2IdentityProviderParamsSchema,
});

/**
 * OIDC identity provider params schema
 * Contains the actual configuration parameters for OIDC providers
 * @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/idp/oauth#Config
 */
export const OidcIdentityProviderParamsSchema = z.object({
  driver: z.string().optional(), // generic for OIDC
  realm: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  base_auth_url: z.string().optional(), // Base URL for OIDC discovery (without /.well-known/openid-configuration)
  scopes: z.array(z.string()).optional(),
});

/**
 * OIDC identity provider schema
 * Uses the authcrunch wrapper structure: name, kind, params
 */
export const OidcIdentityProviderSchema = z.object({
  name: z.string(),
  kind: z.literal("oauth"),
  params: OidcIdentityProviderParamsSchema,
});

/**
 * Identity store union schema
 */
export const IdentityStoreSchema = z.discriminatedUnion("kind", [
  LocalIdentityStoreSchema,
  LdapIdentityStoreSchema,
]);

/**
 * Identity provider union schema
 *
 * Note: We use passthrough() on the params schemas to preserve fields that
 * might only exist in one schema (e.g., base_auth_url for OIDC, authorization_url for OAuth2).
 * This is necessary because Zod union validation picks the first matching schema
 * and would otherwise strip fields not in that schema.
 */
export const IdentityProviderSchema = z.object({
  name: z.string(),
  kind: z.literal("oauth"),
  params: z.union([
    OAuth2IdentityProviderParamsSchema.passthrough(),
    OidcIdentityProviderParamsSchema.passthrough(),
  ]),
});

/**
 * Authentication portal UI schema
 */
export const PortalUiSchema = z.object({
  theme: z.string().optional(),
  logo_url: z.string().optional(),
  custom_css: z.string().optional(),
});

/**
 * Domain-specific cookie config schema
 * @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/authn/cookie#DomainConfig
 */
export const DomainCookieConfigSchema = z.object({
  lifetime: z.number().optional(), // Cookie lifetime in seconds
  insecure: z.boolean().optional(),
  same_site: z.string().optional(),
});

/**
 * Cookie configuration schema
 * @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/authn/cookie#Config
 */
export const CookieConfigSchema = z.object({
  domains: z.record(z.string(), DomainCookieConfigSchema).optional(), // Map of domain names to config
  path: z.string().optional(),
  lifetime: z.number().optional(), // Cookie lifetime in seconds
  insecure: z.boolean().optional(),
  same_site: z.string().optional(),
});

/**
 * Authentication portal schema
 * @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/authn#PortalConfig
 */
export const AuthenticationPortalSchema = z.object({
  name: z.string(),
  ui: PortalUiSchema.optional(),
  cookie_config: CookieConfigSchema.optional(), // Note: cookie_config, not cookie
  identity_stores: z.array(z.string()).optional(),
  identity_providers: z.array(z.string()).optional(),
  user_transformer_configs: z.array(z.record(z.string(), z.unknown())).optional(),
});

/**
 * Access list rule schema
 * @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/acl#RuleConfiguration
 */
export const AccessListRuleSchema = z.object({
  comment: z.string().optional(),
  conditions: z.array(z.string()).optional(), // e.g., ["match roles admin", "match email *@example.com"]
  action: z.enum(["allow", "deny"]).optional(),
});

/**
 * Crypto key configuration schema
 */
export const CryptoKeyConfigSchema = z.object({
  token_name: z.string().optional(),
  source: z.string().optional(),
});

/**
 * Bypass config schema for authorization policies
 */
export const BypassConfigSchema = z.object({
  match_type: z.string(), // Required: "exact", "prefix", "suffix", "contains", or "regex"
  uri: z.string().optional(),
});

/**
 * Authorization policy (gatekeeper) schema
 * @see https://pkg.go.dev/github.com/greenpau/go-authcrunch/pkg/authz#PolicyConfig
 */
export const AuthorizationPolicySchema = z.object({
  name: z.string(),
  access_list_rules: z.array(AccessListRuleSchema).optional(), // Note: access_list_rules, not access_lists
  crypto_key_configs: z.array(CryptoKeyConfigSchema).optional(), // Note: crypto_key_configs (array), not crypto_key
  bypass_configs: z.array(BypassConfigSchema).optional(), // Note: bypass_configs, not bypass
});

/**
 * Credentials schema
 */
export const CredentialsSchema = z.object({
  generic: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Security configuration schema
 *
 * Validates the config object at `/config/apps/security/config`
 */
export const SecurityConfigSchema = z.object({
  authentication_portals: z.array(AuthenticationPortalSchema).optional(),
  authorization_policies: z.array(AuthorizationPolicySchema).optional(),
  credentials: CredentialsSchema.optional(),
  identity_stores: z.array(IdentityStoreSchema).optional(),
  identity_providers: z.array(IdentityProviderSchema).optional(),
});

/**
 * Secrets manager schema
 */
export const SecretsManagerSchema = z
  .object({
    driver: z.string(),
  })
  .passthrough();

/**
 * Security app schema
 *
 * Validates the full security app at `/config/apps/security`
 *
 * @example
 * ```typescript
 * const securityApp = SecurityAppSchema.parse({
 *   config: {
 *     authentication_portals: [{
 *       name: "myportal",
 *       identity_stores: ["localdb"],
 *     }],
 *   },
 * });
 * ```
 */
export const SecurityAppSchema = z.object({
  config: SecurityConfigSchema.optional(),
  secrets_managers: z.array(SecretsManagerSchema).optional(),
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type SecurityAuthenticatorHandler = z.infer<typeof SecurityAuthenticatorHandlerSchema>;
export type SecurityAuthorizerProvider = z.infer<typeof SecurityAuthorizerProviderSchema>;
export type SecurityAuthorizationHandler = z.infer<typeof SecurityAuthorizationHandlerSchema>;
export type SecurityHandler = z.infer<typeof SecurityHandlerSchema>;
export type LocalIdentityStoreParams = z.infer<typeof LocalIdentityStoreParamsSchema>;
export type LocalIdentityStore = z.infer<typeof LocalIdentityStoreSchema>;
export type LdapIdentityStoreParams = z.infer<typeof LdapIdentityStoreParamsSchema>;
export type LdapIdentityStore = z.infer<typeof LdapIdentityStoreSchema>;
export type OAuth2IdentityProviderParams = z.infer<typeof OAuth2IdentityProviderParamsSchema>;
export type OAuth2IdentityProvider = z.infer<typeof OAuth2IdentityProviderSchema>;
export type OidcIdentityProviderParams = z.infer<typeof OidcIdentityProviderParamsSchema>;
export type OidcIdentityProvider = z.infer<typeof OidcIdentityProviderSchema>;
export type IdentityStore = z.infer<typeof IdentityStoreSchema>;
export type IdentityProvider = z.infer<typeof IdentityProviderSchema>;
export type AuthenticationPortal = z.infer<typeof AuthenticationPortalSchema>;
export type AuthorizationPolicy = z.infer<typeof AuthorizationPolicySchema>;
export type BypassConfig = z.infer<typeof BypassConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type SecurityApp = z.infer<typeof SecurityAppSchema>;
