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
