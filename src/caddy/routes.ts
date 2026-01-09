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
            selection_policy: {
              policy: validated.policy,
            },
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
 * @param dial - Dial address (host:port or https://host:port)
 * @param options - Optional transport configuration
 * @returns Reverse proxy handler
 *
 * @example
 * // HTTP backend (default)
 * buildReverseProxyHandler("nginx:80")
 *
 * @example
 * // HTTPS backend with TLS
 * buildReverseProxyHandler("https://internal-service:443")
 *
 * @example
 * // HTTPS backend with custom TLS settings
 * buildReverseProxyHandler("internal-service:443", {
 *   tls: true,
 *   tlsServerName: "internal.example.com",
 *   tlsInsecureSkipVerify: false
 * })
 */
export function buildReverseProxyHandler(
  dial: DialAddress,
  options?: {
    tls?: boolean;
    tlsServerName?: string;
    tlsInsecureSkipVerify?: boolean;
    tlsTrustedCACerts?: string;
  }
): CaddyRouteHandler {
  // Auto-detect HTTPS from dial address
  const isHttps = typeof dial === "string" && dial.startsWith("https://");
  const cleanDial = isHttps ? dial.replace("https://", "") : dial;
  const useTls = options?.tls ?? isHttps;

  const handler: CaddyRouteHandler = {
    handler: "reverse_proxy",
    upstreams: [{ dial: cleanDial }],
  };

  // Build transport configuration
  if (useTls) {
    const tlsConfig: Record<string, unknown> = {};

    if (options?.tlsServerName) {
      tlsConfig.server_name = options.tlsServerName;
    }

    if (options?.tlsInsecureSkipVerify === true) {
      tlsConfig.insecure_skip_verify = true;
    }

    if (options?.tlsTrustedCACerts) {
      tlsConfig.ca = options.tlsTrustedCACerts;
    }

    handler.transport = {
      protocol: "http",
      tls: tlsConfig,
    };
  } else {
    handler.transport = {
      protocol: "http",
    };
  }

  return handler;
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
 * Supports both single account (legacy) and multiple accounts
 *
 * @param auth - Basic auth configuration
 * @returns Basic auth handler
 *
 * @example
 * // Single account (legacy)
 * buildBasicAuthHandler({
 *   enabled: true,
 *   username: "admin",
 *   passwordHash: "$2a$10$...",
 *   realm: "Admin Area"
 * })
 *
 * @example
 * // Multiple accounts (recommended)
 * buildBasicAuthHandler({
 *   enabled: true,
 *   accounts: [
 *     { username: "admin", password: "$2a$10$..." },
 *     { username: "user", password: "$2a$10$..." }
 *   ],
 *   realm: "Protected Area",
 *   hash: { algorithm: "bcrypt", cost: 10 }
 * })
 */
export function buildBasicAuthHandler(auth: BasicAuthOptions): CaddyRouteHandler {
  // Build accounts array - support both legacy and new format
  const accounts =
    auth.accounts ??
    (auth.username && auth.passwordHash
      ? [{ username: auth.username, password: auth.passwordHash }]
      : []);

  if (accounts.length === 0) {
    throw new Error(
      "Basic auth requires at least one account (username + passwordHash or accounts array)"
    );
  }

  const handler: CaddyRouteHandler = {
    handler: "authentication",
    providers: {
      http_basic: {
        accounts,
        realm: auth.realm ?? "Restricted Area",
      },
    },
  };

  // Add hash configuration if specified
  // Note: Caddy automatically detects bcrypt from the hash format ($2a$10$...)
  // The hash.algorithm field is only needed if you want to override the default
  if (auth.hash?.algorithm && auth.hash.algorithm !== "bcrypt" && handler.providers?.http_basic) {
    handler.providers.http_basic.hash = {
      algorithm: auth.hash.algorithm,
    };
  }

  return handler;
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
  statusCode?: 301 | 302 | 307 | 308;
  id?: string;
}): CaddyRoute {
  // Determine status code:
  // 1. Use explicit statusCode if provided
  // 2. Otherwise use 308 for permanent (default), 307 for temporary
  // 308/307 preserve request method (RFC 7538) - better than 301/302
  const statusCode = options.statusCode ?? (options.permanent !== false ? 308 : 307); // Default to permanent (308)

  return {
    "@id": options.id,
    match: [{ host: [options.fromHost] }],
    handle: [
      {
        handler: "static_response",
        status_code: statusCode,
        headers: {
          Location: [`https://${options.toHost}{http.request.uri}`],
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

/**
 * Build a WWW redirect route (www.example.com ↔ example.com)
 *
 * Common patterns:
 * - "www-to-domain": www.example.com → example.com
 * - "domain-to-www": example.com → www.example.com
 *
 * @param options - WWW redirect options
 * @returns Caddy route that redirects between www and non-www versions
 *
 * @example
 * // Redirect www.example.com → example.com
 * const route = buildWwwRedirect({
 *   domain: "example.com",
 *   mode: "www-to-domain",
 *   permanent: true
 * });
 *
 * @example
 * // Redirect example.com → www.example.com
 * const route = buildWwwRedirect({
 *   domain: "example.com",
 *   mode: "domain-to-www",
 *   permanent: true
 * });
 */
export function buildWwwRedirect(options: {
  domain: string;
  mode: "www-to-domain" | "domain-to-www";
  permanent?: boolean;
  priority?: number;
}): CaddyRoute {
  const { domain, mode, permanent = true, priority } = options;

  // Remove www. prefix if present to get base domain
  const baseDomain = domain.replace(/^www\./, "");

  if (mode === "www-to-domain") {
    // Redirect www.example.com → example.com
    return {
      "@id": `redirect-www-to-domain-${baseDomain}`,
      match: [
        {
          host: [`www.${baseDomain}`],
        },
      ],
      handle: [
        {
          handler: "static_response",
          status_code: permanent ? 301 : 302,
          headers: {
            Location: [`https://${baseDomain}{http.request.uri}`],
          },
        },
      ],
      terminal: true,
      ...(priority !== undefined && { priority }),
    };
  } else {
    // Redirect example.com → www.example.com
    return {
      "@id": `redirect-domain-to-www-${baseDomain}`,
      match: [
        {
          host: [baseDomain],
        },
      ],
      handle: [
        {
          handler: "static_response",
          status_code: permanent ? 301 : 302,
          headers: {
            Location: [`https://www.${baseDomain}{http.request.uri}`],
          },
        },
      ],
      terminal: true,
      ...(priority !== undefined && { priority }),
    };
  }
}

/**
 * Build a route that forwards traffic through MITMproxy for inspection
 *
 * This is a convenience function that creates a route pointing to a MITMproxy
 * instance running in reverse proxy mode. Use this to transparently intercept
 * and inspect HTTP traffic for debugging without modifying client or backend code.
 *
 * @param options - MITMproxy route configuration
 * @returns Caddy route configured to forward through MITMproxy
 *
 * @example
 * ```typescript
 * // Route traffic for api.example.com through MITMproxy
 * const route = buildMitmproxyRoute({
 *   host: "api.example.com",
 *   mitmproxyHost: "localhost",
 *   mitmproxyPort: 8080,
 * });
 * await client.addRoute("https_server", route, "api_debug");
 * ```
 *
 * @example
 * ```typescript
 * // Route with custom backend (MITMproxy forwards to this backend)
 * const route = buildMitmproxyRoute({
 *   host: "api.example.com",
 *   mitmproxyHost: "mitmproxy",
 *   mitmproxyPort: 8080,
 *   backendHost: "backend-service",
 *   backendPort: 3000,
 * });
 * ```
 */
export function buildMitmproxyRoute(options: {
  /** Host pattern to match (e.g., "api.example.com") */
  host: string;
  /** MITMproxy host (e.g., "localhost" or "mitmproxy-container") */
  mitmproxyHost: string;
  /** MITMproxy proxy port (default: 8080) */
  mitmproxyPort?: number;
  /** Backend host that MITMproxy should forward to (optional, for documentation) */
  backendHost?: string;
  /** Backend port that MITMproxy should forward to (optional, for documentation) */
  backendPort?: number;
  /** Route ID for Caddy (optional) */
  id?: string;
  /** Route priority (optional) */
  priority?: number;
}): CaddyRoute {
  const port = options.mitmproxyPort ?? 8080;
  const dial = `${options.mitmproxyHost}:${port}`;

  // Build the route using buildHostRoute
  const route = buildHostRoute({
    host: options.host,
    dial,
    priority: options.priority,
  });

  // Add ID if provided
  if (options.id) {
    route["@id"] = options.id;
  }

  return route;
}

/**
 * Create a hot-swappable route pair for enabling/disabling MITMproxy interception
 *
 * Returns both a direct route and a MITMproxy-intercepted route with the same ID.
 * Use this to easily toggle between direct and intercepted traffic at runtime.
 *
 * @param options - Configuration for the route pair
 * @returns Object with direct and proxied route configurations
 *
 * @example
 * ```typescript
 * const routes = buildMitmproxyRoutePair({
 *   host: "api.example.com",
 *   backendHost: "backend-service",
 *   backendPort: 3000,
 *   mitmproxyHost: "mitmproxy",
 *   routeId: "api_route",
 * });
 *
 * // Start with direct routing
 * await client.addRoute("https_server", routes.direct, routes.direct["@id"]);
 *
 * // Hot-swap to enable interception (no downtime)
 * await client.removeRouteById("https_server", routes.direct["@id"]);
 * await client.addRoute("https_server", routes.proxied, routes.proxied["@id"]);
 *
 * // Hot-swap back to direct (disable interception)
 * await client.removeRouteById("https_server", routes.proxied["@id"]);
 * await client.addRoute("https_server", routes.direct, routes.direct["@id"]);
 * ```
 */
export function buildMitmproxyRoutePair(options: {
  /** Host pattern to match */
  host: string;
  /** Backend service host */
  backendHost: string;
  /** Backend service port */
  backendPort: number;
  /** MITMproxy host */
  mitmproxyHost: string;
  /** MITMproxy proxy port (default: 8080) */
  mitmproxyPort?: number;
  /** Route ID (used for both routes) */
  routeId: string;
  /** Route priority (optional) */
  priority?: number;
}): {
  /** Direct route (Client → Caddy → Backend) */
  direct: CaddyRoute;
  /** Proxied route (Client → Caddy → MITMproxy → Backend) */
  proxied: CaddyRoute;
} {
  const backendDial = `${options.backendHost}:${options.backendPort}`;
  const mitmproxyPort = options.mitmproxyPort ?? 8080;

  // Build direct route
  const directRoute = buildHostRoute({
    host: options.host,
    dial: backendDial,
    priority: options.priority,
  });
  directRoute["@id"] = options.routeId;

  // Build proxied route
  const proxiedRoute = buildMitmproxyRoute({
    host: options.host,
    mitmproxyHost: options.mitmproxyHost,
    mitmproxyPort,
    backendHost: options.backendHost,
    backendPort: options.backendPort,
    id: options.routeId,
    priority: options.priority,
  });

  return {
    direct: directRoute,
    proxied: proxiedRoute,
  };
}

/**
 * Options for building an iframe-embeddable proxy route
 */
export interface IframeProxyRouteOptions {
  /** Path prefix for the route (e.g., "/panel") */
  pathPrefix: string;
  /** Upstream host to proxy to */
  upstreamHost: string;
  /** Upstream port to proxy to */
  upstreamPort: number;
  /** Route ID (optional, auto-generated from pathPrefix if not provided) */
  routeId?: string;
  /** Whether to enable iframe embedding headers (default: true) */
  iframeEmbed?: boolean;
  /** Custom Host header to send to upstream (for DNS rebinding bypass) */
  overrideHost?: string;
}

/**
 * Build a route for proxying a web UI with iframe embedding support
 *
 * This creates a route that proxies a web interface and optionally adds
 * headers to allow embedding in iframes. Can also override Host/Origin
 * headers for services with DNS rebinding protection.
 *
 * @param options - Iframe proxy route configuration
 * @returns Caddy route for iframe-embeddable proxy
 *
 * @example
 * ```typescript
 * // Proxy a web panel at /panel/* to panel-service:8080
 * const route = buildIframeProxyRoute({
 *   pathPrefix: "/panel",
 *   upstreamHost: "panel-service",
 *   upstreamPort: 8080,
 *   iframeEmbed: true,
 * });
 *
 * // Proxy with DNS rebinding bypass (e.g., for mitmweb)
 * const mitmRoute = buildIframeProxyRoute({
 *   pathPrefix: "/mitmproxy",
 *   upstreamHost: "mitmproxy",
 *   upstreamPort: 8081,
 *   overrideHost: "127.0.0.1:8081",
 * });
 * ```
 */
export function buildIframeProxyRoute(options: IframeProxyRouteOptions): CaddyRoute {
  const dial = `${options.upstreamHost}:${options.upstreamPort}`;
  const routeId = options.routeId ?? `iframe_proxy_${options.pathPrefix.replace(/\//g, "_")}`;
  const enableIframe = options.iframeEmbed !== false;

  const handlers: CaddyRouteHandler[] = [
    // Strip path prefix
    buildRewriteHandler(options.pathPrefix),
  ];

  // Add iframe-permissive headers if enabled
  if (enableIframe) {
    handlers.push(buildIframePermissiveHandler());
  }

  // Build reverse proxy handler
  const reverseProxy: CaddyRouteHandler = {
    handler: "reverse_proxy",
    transport: { protocol: "http" },
    upstreams: [{ dial }],
  } as CaddyRouteHandler;

  // Add Host/Origin override if specified (for DNS rebinding bypass)
  if (options.overrideHost) {
    (reverseProxy as Record<string, unknown>).headers = {
      request: {
        set: {
          Host: [options.overrideHost],
          Origin: [`http://${options.overrideHost}/`],
        },
      },
    };
  }

  handlers.push(reverseProxy);

  return {
    "@id": routeId,
    match: [{ path: [options.pathPrefix, `${options.pathPrefix}/*`] }],
    handle: handlers,
    terminal: true,
  };
}

/**
 * @deprecated Use buildIframeProxyRoute instead
 */
export function buildMitmproxyWebUiRoute(options: {
  pathPrefix: string;
  mitmproxyHost: string;
  mitmproxyWebPort?: number;
  routeId?: string;
  iframeEmbed?: boolean;
}): CaddyRoute {
  const webPort = options.mitmproxyWebPort ?? 8081;
  return buildIframeProxyRoute({
    pathPrefix: options.pathPrefix,
    upstreamHost: options.mitmproxyHost,
    upstreamPort: webPort,
    routeId: options.routeId,
    iframeEmbed: options.iframeEmbed,
    overrideHost: `127.0.0.1:${webPort}`,
  });
}

/**
 * Options for building a WebSocket proxy route
 */
export interface WebSocketProxyRouteOptions {
  /** WebSocket path to match (e.g., "/ws", "/updates") */
  path: string;
  /** Upstream host to proxy to */
  upstreamHost: string;
  /** Upstream port to proxy to */
  upstreamPort: number;
  /** Route ID (optional) */
  routeId?: string;
  /** Custom Host header to send to upstream (for DNS rebinding bypass) */
  overrideHost?: string;
}

/**
 * Build a route for WebSocket proxy
 *
 * This creates a route that proxies WebSocket connections to an upstream
 * service. Can optionally override Host/Origin headers for services
 * with DNS rebinding protection.
 *
 * @param options - WebSocket route configuration
 * @returns Caddy route for WebSocket proxy
 *
 * @example
 * ```typescript
 * // Simple WebSocket proxy
 * const route = buildWebSocketProxyRoute({
 *   path: "/ws",
 *   upstreamHost: "ws-server",
 *   upstreamPort: 8080,
 * });
 *
 * // WebSocket with DNS rebinding bypass
 * const mitmRoute = buildWebSocketProxyRoute({
 *   path: "/updates",
 *   upstreamHost: "mitmproxy",
 *   upstreamPort: 8081,
 *   overrideHost: "127.0.0.1:8081",
 * });
 * ```
 */
export function buildWebSocketProxyRoute(options: WebSocketProxyRouteOptions): CaddyRoute {
  const dial = `${options.upstreamHost}:${options.upstreamPort}`;
  const routeId = options.routeId ?? `ws_proxy_${options.path.replace(/\//g, "_")}`;

  const reverseProxy: Record<string, unknown> = {
    handler: "reverse_proxy",
    transport: { protocol: "http" },
    upstreams: [{ dial }],
  };

  // Add Host/Origin override if specified
  if (options.overrideHost) {
    reverseProxy.headers = {
      request: {
        set: {
          Host: [options.overrideHost],
          Origin: [`http://${options.overrideHost}/`],
        },
      },
    };
  }

  return {
    "@id": routeId,
    match: [{ path: [options.path] }],
    handle: [reverseProxy as CaddyRouteHandler],
    terminal: true,
  };
}

/**
 * @deprecated Use buildWebSocketProxyRoute instead
 */
export function buildMitmproxyWebSocketRoute(options: {
  path?: string;
  mitmproxyHost: string;
  mitmproxyWebPort?: number;
  routeId?: string;
}): CaddyRoute {
  const webPort = options.mitmproxyWebPort ?? 8081;
  return buildWebSocketProxyRoute({
    path: options.path ?? "/updates",
    upstreamHost: options.mitmproxyHost,
    upstreamPort: webPort,
    routeId: options.routeId,
    overrideHost: `127.0.0.1:${webPort}`,
  });
}

/**
 * Build a header handler that removes restrictive headers for iframe embedding
 *
 * Removes X-Frame-Options, Content-Security-Policy, and X-Xss-Protection
 * headers while adding permissive CORS and frame-ancestors headers.
 *
 * @param options - Handler options
 * @returns Headers handler for iframe embedding
 *
 * @example
 * ```typescript
 * const handler = buildIframePermissiveHandler();
 * // Use in a route's handle array
 * ```
 */
export function buildIframePermissiveHandler(options?: {
  /** Headers to delete (default: ["X-Frame-Options", "Content-Security-Policy", "X-Xss-Protection"]) */
  deleteHeaders?: string[];
  /** CORS origin (default: "*") */
  corsOrigin?: string;
}): CaddyRouteHandler {
  const deleteHeaders = options?.deleteHeaders ?? [
    "X-Frame-Options",
    "Content-Security-Policy",
    "X-Xss-Protection",
  ];
  const corsOrigin = options?.corsOrigin ?? "*";

  return {
    handler: "headers",
    response: {
      deferred: true,
      delete: deleteHeaders,
      set: {
        "Access-Control-Allow-Origin": [corsOrigin],
        "X-Frame-Options": ["ALLOWALL"],
      },
    },
  } as CaddyRouteHandler;
}

/**
 * Build a header handler for DNS rebinding bypass
 *
 * Sets Host and Origin headers to bypass MITMproxy's DNS rebinding protection.
 * Use this when proxying to MITMproxy from a different hostname.
 *
 * @param options - Handler options
 * @returns Headers handler for request modification
 *
 * @example
 * ```typescript
 * const handler = buildDnsRebindingBypassHandler({
 *   targetHost: "127.0.0.1:8081",
 * });
 * ```
 */
export function buildDnsRebindingBypassHandler(options: {
  /** Target host:port (e.g., "127.0.0.1:8081") */
  targetHost: string;
}): CaddyRouteHandler {
  return {
    handler: "headers",
    request: {
      set: {
        Host: [options.targetHost],
        Origin: [`http://${options.targetHost}/`],
      },
    },
  } as CaddyRouteHandler;
}
