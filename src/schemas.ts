/**
 * Zod schemas for runtime validation
 *
 * This module provides two types of schemas:
 *
 * 1. **Generated Caddy Schemas** (from `../caddy-types.js`)
 *    - Low-level Caddy JSON config types generated from Go source
 *    - Use these for direct Caddy API interaction
 *    - Examples: configSchema, serverSchema, routeSchema
 *
 * 2. **Custom Business Logic Schemas** (defined here)
 *    - Domain-specific validation (DomainSchema, DialAddressSchema)
 *    - Route builder options (ServiceRouteOptionsSchema, etc.)
 *    - Extended Caddy types with additional features
 *
 * @example
 * ```typescript
 * // Use generated schemas for Caddy API responses
 * import { configSchema, serverSchema } from "@.../caddy-types";
 * const config = configSchema.parse(await client.getConfig());
 *
 * // Use custom schemas for business logic
 * import { AddDomainWithAutoTlsOptionsSchema } from "@.../schemas";
 * const options = AddDomainWithAutoTlsOptionsSchema.parse(userInput);
 * ```
 */
import { z } from "zod";
import { ValidationError } from "./errors.js";

// ============================================================================
// Re-exported Generated Schemas (from Caddy Go source)
// ============================================================================

/**
 * Re-export generated Caddy schemas for convenience.
 * These schemas are generated from the Caddy Go source code and provide
 * low-level validation for Caddy JSON configuration.
 *
 * For full list of generated schemas, see `./caddy-types.ts`
 */
export {
  configSchema,
  serverSchema,
  routeSchema,
  routeListSchema,
  durationSchema,
  adminConfigSchema,
  loggingSchema,
} from "./caddy-types.js";
import {
  matchProtocolSchema,
  httpMatchRemoteIpSchema as matchRemoteIpSchema,
  matchClientIpSchema,
  matchHeaderReSchema,
  httpMatchTlsSchema as matchTlsSchema,
} from "./caddy-types.js";

// ============================================================================
// Basic Schemas
// ============================================================================

/**
 * Domain name schema - validates domain name format
 *
 * @example
 * ```typescript
 * import { DomainSchema } from "@accelerated-software-development/caddy-api-client";
 *
 * // Validate domain name
 * const domain = DomainSchema.parse("api.example.com");
 *
 * // Safe parsing (doesn't throw)
 * const result = DomainSchema.safeParse(userInput);
 * if (!result.success) {
 *   console.error("Invalid domain:", result.error.message);
 * }
 * ```
 */
export const DomainSchema = z
  .string()
  .min(1, "Domain cannot be empty")
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    "Invalid domain format"
  );

/**
 * Dial address schema - validates host:port format for upstream targets
 *
 * @example
 * ```typescript
 * import { DialAddressSchema } from "@accelerated-software-development/caddy-api-client";
 *
 * // Valid addresses
 * DialAddressSchema.parse("localhost:3000");     // OK
 * DialAddressSchema.parse("192.168.1.1:8080");  // OK
 * DialAddressSchema.parse("api-server:443");     // OK
 *
 * // Invalid - missing port
 * DialAddressSchema.parse("localhost");  // throws
 * ```
 */
export const DialAddressSchema = z
  .string()
  .regex(/^.+:\d+$/, "Dial address must be in host:port format");

/**
 * HTTP method schema, for Caddy's method matcher (`match.method`).
 *
 * Real Caddy's `MatchMethod` is `[]string` -- genuinely unrestricted, not
 * an enum of standard methods. Verified via `caddy validate`: a matcher
 * with `"method": ["CONNECT", "TRACE", "PURGE"]` (two methods this schema
 * used to reject, plus a fully custom/nonstandard one) validates
 * successfully. A stricter enum here would wrongly reject legitimate
 * configs matching on CONNECT/TRACE or a custom verb.
 */
export const HttpMethodSchema = z.string();

/**
 * Frame options schema
 */
export const FrameOptionsSchema = z.enum(["DENY", "SAMEORIGIN"]);

/**
 * Redirect mode schema
 */
export const RedirectModeSchema = z.enum(["none", "www_to_domain", "domain_to_www"]);

/**
 * Redirect status code schema
 */
export const RedirectStatusCodeSchema = z.union([
  z.literal(301),
  z.literal(302),
  z.literal(307),
  z.literal(308),
]);

/**
 * TLS issuer schema
 */
export const TlsIssuerSchema = z.enum(["letsencrypt", "zerossl", "acme"]);

// ============================================================================
// Caddy JSON Config Schemas
// ============================================================================

/**
 * Query string matcher - validates URL query parameter matching
 * @example
 * ```typescript
 * import { MatchQuerySchema } from "@accelerated-software-development/caddy-api-client";
 *
 * // Match requests with specific query parameters
 * const query = MatchQuerySchema.parse({
 *   "search": ["term"],
 *   "page": ["1", "2"]
 * });
 * ```
 */
export const MatchQuerySchema = z.record(z.string(), z.array(z.string()));

/**
 * Header matcher - validates HTTP header matching
 * @example
 * ```typescript
 * import { MatchHeaderSchema } from "@accelerated-software-development/caddy-api-client";
 *
 * // Match requests with specific headers
 * const headers = MatchHeaderSchema.parse({
 *   "Content-Type": ["application/json"],
 *   "Accept": ["application/json", "text/plain"]
 * });
 * ```
 */
export const MatchHeaderSchema = z.record(z.string(), z.array(z.string()));

/**
 * Caddy route matcher schema — covers every `http.matchers.*` module
 * except `vars_regexp` (internal Caddy variable matching) and `file`
 * (`http.matchers.file`, generated in `caddy-fileserver.ts` rather than
 * `caddy-http.ts` — see `matcher-schema-consistency.test.ts`'s
 * `NON_MATCHER_HELPER_TYPES`/scope note; not yet tracked by that test).
 *
 * `protocol`, `remote_ip`, `client_ip`, `header_regexp`, and `tls` are the
 * real, correctly tygo-generated `matchProtocolSchema`/
 * `matchRemoteIpSchema`/`matchClientIpSchema`/`matchHeaderReSchema`/
 * `matchTlsSchema` from `caddy-http.zod.ts` — composed here, not
 * duplicated by hand.
 *
 * `not`, `expression`, and `path_regexp` are hand-overridden (not composed
 * from the generated `matchNotSchema`/`matchExpressionSchema`/
 * `matchPathReSchema`) because all three have custom JSON marshaling or
 * anonymous Go struct embedding that tygo's naive extraction gets wrong —
 * verified against real Caddy via `caddy validate`, not just inferred from
 * the generated struct shape:
 * - `not` (`http.matchers.not`, Go type `MatchNot`) is an array of matcher
 *   sets (each an object keyed by matcher name); the generated
 *   `matchNotSchema` is `z.object({})` (empty), reflecting Go's empty
 *   interface rather than the true custom-unmarshaled shape.
 * - `expression` (`http.matchers.expression`, Go type `MatchExpression`)
 *   is a plain CEL string; the generated `matchExpressionSchema` is
 *   `z.object({ expr, name })`, reflecting misleading Go struct fields —
 *   the doc comment explicitly says "this matcher's JSON interface is
 *   actually a string, not a struct".
 * - `path_regexp` (`http.matchers.path_regexp`, Go type `MatchPathRE`)
 *   flattens to `{ name?, pattern }` directly; the generated
 *   `matchPathReSchema` wraps it as `{ MatchRegexp: { name?, pattern } }`
 *   — an anonymous-embedding artifact (same class of bug as
 *   `caddy-dns/route53`'s wrapper, see `DEPENDENCIES.md`) — Caddy rejects
 *   the nested form with `json: unknown field "MatchRegexp"`.
 * If any of these three Go types' custom marshaling/embedding ever
 * changes, tygo/zod-to-json-schema won't catch it — re-verify with
 * `caddy validate` before trusting a regen here.
 */
export const CaddyRouteMatcherSchema = z.object({
  host: z.array(z.string()).optional(),
  path: z.array(z.string()).optional(),
  path_regexp: z
    .object({
      name: z.string().optional(),
      pattern: z.string(),
    })
    .optional(),
  method: z.array(HttpMethodSchema).optional(),
  header: MatchHeaderSchema.optional(),
  header_regexp: matchHeaderReSchema.optional(),
  query: MatchQuerySchema.optional(),
  client_ip: matchClientIpSchema.optional(),
  remote_ip: matchRemoteIpSchema.optional(),
  protocol: matchProtocolSchema.optional(),
  tls: matchTlsSchema.optional(),
  not: z.array(z.record(z.string(), z.unknown())).optional(),
  expression: z.string().optional(),
});

/**
 * Caddy route handler schema (relaxed for extensibility)
 */
export const CaddyRouteHandlerSchema: z.ZodType<{
  handler: string;
  [key: string]: unknown;
}> = z
  .object({
    handler: z.string(),
  })
  .passthrough();

/**
 * Caddy route schema - validates Caddy JSON route structure
 *
 * @example
 * ```typescript
 * import { CaddyRouteSchema } from "@accelerated-software-development/caddy-api-client";
 *
 * // Validate a route before adding to Caddy
 * const route = CaddyRouteSchema.parse({
 *   "@id": "my-api-route",
 *   match: [{ host: ["api.example.com"] }],
 *   handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "localhost:3000" }] }],
 *   terminal: true
 * });
 *
 * await client.addRoute("https_server", route);
 * ```
 */
export const CaddyRouteSchema = z.object({
  "@id": z.string().optional(),
  match: z.array(CaddyRouteMatcherSchema).optional(),
  handle: z.array(CaddyRouteHandlerSchema).min(1, "Route must have at least one handler"),
  terminal: z.boolean().optional(),
  priority: z.number().int().optional(),
});

// ============================================================================
// Client Options Schemas
// ============================================================================

/**
 * CaddyClient options schema
 */
export const CaddyClientOptionsSchema = z.object({
  adminUrl: z.string().url().optional().default("http://127.0.0.1:2019"),
  timeout: z.number().int().positive().optional().default(5000),
});

/**
 * Caddy adapter schema - valid adapters for config conversion
 *
 * Supported adapters:
 * - `caddyfile` - Native Caddyfile format (default)
 * - `json` - Raw Caddy JSON config
 * - `yaml` - YAML configuration
 * - `nginx` - Nginx configuration (requires caddy-nginx-adapter)
 * - `apache` - Apache configuration (requires caddy-apache-adapter)
 *
 * @example
 * ```typescript
 * import { CaddyAdapterSchema } from "@accelerated-software-development/caddy-api-client";
 *
 * // Validate user input before calling adapt()
 * const adapter = CaddyAdapterSchema.parse(userInput);
 * const config = await client.adapt(content, adapter);
 *
 * // Type-safe check
 * if (CaddyAdapterSchema.safeParse("caddyfile").success) {
 *   // valid adapter
 * }
 * ```
 */
export const CaddyAdapterSchema = z.enum(["caddyfile", "json", "yaml", "nginx", "apache"]);

/**
 * Adapt configuration options schema
 */
export const AdaptOptionsSchema = z.object({
  config: z.string().min(1, "Config cannot be empty"),
  adapter: CaddyAdapterSchema.optional().default("caddyfile"),
});

// ============================================================================
// Domain Management Schemas
// ============================================================================

/**
 * Security headers schema
 */
export const SecurityHeadersSchema = z.object({
  enableHsts: z.boolean().optional().default(false),
  hstsMaxAge: z.number().int().positive().optional().default(31536000),
  frameOptions: FrameOptionsSchema.optional().default("DENY"),
  enableCompression: z.boolean().optional().default(true),
});

/**
 * Add domain with auto TLS schema
 */
export const AddDomainWithAutoTlsOptionsSchema = z.object({
  domain: DomainSchema,
  target: z.string().min(1, "Target cannot be empty"),
  targetPort: z.number().int().positive().max(65535, "Port must be between 1 and 65535"),
  enableSecurityHeaders: z.boolean().optional().default(true),
  enableHsts: z.boolean().optional().default(false),
  hstsMaxAge: z.number().int().positive().optional().default(31536000),
  frameOptions: FrameOptionsSchema.optional().default("DENY"),
  enableCompression: z.boolean().optional().default(true),
  redirectMode: RedirectModeSchema.optional().default("none"),
  redirectStatusCode: RedirectStatusCodeSchema.optional().default(308),
  adminUrl: z.string().url().optional(),
});

/**
 * Add domain with custom TLS schema
 */
export const AddDomainWithTlsOptionsSchema = AddDomainWithAutoTlsOptionsSchema.extend({
  certFile: z.string().min(1, "Certificate file path cannot be empty"),
  keyFile: z.string().min(1, "Key file path cannot be empty"),
});

/**
 * Update domain schema
 */
export const UpdateDomainOptionsSchema = z.object({
  domain: DomainSchema,
  target: z.string().min(1).optional(),
  targetPort: z.number().int().positive().max(65535).optional(),
  enableSecurityHeaders: z.boolean().optional(),
  enableHsts: z.boolean().optional(),
  hstsMaxAge: z.number().int().positive().optional(),
  frameOptions: FrameOptionsSchema.optional(),
  enableCompression: z.boolean().optional(),
  redirectMode: RedirectModeSchema.optional(),
  redirectStatusCode: RedirectStatusCodeSchema.optional(),
  adminUrl: z.string().url().optional(),
});

/**
 * Delete domain schema
 */
export const DeleteDomainOptionsSchema = z.object({
  domain: DomainSchema,
  adminUrl: z.string().url().optional(),
});

// ============================================================================
// Route Builder Schemas
// ============================================================================

/**
 * Basic auth options schema
 */
export const BasicAuthOptionsSchema = z.object({
  enabled: z.boolean(),
  username: z.string().min(1).optional(),
  passwordHash: z.string().min(1).optional(),
  realm: z.string().optional(),
  routes: z.array(z.enum(["host", "path", "tunnel"])).optional(),
});

/**
 * Service route options schema
 */
export const ServiceRouteOptionsSchema = z.object({
  host: z.string().optional(),
  path: z.string().optional(),
  pathRouteHost: z.string().optional().default("asd.localhost"),
  dial: DialAddressSchema,
  serviceId: z.string().optional().default("unknown"),
  enableHostRoute: z.boolean().optional().default(true),
  enablePathRoute: z.boolean().optional().default(true),
  stripPrefix: z.boolean().optional().default(true),
  priority: z.number().int().optional().default(50),
  securityHeaders: SecurityHeadersSchema.optional(),
  basicAuth: BasicAuthOptionsSchema.optional(),
  ingressTag: z.string().nullable().optional(),
  iframeOrigin: z.string().nullable().optional(),
  deleteResponseHeaders: z.array(z.string()).optional(),
  serviceType: z.string().optional(),
  isTunnelDomain: z.boolean().optional().default(false),
  flushInterval: z.number().optional(),
  projectId: z.string().nullable().optional(),
});

/**
 * Health check route options schema
 */
export const HealthCheckRouteOptionsSchema = z.object({
  host: z.string().min(1),
  serviceId: z.string().min(1),
  priority: z.number().int().optional(),
  ingressTag: z.string().nullable().optional(),
  dial: z.string().min(1).optional(),
  projectId: z.string().nullable().optional(),
});

/**
 * Host route options schema
 */
export const HostRouteOptionsSchema = z.object({
  host: z.string().min(1),
  dial: DialAddressSchema,
  securityHeaders: SecurityHeadersSchema.optional(),
  basicAuth: BasicAuthOptionsSchema.optional(),
  priority: z.number().int().optional(),
  ingressTag: z.string().nullable().optional(),
  iframeOrigin: z.string().nullable().optional(),
  deleteResponseHeaders: z.array(z.string()).optional(),
  serviceId: z.string().optional(),
  serviceType: z.string().optional(),
  flushInterval: z.number().optional(),
  projectId: z.string().nullable().optional(),
});

/**
 * Path route options schema
 */
export const PathRouteOptionsSchema = z.object({
  path: z.string().min(1),
  host: z.string().min(1),
  dial: DialAddressSchema,
  stripPrefix: z.boolean().optional().default(true),
  securityHeaders: SecurityHeadersSchema.optional(),
  basicAuth: BasicAuthOptionsSchema.optional(),
  priority: z.number().int().optional(),
  ingressTag: z.string().nullable().optional(),
  iframeOrigin: z.string().nullable().optional(),
  deleteResponseHeaders: z.array(z.string()).optional(),
  serviceId: z.string().optional(),
  serviceType: z.string().optional(),
  flushInterval: z.number().optional(),
  projectId: z.string().nullable().optional(),
});

/**
 * Load balancer route options schema
 */
export const LoadBalancerRouteOptionsSchema = z.object({
  host: z.string().min(1),
  upstreams: z.array(DialAddressSchema).min(1, "At least one upstream is required"),
  healthCheckPath: z.string().optional().default("/health"),
  healthCheckInterval: z.string().optional().default("10s"),
  policy: z.enum(["first", "random", "least_conn", "round_robin"]).optional().default("first"),
  priority: z.number().int().optional(),
});

// ============================================================================
// Advanced Caddy Schemas (from caddy-json-types coverage)
// ============================================================================

/**
 * Caddy duration schema - accepts integer (nanoseconds) or Go duration string
 *
 * Based on Go's time.Duration format with Caddy's "d" (day) extension.
 * - Valid units: ns, us, µs, ms, s, m, h, d
 * - Supports combined units: "1h30m", "1d2h30m", "30s500ms"
 * - Supports decimals: "1.5d", "2.5h", "100.25ms"
 * - Supports negative values: "-30s", "-1.5h"
 *
 * @example
 * ```typescript
 * CaddyDurationSchema.parse("30s");      // OK
 * CaddyDurationSchema.parse("1h30m");    // OK - combined units
 * CaddyDurationSchema.parse("1.5d");     // OK - decimal
 * CaddyDurationSchema.parse("1d2h30m");  // OK - multiple units
 * CaddyDurationSchema.parse("-30s");     // OK - negative
 * CaddyDurationSchema.parse(5000000000); // OK - nanoseconds integer
 * ```
 */
export const CaddyDurationSchema = z.union([
  z.number().int(),
  // "0" is special case - valid without unit in Go
  z.literal("0"),
  z
    .string()
    .regex(
      /^-?(\d+(\.\d+)?(ns|us|µs|ms|s|m|h|d))+$/,
      "Invalid Go duration format. Use units: ns, us, µs, ms, s, m, h, d (e.g., '30s', '1h30m', '1.5d')"
    ),
]);

/**
 * Active health checks schema - monitors backend health proactively
 */
export const ActiveHealthChecksSchema = z.object({
  /** The URI (path and query) to use for health checks */
  uri: z.string().optional(),
  /** @deprecated Use 'uri' instead */
  path: z.string().optional(),
  /** Port to use if different from upstream's dial address */
  port: z.number().int().positive().max(65535).optional(),
  /** Custom headers to send with health check requests */
  headers: z.record(z.string(), z.array(z.string())).optional(),
  /** Whether to follow HTTP redirects (default: false) */
  follow_redirects: z.boolean().optional(),
  /** How frequently to perform health checks (default: 30s) */
  interval: CaddyDurationSchema.optional(),
  /** How long to wait for response before marking unhealthy (default: 5s) */
  timeout: CaddyDurationSchema.optional(),
  /** Consecutive passes before marking healthy again (default: 1) */
  passes: z.number().int().positive().optional(),
  /** Consecutive failures before marking unhealthy (default: 1) */
  fails: z.number().int().positive().optional(),
  /** Maximum response body size to download during health check */
  max_size: z.number().int().positive().optional(),
  /** Expected HTTP status code from healthy backend */
  expect_status: z.number().int().min(100).max(599).optional(),
  /** Regex pattern to match against response body */
  expect_body: z.string().optional(),
});

/**
 * Passive health checks schema - monitors proxied requests for errors
 */
export const PassiveHealthChecksSchema = z.object({
  /** How long to remember failed requests (enables passive checks when > 0) */
  fail_duration: CaddyDurationSchema.optional(),
  /** Number of failures within fail_duration to mark as down (default: 1) */
  max_fails: z.number().int().positive().optional(),
  /** Mark as down if this many concurrent requests (default: unlimited) */
  unhealthy_request_count: z.number().int().positive().optional(),
  /** HTTP status codes to consider as failures */
  unhealthy_status: z.array(z.number().int().min(100).max(599)).optional(),
  /** Count as failed if response takes at least this long */
  unhealthy_latency: CaddyDurationSchema.optional(),
});

/**
 * Combined health checks schema
 */
export const HealthChecksSchema = z.object({
  active: ActiveHealthChecksSchema.optional(),
  passive: PassiveHealthChecksSchema.optional(),
});

/**
 * Load balancing configuration schema
 */
export const LoadBalancingSchema = z.object({
  /** Selection policy for choosing backends */
  selection_policy: z
    .object({
      policy: z.enum([
        "first",
        "random",
        "least_conn",
        "round_robin",
        "ip_hash",
        "uri_hash",
        "header",
        "cookie",
      ]),
    })
    .passthrough()
    .optional(),
  /** How many times to retry selecting backends if next host is down */
  retries: z.number().int().nonnegative().optional(),
  /** How long to try selecting backends (0 = disabled) */
  try_duration: CaddyDurationSchema.optional(),
  /** How long to wait between selecting next host (default: 250ms if try_duration set) */
  try_interval: CaddyDurationSchema.optional(),
});

/**
 * Upstream configuration schema
 */
export const UpstreamSchema = z.object({
  /** Network address to dial (host:port or unix socket) */
  dial: z.string().min(1),
  /** Maximum simultaneous requests to this upstream */
  max_requests: z.number().int().positive().optional(),
});

/**
 * Header regexp matcher schema
 */
export const HeaderRegexpSchema = z.object({
  name: z.string().optional(),
  pattern: z.string(),
});

/**
 * Base route matcher schema (non-recursive fields)
 *
 * KNOWN DUPLICATION (flagged, not yet resolved): this schema and
 * {@link ExtendedRouteMatcherSchema} below duplicate {@link
 * CaddyRouteMatcherSchema} above — both now cover the same full matcher
 * set (host/path/path_regexp/method/header/header_regexp/query/
 * client_ip/remote_ip/protocol/not/expression), verified independently
 * against real Caddy. `CaddyRouteMatcherSchema` is the one actually wired
 * into `CaddyRouteSchema.match` (used by every route builder);
 * `ExtendedRouteMatcherSchema` has zero internal usages (confirmed via
 * repo-wide search) — it appears to be an earlier, more-complete attempt
 * at this same schema that was never wired in, which is exactly how
 * `CaddyRouteMatcherSchema` was able to silently drop protocol/remote_ip/
 * etc. for so long: the "more correct" version existed but nothing
 * pointed at it. Two independently hand-maintained schemas for the same
 * concept is itself a drift risk — consider aliasing this to
 * `CaddyRouteMatcherSchema` (non-breaking: `ExtendedRouteMatcherSchema`
 * is a public export, so keep the name, just stop re-deriving the shape)
 * in a follow-up.
 */
const BaseRouteMatcherSchema = z.object({
  /** Match by hostname */
  host: z.array(z.string()).optional(),
  /** Match by path */
  path: z.array(z.string()).optional(),
  /** Match by path with regex */
  path_regexp: z
    .object({
      name: z.string().optional(),
      pattern: z.string(),
    })
    .optional(),
  /** Match by HTTP method */
  method: z.array(HttpMethodSchema).optional(),
  /** Match by header values */
  header: z.record(z.string(), z.array(z.string())).optional(),
  /** Match by header with regex (header name -> pattern) */
  header_regexp: z.record(z.string(), HeaderRegexpSchema).optional(),
  /** Match by query parameters */
  query: z.record(z.string(), z.array(z.string())).optional(),
  /** Match by client IP (CIDR ranges) */
  client_ip: z
    .object({
      ranges: z.array(z.string()),
    })
    .optional(),
  /** Match by remote IP (CIDR ranges) */
  remote_ip: z
    .object({
      ranges: z.array(z.string()),
    })
    .optional(),
  /** Match by protocol (http, https, grpc) */
  protocol: z.enum(["http", "https", "grpc"]).optional(),
  /** CEL expression matcher */
  expression: z.string().optional(),
  /** Match by TLS connection state */
  tls: z
    .object({
      /**
       * Matches if the TLS handshake has completed.
       * QUIC 0-RTT early data may arrive before the handshake completes.
       * It is conventional to respond with HTTP 425 Too Early if the request
       * cannot risk being processed in this state.
       */
      handshake_complete: z.boolean().optional(),
    })
    .optional(),
  /** Match by file existence on disk */
  file: z
    .object({
      /** The file system implementation to use */
      fs: z.string().optional(),
      /** The root directory for file paths */
      root: z.string().optional(),
      /** List of files/directories to try (directories must end with /) */
      try_files: z.array(z.string()).optional(),
      /**
       * Policy for selecting a file from try_files:
       * first_exist, first_exist_fallback, smallest_size, largest_size, most_recently_modified
       */
      try_policy: z
        .enum([
          "first_exist",
          "first_exist_fallback",
          "smallest_size",
          "largest_size",
          "most_recently_modified",
        ])
        .optional(),
      /** Delimiters to split the path when trying files (e.g., [".php"]) */
      split_path: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Extended route matchers schema - covers more matcher types
 */
export const ExtendedRouteMatcherSchema: z.ZodType<
  z.infer<typeof BaseRouteMatcherSchema> & {
    not?: z.infer<typeof BaseRouteMatcherSchema>[];
  }
> = BaseRouteMatcherSchema.extend({
  /** Negate other matchers */
  not: z.array(z.lazy(() => BaseRouteMatcherSchema)).optional(),
});

/**
 * Reverse proxy handler schema with full options
 *
 * Based on local/caddy/modules/caddyhttp/reverseproxy/reverseproxy.go
 */
export const ReverseProxyHandlerSchema = z.object({
  handler: z.literal("reverse_proxy"),
  /** Static list of upstreams */
  upstreams: z.array(UpstreamSchema).optional(),
  /** Load balancing configuration */
  load_balancing: LoadBalancingSchema.optional(),
  /** Health check configuration */
  health_checks: HealthChecksSchema.optional(),
  /** Transport configuration (http, fastcgi, etc.) */
  transport: z.object({ protocol: z.string() }).passthrough().optional(),
  /**
   * Circuit breaker configuration to temporarily mark backends as unhealthy
   * based on error thresholds
   */
  circuit_breaker: z.object({ type: z.string() }).passthrough().optional(),
  /**
   * Dynamic upstream discovery (e.g., from SRV records, A records)
   * Requires source module configuration
   */
  dynamic_upstreams: z.object({ source: z.string() }).passthrough().optional(),
  /** How often to flush response buffer */
  flush_interval: CaddyDurationSchema.optional(),
  /**
   * Timeout for streaming responses (WebSocket, SSE, etc.)
   * 0 means no timeout
   */
  stream_timeout: CaddyDurationSchema.optional(),
  /**
   * Delay before closing client connection after upstream closes.
   * Allows flushing remaining data.
   */
  stream_close_delay: CaddyDurationSchema.optional(),
  /** List of trusted proxy IP ranges for X-Forwarded-* headers */
  trusted_proxies: z.array(z.string()).optional(),
  /** Request buffer limit in bytes */
  request_buffers: z.number().int().nonnegative().optional(),
  /** Response buffer limit in bytes */
  response_buffers: z.number().int().nonnegative().optional(),
  /** Headers to add/set/delete on requests */
  headers: z
    .object({
      request: z
        .object({
          add: z.record(z.string(), z.array(z.string())).optional(),
          set: z.record(z.string(), z.array(z.string())).optional(),
          delete: z.array(z.string()).optional(),
        })
        .optional(),
      response: z
        .object({
          add: z.record(z.string(), z.array(z.string())).optional(),
          set: z.record(z.string(), z.array(z.string())).optional(),
          delete: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  /**
   * Rewrite the request before proxying (URI, path, query)
   */
  rewrite: z
    .object({
      uri: z.string().optional(),
      strip_path_prefix: z.string().optional(),
      strip_path_suffix: z.string().optional(),
    })
    .passthrough()
    .optional(),
  /**
   * Response handlers for intercepting and modifying upstream responses
   * Commonly used for custom error pages or response transformation
   */
  handle_response: z
    .array(
      z
        .object({
          /** Match specific response status codes */
          match: z
            .object({
              status_code: z.array(z.number().int()).optional(),
            })
            .passthrough()
            .optional(),
          /** Routes to handle matched responses */
          routes: z.array(z.any()).optional(),
        })
        .passthrough()
    )
    .optional(),
  /** Enable verbose debug logging for this handler */
  verbose_logs: z.boolean().optional(),
});

/**
 * Headers handler schema - set/modify request/response headers
 *
 * @example
 * ```typescript
 * const handler = HeadersHandlerSchema.parse({
 *   handler: "headers",
 *   response: {
 *     set: { "X-Frame-Options": ["DENY"] },
 *     delete: ["Server"],
 *   },
 * });
 * ```
 */
export const HeadersHandlerSchema = z.object({
  handler: z.literal("headers"),
  response: z
    .object({
      deferred: z.boolean().optional(),
      set: z.record(z.string(), z.array(z.string())).optional(),
      add: z.record(z.string(), z.array(z.string())).optional(),
      delete: z.array(z.string()).optional(),
    })
    .optional(),
  request: z
    .object({
      set: z.record(z.string(), z.array(z.string())).optional(),
      add: z.record(z.string(), z.array(z.string())).optional(),
      delete: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Static response handler schema - return static content
 *
 * @example
 * ```typescript
 * const healthCheck = StaticResponseHandlerSchema.parse({
 *   handler: "static_response",
 *   status_code: 200,
 *   body: '{"status":"ok"}',
 *   headers: { "Content-Type": ["application/json"] },
 * });
 * ```
 */
export const StaticResponseHandlerSchema = z.object({
  handler: z.literal("static_response"),
  status_code: z.union([z.number().int().min(100).max(599), z.string()]).optional(),
  body: z.string().optional(),
  headers: z.record(z.string(), z.array(z.string())).optional(),
  close: z.boolean().optional(),
  abort: z.boolean().optional(),
});

/**
 * Authentication handler schema - HTTP basic auth
 *
 * @example
 * ```typescript
 * const authHandler = AuthenticationHandlerSchema.parse({
 *   handler: "authentication",
 *   providers: {
 *     http_basic: {
 *       accounts: [{ username: "admin", password: "$2a$..." }],
 *       realm: "Admin Area",
 *     },
 *   },
 * });
 * ```
 */
export const AuthenticationHandlerSchema = z.object({
  handler: z.literal("authentication"),
  providers: z
    .object({
      http_basic: z
        .object({
          accounts: z
            .array(
              z.object({
                username: z.string(),
                password: z.string(),
              })
            )
            .optional(),
          realm: z.string().optional(),
          hash: z
            .object({
              algorithm: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Rewrite handler schema - URI rewriting
 *
 * @example
 * ```typescript
 * const rewrite = RewriteHandlerSchema.parse({
 *   handler: "rewrite",
 *   strip_path_prefix: "/api",
 * });
 * ```
 */
export const RewriteHandlerSchema = z.object({
  handler: z.literal("rewrite"),
  uri: z.string().optional(),
  strip_path_prefix: z.string().optional(),
  strip_path_suffix: z.string().optional(),
  uri_substring: z
    .array(
      z.object({
        find: z.string(),
        replace: z.string(),
        limit: z.number().int().optional(),
      })
    )
    .optional(),
});

/**
 * Encode handler schema - response compression
 *
 * @example
 * ```typescript
 * const compression = EncodeHandlerSchema.parse({
 *   handler: "encode",
 *   encodings: { gzip: {}, zstd: {} },
 * });
 * ```
 */
export const EncodeHandlerSchema = z.object({
  handler: z.literal("encode"),
  encodings: z
    .object({
      gzip: z.object({}).passthrough().optional(),
      zstd: z.object({}).passthrough().optional(),
      br: z.object({}).passthrough().optional(),
    })
    .passthrough()
    .optional(),
  prefer: z.array(z.string()).optional(),
  minimum_length: z.number().int().positive().optional(),
});

// ============================================================================
// Generated Handler Schemas (from Caddy Go source via tygo + ts-to-zod)
// ============================================================================

import { fileServerSchema } from "./generated/caddy-fileserver.zod.js";
import { templatesSchema } from "./generated/caddy-templates.zod.js";
import { handlerSchema as mapHandlerBaseSchema } from "./generated/caddy-map.zod.js";
import { handlerSchema as pushHandlerBaseSchema } from "./generated/caddy-push.zod.js";
import { requestBodySchema } from "./generated/caddy-requestbody.zod.js";
import { interceptSchema } from "./generated/caddy-intercept.zod.js";
import { tracingSchema } from "./generated/caddy-tracing.zod.js";
import { logAppendSchema } from "./generated/caddy-logging.zod.js";
import { invokeSchema, staticErrorSchema } from "./generated/caddy-http.zod.js";
import {
  copyResponseHandlerSchema,
  copyResponseHeadersHandlerSchema,
} from "./generated/caddy-reverseproxy.zod.js";

// Plugin schemas
import { SecurityAuthenticatorHandlerSchema } from "./plugins/caddy-security/schemas.js";

/**
 * File server handler schema - serves static files from disk
 *
 * @example
 * ```typescript
 * const handler = FileServerHandlerSchema.parse({
 *   handler: "file_server",
 *   root: "/var/www/html",
 *   index_names: ["index.html", "index.htm"],
 *   browse: { template_file: "/browse.html" },
 *   hide: [".git", ".env", "*.secret"],
 *   precompressed: { gzip: {}, br: {} }
 * });
 * ```
 */
export const FileServerHandlerSchema = fileServerSchema.extend({
  handler: z.literal("file_server"),
});

/**
 * Templates handler schema - server-side template rendering
 *
 * @example
 * ```typescript
 * const handler = TemplatesHandlerSchema.parse({
 *   handler: "templates",
 *   file_root: "/var/www/templates",
 *   mime_types: ["text/html", "text/plain"],
 *   delimiters: ["{{", "}}"]
 * });
 * ```
 */
export const TemplatesHandlerSchema = templatesSchema.extend({
  handler: z.literal("templates"),
});

/**
 * Map handler schema - variable mapping middleware
 *
 * Maps request values to variables for use in subsequent handlers.
 *
 * @example
 * ```typescript
 * const handler = MapHandlerSchema.parse({
 *   handler: "map",
 *   source: "{http.request.uri.path}",
 *   destinations: ["{my_var}"],
 *   mappings: [
 *     { input: "/api/*", outputs: ["api"] },
 *     { input: "/admin/*", outputs: ["admin"] }
 *   ],
 *   defaults: ["default"]
 * });
 * ```
 */
export const MapHandlerSchema = mapHandlerBaseSchema.extend({
  handler: z.literal("map"),
});

/**
 * Push handler schema - HTTP/2 Server Push
 *
 * Preemptively sends resources to clients over HTTP/2 before they're requested.
 *
 * @example
 * ```typescript
 * const handler = PushHandlerSchema.parse({
 *   handler: "push",
 *   resources: [
 *     { target: "/css/style.css" },
 *     { target: "/js/app.js", method: "GET" }
 *   ],
 *   headers: { "X-Push": ["true"] }
 * });
 * ```
 */
export const PushHandlerSchema = pushHandlerBaseSchema.extend({
  handler: z.literal("push"),
});

/**
 * Request body handler schema - request body handling/limits
 *
 * Controls request body reading, buffering, and size limits.
 *
 * @example
 * ```typescript
 * const handler = RequestBodyHandlerSchema.parse({
 *   handler: "request_body",
 *   max_size: 10485760 // 10MB limit
 * });
 * ```
 */
export const RequestBodyHandlerSchema = requestBodySchema.extend({
  handler: z.literal("request_body"),
});

/**
 * Vars handler schema - set request variables
 *
 * Sets arbitrary key-value pairs as request variables available to subsequent handlers.
 *
 * @example
 * ```typescript
 * const handler = VarsHandlerSchema.parse({
 *   handler: "vars",
 *   root: "/var/www",
 *   backend: "api-server",
 *   environment: "production"
 * });
 * ```
 */
export const VarsHandlerSchema = z
  .object({
    handler: z.literal("vars"),
  })
  .passthrough();

/**
 * Intercept handler schema - response interception
 *
 * Intercepts responses from upstream handlers to modify or replace them.
 *
 * @example
 * ```typescript
 * const handler = InterceptHandlerSchema.parse({
 *   handler: "intercept",
 *   handle_response: [
 *     {
 *       match: { status_code: [404] },
 *       routes: [{ handle: [{ handler: "static_response", body: "Not Found" }] }]
 *     }
 *   ]
 * });
 * ```
 */
export const InterceptHandlerSchema = interceptSchema.extend({
  handler: z.literal("intercept"),
});

/**
 * Invoke handler schema - invoke named route
 *
 * Invokes a named route defined elsewhere in the Caddy configuration.
 *
 * @example
 * ```typescript
 * const handler = InvokeHandlerSchema.parse({
 *   handler: "invoke",
 *   name: "my-named-route"
 * });
 * ```
 */
export const InvokeHandlerSchema = invokeSchema.extend({
  handler: z.literal("invoke"),
});

/**
 * Tracing handler schema - distributed tracing
 *
 * Enables distributed tracing (OpenTelemetry) for requests.
 *
 * @example
 * ```typescript
 * const handler = TracingHandlerSchema.parse({
 *   handler: "tracing",
 *   span: "http.request"
 * });
 * ```
 */
export const TracingHandlerSchema = tracingSchema.extend({
  handler: z.literal("tracing"),
});

/**
 * Log append handler schema - add fields to access log
 *
 * Appends custom key-value pairs to the structured access log entry.
 *
 * @example
 * ```typescript
 * const handler = LogAppendHandlerSchema.parse({
 *   handler: "log_append",
 *   key: "request_id",
 *   value: "{http.request.header.X-Request-ID}"
 * });
 * ```
 */
export const LogAppendHandlerSchema = logAppendSchema.extend({
  handler: z.literal("log_append"),
});

/**
 * Error handler schema - static error response
 *
 * Returns an error response with a specified status code and message.
 * Use this to trigger Caddy's error handling for custom error pages.
 *
 * @example
 * ```typescript
 * const handler = ErrorHandlerSchema.parse({
 *   handler: "error",
 *   error: "Resource not found",
 *   status_code: "404"  // Note: status_code is a string (WeakString)
 * });
 * ```
 */
export const ErrorHandlerSchema = staticErrorSchema.extend({
  handler: z.literal("error"),
});

/**
 * Copy response handler schema - copy response from subrequest
 *
 * Copies the response body from a reverse proxy subrequest.
 * Used in intercept handler routes to forward upstream responses.
 *
 * @example
 * ```typescript
 * const handler = CopyResponseHandlerSchema.parse({
 *   handler: "copy_response",
 *   status_code: 200
 * });
 * ```
 */
export const CopyResponseHandlerSchema = copyResponseHandlerSchema.extend({
  handler: z.literal("copy_response"),
});

/**
 * Copy response headers handler schema - copy headers from subrequest
 *
 * Copies response headers from a reverse proxy subrequest.
 * Can include or exclude specific headers.
 *
 * @example
 * ```typescript
 * const handler = CopyResponseHeadersHandlerSchema.parse({
 *   handler: "copy_response_headers",
 *   include: ["Content-Type", "X-Custom-*"],
 *   exclude: ["Set-Cookie"]
 * });
 * ```
 */
export const CopyResponseHeadersHandlerSchema = copyResponseHeadersHandlerSchema.extend({
  handler: z.literal("copy_response_headers"),
});

/**
 * Subroute handler schema - nested route handling
 *
 * Groups routes together for organization and conditional execution.
 * Commonly used for path-prefixed sections or error handling.
 *
 * @example
 * ```typescript
 * const handler = SubrouteHandlerSchema.parse({
 *   handler: "subroute",
 *   routes: [
 *     {
 *       match: [{ path: ["/api/*"] }],
 *       handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "localhost:3000" }] }]
 *     },
 *     {
 *       handle: [{ handler: "static_response", status_code: 404 }]
 *     }
 *   ]
 * });
 * ```
 */
export const SubrouteHandlerSchema = z.object({
  handler: z.literal("subroute"),
  routes: z.array(z.lazy(() => CaddyRouteSchema)).optional(),
  errors: z.any().optional(),
});

/**
 * Known handler schemas with specific validation - uses discriminated union
 * for efficient parsing based on the `handler` field
 *
 * Includes:
 * - 20 core Caddy handlers
 * - Plugin handlers (caddy-security authenticator)
 *
 * Note: caddy-security's SecurityAuthorizationHandler uses handler: "authentication"
 * which is Caddy's core AuthenticationHandler with the "authorizer" provider.
 * It's not in this union since it shares the discriminator - use AuthenticationHandlerSchema.
 */
export const KnownCaddyHandlerSchema = z.discriminatedUnion("handler", [
  // Core Caddy handlers
  ReverseProxyHandlerSchema,
  HeadersHandlerSchema,
  StaticResponseHandlerSchema,
  AuthenticationHandlerSchema,
  RewriteHandlerSchema,
  EncodeHandlerSchema,
  FileServerHandlerSchema,
  TemplatesHandlerSchema,
  MapHandlerSchema,
  PushHandlerSchema,
  RequestBodyHandlerSchema,
  VarsHandlerSchema,
  InterceptHandlerSchema,
  InvokeHandlerSchema,
  TracingHandlerSchema,
  LogAppendHandlerSchema,
  ErrorHandlerSchema,
  CopyResponseHandlerSchema,
  CopyResponseHeadersHandlerSchema,
  SubrouteHandlerSchema,
  // Plugin handlers (caddy-security)
  // SecurityAuthenticatorHandler: Portal handler with unique handler: "authenticator"
  SecurityAuthenticatorHandlerSchema,
]);

/**
 * Combined handler schema - validates known handlers strictly,
 * allows unknown handlers through for extensibility
 *
 * @example
 * ```typescript
 * // Known handler - validated strictly
 * CaddyHandlerSchema.parse({ handler: "headers", response: { set: {...} } });
 *
 * // Unknown handler - passes through fallback validation
 * CaddyHandlerSchema.parse({ handler: "custom_plugin", config: {...} });
 * ```
 */
export const CaddyHandlerSchema = z.union([
  KnownCaddyHandlerSchema,
  CaddyRouteHandlerSchema, // Fallback for unknown/custom handlers
]);

// Handler types inferred from schemas
export type HeadersHandler = z.infer<typeof HeadersHandlerSchema>;
export type StaticResponseHandler = z.infer<typeof StaticResponseHandlerSchema>;
export type AuthenticationHandler = z.infer<typeof AuthenticationHandlerSchema>;
export type RewriteHandler = z.infer<typeof RewriteHandlerSchema>;
export type EncodeHandler = z.infer<typeof EncodeHandlerSchema>;
export type FileServerHandler = z.infer<typeof FileServerHandlerSchema>;
export type TemplatesHandler = z.infer<typeof TemplatesHandlerSchema>;
export type MapHandler = z.infer<typeof MapHandlerSchema>;
export type PushHandler = z.infer<typeof PushHandlerSchema>;
export type RequestBodyHandler = z.infer<typeof RequestBodyHandlerSchema>;
export type VarsHandler = z.infer<typeof VarsHandlerSchema>;
export type InterceptHandler = z.infer<typeof InterceptHandlerSchema>;
export type InvokeHandler = z.infer<typeof InvokeHandlerSchema>;
export type TracingHandler = z.infer<typeof TracingHandlerSchema>;
export type LogAppendHandler = z.infer<typeof LogAppendHandlerSchema>;
export type ErrorHandler = z.infer<typeof ErrorHandlerSchema>;
export type CopyResponseHandler = z.infer<typeof CopyResponseHandlerSchema>;
export type CopyResponseHeadersHandler = z.infer<typeof CopyResponseHeadersHandlerSchema>;
export type SubrouteHandler = z.infer<typeof SubrouteHandlerSchema>;

// ============================================================================
// Caddy Admin API Response Schemas
// ============================================================================

/**
 * Upstream server status schema - validates response from /reverse_proxy/upstreams endpoint
 *
 * @example
 * ```typescript
 * import { UpstreamStatusSchema } from "@accelerated-software-development/caddy-api-client";
 *
 * // Get and validate upstream status
 * const upstreams = await client.getUpstreams();
 *
 * // Check for unhealthy upstreams
 * const unhealthy = upstreams.filter(u => !u.healthy);
 * if (unhealthy.length > 0) {
 *   console.warn("Unhealthy upstreams:", unhealthy.map(u => u.address));
 * }
 * ```
 */
export const UpstreamStatusSchema = z.object({
  /** Upstream address (host:port) */
  address: z.string(),
  /** Number of active requests */
  num_requests: z.number(),
  /** Number of failed health checks */
  fails: z.number(),
  /** Whether the upstream is currently healthy */
  healthy: z.boolean(),
});

/**
 * Array of upstream status objects
 */
export const UpstreamStatusArraySchema = z.array(UpstreamStatusSchema);

// ============================================================================
// MITMProxy Schemas
// ============================================================================

/**
 * Mitmweb options schema
 */
export const MitmwebOptionsSchema = z.object({
  webPort: z.number().int().positive().max(65535).optional().default(8081),
  proxyPort: z.number().int().positive().max(65535).optional().default(8080),
  listenAddress: z.string().optional().default("127.0.0.1"),
  openBrowser: z.boolean().optional().default(true),
  scripts: z.array(z.string()).optional(),
  workingDir: z.string().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate and parse data with a schema
 * @param schema - Zod schema
 * @param data - Data to validate
 * @returns Parsed and validated data
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * import { validate, DomainSchema } from "@accelerated-software-development/caddy-api-client";
 *
 * try {
 *   const domain = validate(DomainSchema, userInput);
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.error("Invalid input:", error.errors);
 *   }
 * }
 * ```
 */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(`Validation failed: ${result.error.message}`, result.error.errors);
  }
  return result.data;
}
