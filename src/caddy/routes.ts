/**
 * Route builder functions for Caddy
 */
import type {
  CaddyRoute,
  CaddyRouteHandler,
  ServiceRouteOptions,
  HealthCheckRouteOptions,
  HostRouteOptions,
  PathRouteOptions,
  LoadBalancerRouteOptions,
  DialAddress,
  SecurityHeaders,
  BasicAuthOptions,
} from "../types.js";
import {
  ServiceRouteOptionsSchema,
  HealthCheckRouteOptionsSchema,
  HostRouteOptionsSchema,
  PathRouteOptionsSchema,
  LoadBalancerRouteOptionsSchema,
} from "../schemas.js";

/**
 * Build routes for a service (host-based and/or path-based)
 * @param options - Service route options
 * @returns Array of Caddy routes
 */
export function buildServiceRoutes(options: ServiceRouteOptions): CaddyRoute[] {
  const validated = ServiceRouteOptionsSchema.parse(options);
  const routes: CaddyRoute[] = [];

  // Build host-based routes
  if (validated.enableHostRoute && validated.host) {
    // Health check route (higher priority)
    routes.push(
      buildHealthCheckRoute({
        host: validated.host,
        serviceId: validated.serviceId ?? "unknown",
        priority: validated.priority !== undefined ? validated.priority + 1000 : undefined,
      })
    );

    // Main service route
    routes.push(
      buildHostRoute({
        host: validated.host,
        dial: validated.dial,
        securityHeaders: validated.securityHeaders,
        basicAuth: validated.basicAuth,
        priority: validated.priority,
      })
    );
  }

  // Build path-based routes
  if (validated.enablePathRoute && validated.path && validated.path !== "/") {
    const pathHost = validated.pathRouteHost ?? "asd.localhost";

    // Health check route (higher priority)
    routes.push(
      buildHealthCheckRoute({
        host: pathHost,
        serviceId: validated.serviceId ?? "unknown",
        priority: validated.priority !== undefined ? validated.priority + 1000 : undefined,
      })
    );

    // Main path route
    routes.push(
      buildPathRoute({
        path: validated.path,
        host: pathHost,
        dial: validated.dial,
        stripPrefix: validated.stripPrefix ?? true,
        securityHeaders: validated.securityHeaders,
        basicAuth: validated.basicAuth,
        priority: validated.priority,
      })
    );
  }

  return routes;
}

/**
 * Build a health check route
 * @param options - Health check route options
 * @returns Caddy route for health check
 */
export function buildHealthCheckRoute(options: HealthCheckRouteOptions): CaddyRoute {
  const validated = HealthCheckRouteOptionsSchema.parse(options);

  const route: CaddyRoute = {
    match: [
      {
        host: [validated.host],
        path: ["/asd/healthcheck"],
      },
    ],
    handle: [
      {
        handler: "static_response",
        body: `{"status":"ok","service":"${validated.serviceId}","timestamp":"{http.time.now.unix}"}`,
        status_code: 200,
        headers: {
          response: {
            set: {
              "Content-Type": ["application/json"],
            },
          },
        },
      },
    ],
    terminal: true,
  };

  if (validated.priority !== undefined) {
    (route as CaddyRoute & { priority: number }).priority = validated.priority;
  }

  return route;
}

/**
 * Build a host-based route
 * @param options - Host route options
 * @returns Caddy route
 */
export function buildHostRoute(options: HostRouteOptions): CaddyRoute {
  const validated = HostRouteOptionsSchema.parse(options);
  const handlers: CaddyRouteHandler[] = [];

  // Add security headers if configured
  if (validated.securityHeaders) {
    handlers.push(buildSecurityHeadersHandler(validated.securityHeaders));
  }

  // Add basic auth if configured
  if (
    validated.basicAuth?.enabled &&
    validated.basicAuth.username &&
    validated.basicAuth.passwordHash
  ) {
    handlers.push(buildBasicAuthHandler(validated.basicAuth));
  }

  // Add reverse proxy handler
  handlers.push(buildReverseProxyHandler(validated.dial));

  const route: CaddyRoute = {
    match: [
      {
        host: [validated.host],
      },
    ],
    handle: handlers,
    terminal: true,
  };

  if (validated.priority !== undefined) {
    (route as CaddyRoute & { priority: number }).priority = validated.priority;
  }

  return route;
}

/**
 * Build a path-based route
 * @param options - Path route options
 * @returns Caddy route
 */
export function buildPathRoute(options: PathRouteOptions): CaddyRoute {
  const validated = PathRouteOptionsSchema.parse(options);
  const handlers: CaddyRouteHandler[] = [];

  // Add rewrite handler if stripping prefix
  if (validated.stripPrefix) {
    handlers.push(buildRewriteHandler(validated.path));
  }

  // Add security headers if configured
  if (validated.securityHeaders) {
    handlers.push(buildSecurityHeadersHandler(validated.securityHeaders));
  }

  // Add basic auth if configured
  if (
    validated.basicAuth?.enabled &&
    validated.basicAuth.username &&
    validated.basicAuth.passwordHash
  ) {
    handlers.push(buildBasicAuthHandler(validated.basicAuth));
  }

  // Add reverse proxy handler
  handlers.push(buildReverseProxyHandler(validated.dial));

  const route: CaddyRoute = {
    match: [
      {
        host: [validated.host],
        path: [`${validated.path}*`],
      },
    ],
    handle: handlers,
    terminal: true,
  };

  if (validated.priority !== undefined) {
    (route as CaddyRoute & { priority: number }).priority = validated.priority;
  }

  return route;
}

/**
 * Build a load balancer route
 * @param options - Load balancer options
 * @returns Caddy route with load balancing
 */
export function buildLoadBalancerRoute(options: LoadBalancerRouteOptions): CaddyRoute {
  const validated = LoadBalancerRouteOptionsSchema.parse(options);

  const route: CaddyRoute = {
    match: [
      {
        host: [validated.host],
      },
    ],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: validated.upstreams.map((dial) => ({ dial })),
        transport: {
          protocol: "http",
        },
        ...(validated.policy !== "first" && {
          load_balancing: {
            policy: validated.policy,
          },
        }),
        health_checks: {
          active: {
            path: validated.healthCheckPath,
            interval: validated.healthCheckInterval,
            timeout: "5s",
            expect_status: 200,
          },
        },
      },
    ],
    terminal: true,
  };

  if (validated.priority !== undefined) {
    (route as CaddyRoute & { priority: number }).priority = validated.priority;
  }

  return route;
}

/**
 * Build a reverse proxy handler
 * @param dial - Dial address (host:port)
 * @returns Reverse proxy handler
 */
export function buildReverseProxyHandler(dial: DialAddress): CaddyRouteHandler {
  return {
    handler: "reverse_proxy",
    upstreams: [{ dial }],
    transport: {
      protocol: "http",
    },
  };
}

/**
 * Build a security headers handler
 * @param headers - Security headers configuration
 * @returns Headers handler
 */
export function buildSecurityHeadersHandler(headers: SecurityHeaders): CaddyRouteHandler {
  const responseHeaders: Record<string, string[]> = {
    "X-Frame-Options": [headers.frameOptions ?? "DENY"],
    "X-Content-Type-Options": ["nosniff"],
    "X-XSS-Protection": ["1; mode=block"],
  };

  if (headers.enableHsts) {
    responseHeaders["Strict-Transport-Security"] = [
      `max-age=${headers.hstsMaxAge ?? 31536000}; includeSubDomains`,
    ];
  }

  return {
    handler: "headers",
    headers: {
      response: {
        set: responseHeaders,
      },
    },
  };
}

/**
 * Build a basic auth handler
 * @param auth - Basic auth configuration
 * @returns Basic auth handler
 */
export function buildBasicAuthHandler(auth: BasicAuthOptions): CaddyRouteHandler {
  return {
    handler: "authentication",
    providers: {
      http_basic: {
        accounts: [
          {
            username: auth.username,
            password: auth.passwordHash,
          },
        ],
        realm: auth.realm ?? "Restricted Area",
      },
    },
  };
}

/**
 * Build a rewrite handler (strip path prefix)
 * @param prefix - Path prefix to strip
 * @returns Rewrite handler
 */
export function buildRewriteHandler(prefix: string): CaddyRouteHandler {
  return {
    handler: "rewrite",
    strip_path_prefix: prefix,
  };
}

/**
 * Build an ingress tag header handler
 * @param tag - Ingress tag value
 * @returns Headers handler
 */
export function buildIngressTagHeadersHandler(tag: string): CaddyRouteHandler {
  return {
    handler: "headers",
    headers: {
      response: {
        set: {
          "X-ASD-Ingress": [tag],
        },
      },
    },
  };
}

/**
 * Build CORS/CSP headers for iframe embedding
 * @param allowedOrigin - Allowed origin (optional, defaults to "*")
 * @returns Headers handler
 */
export function buildIframeHeadersHandler(allowedOrigin = "*"): CaddyRouteHandler {
  return {
    handler: "headers",
    headers: {
      response: {
        set: {
          "Access-Control-Allow-Origin": [allowedOrigin],
          "Access-Control-Allow-Methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
          "Access-Control-Allow-Headers": ["Content-Type", "Authorization"],
          "Content-Security-Policy": [`frame-ancestors ${allowedOrigin}`],
        },
      },
    },
  };
}

/**
 * Build a redirect route for domain redirects (www <-> non-www)
 * @param options - Redirect configuration
 * @returns Caddy route for redirect
 */
export function buildRedirectRoute(options: {
  fromHost: string;
  toHost: string;
  permanent?: boolean;
  id?: string;
}): CaddyRoute {
  const statusCode = options.permanent !== false ? 301 : 302; // Default to permanent (301)

  return {
    "@id": options.id,
    match: [{ host: [options.fromHost] }],
    handle: [
      {
        handler: "static_response",
        status_code: statusCode,
        headers: {
          response: {
            set: {
              Location: [`https://${options.toHost}{http.request.uri}`],
            },
          },
        },
      },
    ],
    terminal: true,
  };
}

/**
 * Build a compression (encode) handler
 * Supports gzip, zstd, and brotli compression
 * @param options - Compression options
 * @returns Encode handler
 */
export function buildCompressionHandler(options?: {
  gzip?: boolean;
  zstd?: boolean;
  brotli?: boolean;
}): CaddyRouteHandler {
  const encodings: Record<string, Record<string, unknown>> = {};

  // Enable gzip by default
  if (options?.gzip !== false) {
    encodings.gzip = {};
  }

  // Enable zstd by default
  if (options?.zstd !== false) {
    encodings.zstd = {};
  }

  // Brotli is opt-in
  if (options?.brotli === true) {
    encodings.br = {};
  }

  return {
    handler: "encode",
    encodings,
  };
}
