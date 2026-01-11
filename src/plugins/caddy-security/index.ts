/**
 * caddy-security plugin integration
 *
 * Provides types, schemas, and builders for the caddy-security plugin,
 * enabling type-safe authentication and authorization configurations.
 *
 * @see https://github.com/greenpau/caddy-security
 * @see https://docs.authcrunch.com
 *
 * @example
 * ```typescript
 * import {
 *   buildAuthenticationHandler,
 *   buildAuthorizationHandler,
 *   buildProtectedRoute,
 *   SecurityAuthenticationHandlerSchema,
 * } from "@accelerated-software-development/caddy-api-client/plugins/caddy-security";
 *
 * // Build handlers with validation
 * const authHandler = buildAuthenticationHandler({ portalName: "myportal" });
 * const authzHandler = buildAuthorizationHandler({ gatekeeperName: "mypolicy" });
 *
 * // Or build complete protected routes
 * const protectedRoute = buildProtectedRoute({
 *   hosts: ["api.example.com"],
 *   gatekeeperName: "api-policy",
 *   dial: "localhost:3000",
 * });
 * ```
 *
 * @packageDocumentation
 */

// Types (re-export from both sources for flexibility)
export type {
  SecurityAuthenticationHandler,
  SecurityAuthorizationHandler,
  SecurityHandler,
  SecurityApp,
  SecurityConfig,
  AuthenticationPortal,
  AuthorizationPolicy,
  IdentityStore,
  LocalIdentityStore,
  LdapIdentityStore,
  OAuth2IdentityProvider,
  OidcIdentityProvider,
} from "./types.js";

// Schemas
export {
  SecurityAuthenticationHandlerSchema,
  SecurityAuthorizationHandlerSchema,
  SecurityHandlerSchema,
  SecurityAppSchema,
  SecurityConfigSchema,
  AuthenticationPortalSchema,
  AuthorizationPolicySchema,
  IdentityStoreSchema,
  LocalIdentityStoreSchema,
  LdapIdentityStoreSchema,
  OAuth2IdentityProviderSchema,
  OidcIdentityProviderSchema,
} from "./schemas.js";

// Builders
export {
  buildAuthenticationHandler,
  buildAuthorizationHandler,
  buildAuthenticationRoute,
  buildProtectedRoute,
  type BuildAuthenticationHandlerOptions,
  type BuildAuthorizationHandlerOptions,
  type BuildAuthenticationRouteOptions,
  type BuildProtectedRouteOptions,
} from "./builders.js";
