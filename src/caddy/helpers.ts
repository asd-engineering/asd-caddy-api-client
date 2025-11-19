/**
 * High-level helper functions for common Caddy routing patterns
 *
 * These helpers encode .asd production patterns and best practices,
 * hiding Caddy JSON complexity behind clean, semantic APIs.
 *
 * @module caddy/helpers
 */

import type { CaddyRoute, CaddyRouteHandler } from "../types";
import { ROUTE_PRIORITIES } from "./ordering";

/**
 * Options for creating a health check route
 */
export interface HealthRouteOptions {
  /** Instance identifier (e.g., "prod-cluster-1") */
  instanceId: string;
  /** Health check path (default: "/health") */
  path?: string;
  /** Number of services in this instance */
  services?: number;
  /** Instance version */
  version?: string;
}

/**
 * Options for creating service routes
 */
export interface ServiceRouteOptions {
  /** Route identifier */
  id: string;
  /** Host to match (e.g., "api.localhost") */
  host: string;
  /** Path to match (default: "/*") */
  path?: string;
  /** Upstream backend (dial address or array of upstreams) */
  upstream: string | { dial: string }[];
  /** Service identifier for X-ASD-Service-ID header */
  serviceId?: string;
  /** Service type for X-ASD-Service-Type header */
  serviceType?: string;
  /** Enable compression (default: true) */
  enableCompression?: boolean;
  /** Additional response headers */
  headers?: Record<string, string[]>;
  /** Explicit priority (optional) */
  priority?: number;
}

/**
 * Options for creating basic auth routes
 */
export interface BasicAuthRouteOptions {
  /** Route identifier */
  id?: string;
  /** Host to match */
  host: string;
  /** Path to match (omit for domain-level auth) */
  path?: string;
  /** User accounts with bcrypt password hashes */
  accounts: { username: string; password: string }[];
  /** Upstream backend */
  upstream: string | { dial: string }[];
  /** Authentication realm */
  realm?: string;
  /** Service identifier */
  serviceId?: string;
  /** Service type */
  serviceType?: string;
  /** Additional response headers */
  headers?: Record<string, string[]>;
  /** Explicit priority (optional) */
  priority?: number;
}

/**
 * Options for creating load balancer routes
 */
export interface LoadBalancerRouteOptions {
  /** Route identifier */
  id: string;
  /** Host to match */
  host: string;
  /** Path to match (default: "/*") */
  path?: string;
  /** Array of upstream backends */
  upstreams: string[] | { dial: string }[];
  /** Load balancing policy */
  policy?: "round_robin" | "least_conn" | "ip_hash" | "first" | "random";
  /** Enable active health checks */
  healthCheck?: {
    path?: string;
    interval?: string;
    timeout?: string;
  };
  /** Service identifier */
  serviceId?: string;
  /** Additional response headers */
  headers?: Record<string, string[]>;
}

/**
 * Options for creating path rewrite routes
 */
export interface RewriteRouteOptions {
  /** Route identifier */
  id: string;
  /** Host to match */
  host: string;
  /** Path prefix to match and strip */
  pathPrefix: string;
  /** Upstream backend */
  upstream: string | { dial: string }[];
  /** Service identifier */
  serviceId?: string;
  /** Additional response headers */
  headers?: Record<string, string[]>;
}

/**
 * Create a standardized global health check route
 * Always evaluated first, accessible from any host
 *
 * @param options - Health check configuration
 * @returns Health check route with priority 0
 *
 * @example
 * const health = createHealthRoute({
 *   instanceId: "prod-cluster-1",
 *   services: 10,
 *   version: "1.0.0",
 * });
 */
export function createHealthRoute(options: HealthRouteOptions): CaddyRoute {
  const path = options.path ?? "/health";

  const body = JSON.stringify({
    status: "healthy",
    ...(options.services !== undefined && { services: options.services }),
    ...(options.version && { version: options.version }),
  });

  return {
    "@id": "global-health",
    priority: ROUTE_PRIORITIES.HEALTH,
    match: [{ path: [path] }],
    handle: [
      {
        handler: "headers",
        response: {
          set: {
            "X-ASD-Health": ["ok"],
            "X-ASD-Instance": [options.instanceId],
          },
        },
      },
      {
        handler: "static_response",
        status_code: 200,
        headers: {
          "Content-Type": ["application/json"],
        },
        body,
      },
    ],
    terminal: true,
  };
}

/**
 * Create service routes with standard security headers
 * Returns single route (no redirect in this version)
 *
 * @param options - Service configuration
 * @returns Service route
 *
 * @example
 * const route = createServiceRoute({
 *   id: "api-service",
 *   host: "api.localhost",
 *   path: "/api/*",
 *   upstream: "backend:8080",
 *   serviceId: "api-backend-v1",
 *   serviceType: "api",
 * });
 */
export function createServiceRoute(options: ServiceRouteOptions): CaddyRoute {
  const path = options.path ?? "/*";

  // Normalize upstream to array format
  const upstreams =
    typeof options.upstream === "string" ? [{ dial: options.upstream }] : options.upstream;

  // Build standard security headers
  const headers: Record<string, string[]> = {
    "X-Content-Type-Options": ["nosniff"],
    "X-Frame-Options": ["DENY"],
    ...options.headers,
  };

  if (options.serviceId) {
    headers["X-ASD-Service-ID"] = [options.serviceId];
  }

  if (options.serviceType) {
    headers["X-ASD-Service-Type"] = [options.serviceType];
  }

  const handlers: CaddyRouteHandler[] = [];

  // Add compression handler if enabled
  if (options.enableCompression !== false) {
    handlers.push({
      handler: "encode",
      encodings: {
        gzip: {},
        zstd: {},
      },
    });
  }

  // Add headers handler
  handlers.push({
    handler: "headers",
    response: {
      set: headers,
    },
  });

  // Add reverse proxy handler
  handlers.push({
    handler: "reverse_proxy",
    upstreams,
  });

  // Calculate priority if not explicit
  const priority =
    options.priority ??
    (path === "/*" ? ROUTE_PRIORITIES.WILDCARD : ROUTE_PRIORITIES.SPECIFIC_PATH);

  return {
    "@id": options.id,
    priority,
    match: [{ host: [options.host], path: [path] }],
    handle: handlers,
    terminal: true,
  };
}

/**
 * Create Basic Auth protected route (domain or path-level)
 *
 * @param options - Authentication configuration
 * @returns Auth-protected route
 *
 * @example
 * // Domain-level auth (entire domain protected)
 * const route = createBasicAuthRoute({
 *   host: "admin.localhost",
 *   accounts: [
 *     { username: "admin", password: "$2a$14$..." },
 *     { username: "superadmin", password: "$2a$14$..." },
 *   ],
 *   upstream: "admin-backend:8080",
 *   realm: "Admin Dashboard",
 * });
 *
 * @example
 * // Path-level auth (specific paths protected)
 * const route = createBasicAuthRoute({
 *   host: "api.localhost",
 *   path: "/admin/*",
 *   accounts: [{ username: "apiuser", password: "$2a$14$..." }],
 *   upstream: "api-backend:8080",
 *   realm: "API Admin",
 * });
 */
export function createBasicAuthRoute(options: BasicAuthRouteOptions): CaddyRoute {
  const id =
    options.id ??
    `auth-${options.host}${options.path ? `-${options.path.replace(/[/*]/g, "")}` : ""}`;
  const path = options.path;

  // Normalize upstream to array format
  const upstreams =
    typeof options.upstream === "string" ? [{ dial: options.upstream }] : options.upstream;

  // Build headers
  const headers: Record<string, string[]> = {
    "X-Content-Type-Options": ["nosniff"],
    "X-Frame-Options": ["DENY"],
    "X-ASD-Auth-Type": [path ? "path-level" : "domain-level"],
    ...options.headers,
  };

  if (options.serviceId) {
    headers["X-ASD-Service-ID"] = [options.serviceId];
  }

  if (options.serviceType) {
    headers["X-ASD-Service-Type"] = [options.serviceType];
  }

  // Calculate priority
  const priority =
    options.priority ?? (path ? ROUTE_PRIORITIES.AUTH_PATH : ROUTE_PRIORITIES.AUTH_DOMAIN);

  return {
    "@id": id,
    priority,
    match: [
      {
        host: [options.host],
        ...(path && { path: [path] }),
      },
    ],
    handle: [
      {
        handler: "authentication",
        providers: {
          http_basic: {
            accounts: options.accounts,
            realm: options.realm ?? "Protected Area",
          },
        },
      },
      {
        handler: "headers",
        response: {
          set: headers,
        },
      },
      {
        handler: "reverse_proxy",
        upstreams,
      },
    ],
    terminal: true,
  };
}

/**
 * Create load-balanced route with health checks
 *
 * @param options - Load balancer configuration
 * @returns Load-balanced route
 *
 * @example
 * const route = createLoadBalancerRoute({
 *   id: "api-lb",
 *   host: "api.localhost",
 *   upstreams: ["backend-1:8080", "backend-2:8080", "backend-3:8080"],
 *   policy: "round_robin",
 *   healthCheck: {
 *     path: "/health",
 *     interval: "10s",
 *     timeout: "2s",
 *   },
 * });
 */
export function createLoadBalancerRoute(options: LoadBalancerRouteOptions): CaddyRoute {
  const path = options.path ?? "/*";

  // Normalize upstreams
  const upstreams = options.upstreams.map((upstream) =>
    typeof upstream === "string" ? { dial: upstream } : upstream
  );

  // Build headers
  const headers: Record<string, string[]> = {
    "X-Content-Type-Options": ["nosniff"],
    "X-Frame-Options": ["DENY"],
    ...options.headers,
  };

  if (options.serviceId) {
    headers["X-ASD-Service-ID"] = [options.serviceId];
  }

  // Build reverse proxy config
  const reverseProxyConfig: CaddyRouteHandler = {
    handler: "reverse_proxy",
    upstreams,
  };

  // Add load balancing policy
  if (options.policy) {
    reverseProxyConfig.load_balancing = {
      selection_policy: {
        policy: options.policy,
      },
    };
  }

  // Add health checks
  if (options.healthCheck) {
    reverseProxyConfig.health_checks = {
      active: {
        path: options.healthCheck.path ?? "/health",
        interval: options.healthCheck.interval ?? "10s",
        timeout: options.healthCheck.timeout ?? "2s",
      },
    };
  }

  return {
    "@id": options.id,
    priority: ROUTE_PRIORITIES.SERVICE,
    match: [{ host: [options.host], path: [path] }],
    handle: [
      {
        handler: "headers",
        response: {
          set: headers,
        },
      },
      reverseProxyConfig,
    ],
    terminal: true,
  };
}

/**
 * Create path rewriting route
 * Strips path prefix before proxying to backend
 *
 * @param options - Rewrite configuration
 * @returns Route with path rewriting
 *
 * @example
 * const route = createRewriteRoute({
 *   id: "api-rewrite",
 *   host: "app.localhost",
 *   pathPrefix: "/api/v1",
 *   upstream: "backend:3000",
 * });
 * // Request to /api/v1/users → backend receives /users
 */
export function createRewriteRoute(options: RewriteRouteOptions): CaddyRoute {
  // Normalize upstream to array format
  const upstreams =
    typeof options.upstream === "string" ? [{ dial: options.upstream }] : options.upstream;

  // Build headers
  const headers: Record<string, string[]> = {
    "X-ASD-Path-Rewrite": ["true"],
    "X-Content-Type-Options": ["nosniff"],
    "X-Frame-Options": ["SAMEORIGIN"],
    ...options.headers,
  };

  if (options.serviceId) {
    headers["X-ASD-Service-ID"] = [options.serviceId];
  }

  return {
    "@id": options.id,
    priority: ROUTE_PRIORITIES.REWRITE,
    match: [
      {
        host: [options.host],
        path: [`${options.pathPrefix}/*`],
      },
    ],
    handle: [
      {
        handler: "rewrite",
        strip_path_prefix: options.pathPrefix,
      },
      {
        handler: "headers",
        response: {
          set: headers,
        },
      },
      {
        handler: "reverse_proxy",
        upstreams,
      },
    ],
    terminal: true,
  };
}

/**
 * Create redirect route (www ↔ domain)
 *
 * @param options - Redirect configuration
 * @returns Redirect route
 *
 * @example
 * // Redirect www.example.com → example.com
 * const route = createRedirectRoute({
 *   from: "www.example.com",
 *   to: "example.com",
 * });
 *
 * @example
 * // Redirect example.com → www.example.com
 * const route = createRedirectRoute({
 *   from: "example.com",
 *   to: "www.example.com",
 *   permanent: true, // 301 instead of 302
 * });
 */
export function createRedirectRoute(options: {
  id?: string;
  from: string;
  to: string;
  permanent?: boolean;
}): CaddyRoute {
  const statusCode = options.permanent === false ? 302 : 301;
  const id = options.id ?? `redirect-${options.from}-to-${options.to}`;

  return {
    "@id": id,
    priority: ROUTE_PRIORITIES.SERVICE,
    match: [{ host: [options.from] }],
    handle: [
      {
        handler: "static_response",
        status_code: statusCode,
        headers: {
          Location: [`https://${options.to}{http.request.uri}`],
        },
      },
    ],
    terminal: true,
  };
}
