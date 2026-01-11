/**
 * Zod schemas for caddy-security plugin
 *
 * Provides runtime validation for caddy-security handler configurations.
 *
 * @see https://github.com/greenpau/caddy-security
 * @see local/plugins/caddy-security/README.md
 */
import { z } from "zod";

// ============================================================================
// HTTP Handler Schemas
// ============================================================================

/**
 * Authentication portal handler schema
 *
 * Validates the caddy-security authentication handler configuration.
 *
 * @example
 * ```typescript
 * const handler = SecurityAuthenticationHandlerSchema.parse({
 *   handler: "authentication",
 *   portal_name: "myportal",
 * });
 * ```
 */
export const SecurityAuthenticationHandlerSchema = z.object({
  handler: z.literal("authentication"),
  portal_name: z.string().optional(),
  route_matcher: z.string().optional(),
});

/**
 * Authorization gateway handler schema
 *
 * Validates the caddy-security authorization handler configuration.
 *
 * @example
 * ```typescript
 * const handler = SecurityAuthorizationHandlerSchema.parse({
 *   handler: "authorization",
 *   gatekeeper_name: "mygatekeeper",
 * });
 * ```
 */
export const SecurityAuthorizationHandlerSchema = z.object({
  handler: z.literal("authorization"),
  gatekeeper_name: z.string().optional(),
  route_matcher: z.string().optional(),
});

/**
 * Combined security handler schema (discriminated union)
 */
export const SecurityHandlerSchema = z.discriminatedUnion("handler", [
  SecurityAuthenticationHandlerSchema,
  SecurityAuthorizationHandlerSchema,
]);

// ============================================================================
// Security App Schemas
// ============================================================================

/**
 * Local identity store schema
 */
export const LocalIdentityStoreSchema = z.object({
  driver: z.literal("local"),
  realm: z.string().optional(),
  path: z.string(),
});

/**
 * LDAP server schema
 */
export const LdapServerSchema = z.object({
  address: z.string(),
  port: z.number().int().positive().max(65535).optional(),
});

/**
 * LDAP identity store schema
 */
export const LdapIdentityStoreSchema = z.object({
  driver: z.literal("ldap"),
  realm: z.string().optional(),
  servers: z.array(LdapServerSchema).optional(),
  bind_dn: z.string().optional(),
  bind_password: z.string().optional(),
  search_base_dn: z.string().optional(),
  search_filter: z.string().optional(),
});

/**
 * OAuth 2.0 identity provider schema
 */
export const OAuth2IdentityProviderSchema = z.object({
  driver: z.literal("oauth2"),
  realm: z.string().optional(),
  provider: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

/**
 * OIDC identity provider schema
 */
export const OidcIdentityProviderSchema = z.object({
  driver: z.literal("oidc"),
  realm: z.string().optional(),
  provider: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  discovery_url: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

/**
 * Identity store union schema
 */
export const IdentityStoreSchema = z.discriminatedUnion("driver", [
  LocalIdentityStoreSchema,
  LdapIdentityStoreSchema,
  OAuth2IdentityProviderSchema,
  OidcIdentityProviderSchema,
]);

/**
 * Authentication portal UI schema
 */
export const PortalUiSchema = z.object({
  theme: z.string().optional(),
  logo_url: z.string().optional(),
  custom_css: z.string().optional(),
});

/**
 * Cookie configuration schema
 */
export const CookieConfigSchema = z.object({
  domain: z.string().optional(),
  path: z.string().optional(),
  lifetime: z.string().optional(),
});

/**
 * Authentication portal schema
 */
export const AuthenticationPortalSchema = z.object({
  name: z.string(),
  ui: PortalUiSchema.optional(),
  cookie: CookieConfigSchema.optional(),
  identity_stores: z.array(z.string()).optional(),
  identity_providers: z.array(z.string()).optional(),
  transform_user: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Access list entry schema
 */
export const AccessListEntrySchema = z.object({
  action: z.enum(["allow", "deny"]).optional(),
  claim: z.string().optional(),
  values: z.array(z.string()).optional(),
});

/**
 * Crypto key configuration schema
 */
export const CryptoKeyConfigSchema = z.object({
  token_name: z.string().optional(),
  source: z.string().optional(),
});

/**
 * Authorization policy (gatekeeper) schema
 */
export const AuthorizationPolicySchema = z.object({
  name: z.string(),
  access_lists: z.array(AccessListEntrySchema).optional(),
  crypto_key: CryptoKeyConfigSchema.optional(),
  bypass: z.array(z.string()).optional(),
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
  identity_providers: z.array(IdentityStoreSchema).optional(),
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

export type SecurityAuthenticationHandler = z.infer<typeof SecurityAuthenticationHandlerSchema>;
export type SecurityAuthorizationHandler = z.infer<typeof SecurityAuthorizationHandlerSchema>;
export type SecurityHandler = z.infer<typeof SecurityHandlerSchema>;
export type LocalIdentityStore = z.infer<typeof LocalIdentityStoreSchema>;
export type LdapIdentityStore = z.infer<typeof LdapIdentityStoreSchema>;
export type OAuth2IdentityProvider = z.infer<typeof OAuth2IdentityProviderSchema>;
export type OidcIdentityProvider = z.infer<typeof OidcIdentityProviderSchema>;
export type IdentityStore = z.infer<typeof IdentityStoreSchema>;
export type AuthenticationPortal = z.infer<typeof AuthenticationPortalSchema>;
export type AuthorizationPolicy = z.infer<typeof AuthorizationPolicySchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type SecurityApp = z.infer<typeof SecurityAppSchema>;
