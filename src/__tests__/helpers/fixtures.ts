/**
 * Test fixtures and data builders
 * Provides standard test data to reduce duplication
 */

import type { CaddyRoute } from "../../types";

/**
 * Standard test credentials with bcrypt hashes
 * Passwords are hashed with cost=14 for production-like security
 */
export const TEST_CREDENTIALS = {
  admin: {
    username: "admin",
    password: "admin123",
    // Hash of "admin123"
    hash: "$2a$14$lVk5aohGe.EmndSm6H1uJeOI/lOcaTHoJYSk/8dn1DDsW5NbNqVLW",
  },
  superadmin: {
    username: "superadmin",
    password: "admin123",
    // Same hash (same password)
    hash: "$2a$14$lVk5aohGe.EmndSm6H1uJeOI/lOcaTHoJYSk/8dn1DDsW5NbNqVLW",
  },
  apiUser: {
    username: "apiuser",
    password: "apipass",
    // Hash of "apipass"
    hash: "$2a$14$6bYQvFSJUbyRLQ3vjnjBWu1ea6Sj3GiJAcp4vaVXF0NtuNhhs7.x.",
  },
} as const;

/**
 * Standard test upstream backends
 * Maps to Docker Compose echo services
 */
export const TEST_UPSTREAMS = {
  backend1: "echo-test:5678",
  backend2: "echo-test-2:5679",
  backend3: "echo-test-3:5680",
} as const;

/**
 * Standard test domains
 */
export const TEST_DOMAINS = {
  studio: "studio.localhost",
  api: "api.localhost",
  admin: "admin.localhost",
  db: "db.localhost",
  metrics: "metrics.localhost",
  public: "public.localhost",
  rewrite: "rewrite.localhost",
  httpsBackend: "https-backend.localhost",
} as const;

/**
 * Build test route with sensible defaults
 * Useful for quickly creating routes in tests
 *
 * @param overrides - Properties to override
 * @returns Complete CaddyRoute object
 *
 * @example
 * const route = buildTestRoute({
 *   "@id": "api-route",
 *   match: [{ host: ["api.localhost"], path: ["/users/*"] }],
 * });
 */
export function buildTestRoute(overrides: Partial<CaddyRoute> = {}): CaddyRoute {
  return {
    "@id": "test-route",
    match: [{ host: ["test.localhost"], path: ["/*"] }],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: TEST_UPSTREAMS.backend1 }],
      },
    ],
    terminal: true,
    ...overrides,
  };
}

/**
 * Build health check route with standard format
 *
 * @param instanceId - Instance identifier
 * @param services - Optional service count
 * @returns Health check route
 *
 * @example
 * const health = buildHealthRoute("prod-cluster-1", 10);
 */
export function buildHealthRoute(instanceId: string, services?: number): CaddyRoute {
  const body = JSON.stringify({
    status: "healthy",
    ...(services !== undefined && { services }),
    version: "1.0.0",
  });

  return {
    "@id": "global-health",
    priority: 0, // Always first
    match: [{ path: ["/health"] }],
    handle: [
      {
        handler: "headers",
        response: {
          set: {
            "X-ASD-Health": ["ok"],
            "X-ASD-Instance": [instanceId],
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
 * Build reverse proxy route with standard headers
 *
 * @param options - Route configuration
 * @returns Reverse proxy route
 *
 * @example
 * const route = buildProxyRoute({
 *   id: "api-service",
 *   host: "api.localhost",
 *   upstream: TEST_UPSTREAMS.backend1,
 *   serviceId: "api-backend-v1",
 *   serviceType: "api",
 * });
 */
export function buildProxyRoute(options: {
  id: string;
  host: string;
  path?: string;
  upstream: string;
  serviceId?: string;
  serviceType?: string;
  headers?: Record<string, string[]>;
}): CaddyRoute {
  const defaultHeaders: Record<string, string[]> = {
    "X-Content-Type-Options": ["nosniff"],
    "X-Frame-Options": ["DENY"],
  };

  if (options.serviceId) {
    defaultHeaders["X-ASD-Service-ID"] = [options.serviceId];
  }

  if (options.serviceType) {
    defaultHeaders["X-ASD-Service-Type"] = [options.serviceType];
  }

  return {
    "@id": options.id,
    match: [
      {
        host: [options.host],
        ...(options.path && { path: [options.path] }),
      },
    ],
    handle: [
      {
        handler: "headers",
        response: {
          set: {
            ...defaultHeaders,
            ...options.headers,
          },
        },
      },
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: options.upstream }],
      },
    ],
    terminal: true,
  };
}

/**
 * Build Basic Auth route
 *
 * @param options - Auth route configuration
 * @returns Auth-protected route
 *
 * @example
 * const route = buildAuthRoute({
 *   id: "admin-dashboard",
 *   host: "admin.localhost",
 *   upstream: TEST_UPSTREAMS.backend1,
 *   accounts: [TEST_CREDENTIALS.admin],
 *   realm: "Admin Dashboard",
 * });
 */
export function buildAuthRoute(options: {
  id: string;
  host: string;
  path?: string;
  upstream: string;
  accounts: { username: string; password: string }[];
  realm?: string;
  serviceId?: string;
  serviceType?: string;
}): CaddyRoute {
  const headers: Record<string, string[]> = {
    "X-Content-Type-Options": ["nosniff"],
    "X-Frame-Options": ["DENY"],
    "X-ASD-Auth-Type": [options.path ? "path-level" : "domain-level"],
  };

  if (options.serviceId) {
    headers["X-ASD-Service-ID"] = [options.serviceId];
  }

  if (options.serviceType) {
    headers["X-ASD-Service-Type"] = [options.serviceType];
  }

  return {
    "@id": options.id,
    match: [
      {
        host: [options.host],
        ...(options.path && { path: [options.path] }),
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
        upstreams: [{ dial: options.upstream }],
      },
    ],
    terminal: true,
  };
}

/**
 * Build load balancer route
 *
 * @param options - Load balancer configuration
 * @returns Load-balanced route
 *
 * @example
 * const route = buildLoadBalancerRoute({
 *   id: "api-lb",
 *   host: "api.localhost",
 *   upstreams: [
 *     TEST_UPSTREAMS.backend1,
 *     TEST_UPSTREAMS.backend2,
 *     TEST_UPSTREAMS.backend3,
 *   ],
 *   policy: "round_robin",
 * });
 */
export function buildLoadBalancerRoute(options: {
  id: string;
  host: string;
  path?: string;
  upstreams: string[];
  policy?: "round_robin" | "least_conn" | "ip_hash";
  healthCheck?: boolean;
}): CaddyRoute {
  return {
    "@id": options.id,
    match: [
      {
        host: [options.host],
        ...(options.path && { path: [options.path] }),
      },
    ],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: options.upstreams.map((dial) => ({ dial })),
        load_balancing: {
          selection_policy: {
            policy: options.policy ?? "round_robin",
          },
        },
        ...(options.healthCheck && {
          health_checks: {
            active: {
              path: "/health",
              interval: "10s",
              timeout: "2s",
            },
          },
        }),
      },
    ],
    terminal: true,
  };
}

/**
 * Build path rewrite route
 *
 * @param options - Rewrite configuration
 * @returns Route with path rewriting
 *
 * @example
 * const route = buildRewriteRoute({
 *   id: "api-rewrite",
 *   host: "api.localhost",
 *   pathPrefix: "/backend-service",
 *   upstream: TEST_UPSTREAMS.backend1,
 * });
 */
export function buildRewriteRoute(options: {
  id: string;
  host: string;
  pathPrefix: string;
  upstream: string;
}): CaddyRoute {
  return {
    "@id": options.id,
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
          set: {
            "X-ASD-Path-Rewrite": ["true"],
            "X-Content-Type-Options": ["nosniff"],
          },
        },
      },
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: options.upstream }],
      },
    ],
    terminal: true,
  };
}
