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
  type SecurityAuthenticatorHandler,
  type SecurityAuthorizationHandler,
} from "./schemas.js";
import type { CaddyRoute } from "../../types.js";

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
