/**
 * Zod schemas for runtime validation
 */
import { z } from "zod";

// ============================================================================
// Basic Schemas
// ============================================================================

/**
 * Domain name schema
 */
export const DomainSchema = z
  .string()
  .min(1, "Domain cannot be empty")
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    "Invalid domain format"
  );

/**
 * Dial address schema (host:port format)
 */
export const DialAddressSchema = z
  .string()
  .regex(/^.+:\d+$/, "Dial address must be in host:port format");

/**
 * HTTP method schema
 */
export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

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
 * Caddy route matcher schema
 */
export const CaddyRouteMatcherSchema = z.object({
  host: z.array(z.string()).optional(),
  path: z.array(z.string()).optional(),
  method: z.array(HttpMethodSchema).optional(),
  header: z.record(z.string(), z.array(z.string())).optional(),
  query: z.record(z.string(), z.array(z.string())).optional(),
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
 * Caddy route schema
 */
export const CaddyRouteSchema = z.object({
  "@id": z.string().optional(),
  match: z.array(CaddyRouteMatcherSchema).optional(),
  handle: z.array(CaddyRouteHandlerSchema).min(1, "Route must have at least one handler"),
  terminal: z.boolean().optional(),
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
});

/**
 * Health check route options schema
 */
export const HealthCheckRouteOptionsSchema = z.object({
  host: z.string().min(1),
  serviceId: z.string().min(1),
  priority: z.number().int().optional(),
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
 * @example "10s", "1m30s", "2h45m", 5000000000
 */
export const CaddyDurationSchema = z.union([
  z.number().int(),
  z.string().regex(/^\d+(\.\d+)?(ns|us|µs|ms|s|m|h|d)$/, "Invalid Go duration format"),
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
  /** How often to flush response buffer */
  flush_interval: CaddyDurationSchema.optional(),
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
});

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
 * @throws ValidationError if validation fails
 */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed: ${JSON.stringify(result.error.errors)}`);
  }
  return result.data;
}
