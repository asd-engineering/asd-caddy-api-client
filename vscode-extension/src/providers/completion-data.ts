/**
 * Pure completion data for CaddyCompletionProvider -- deliberately has no
 * `vscode` import, so it can be unit-tested directly (see
 * src/__tests__/completion-data-consistency.test.ts in the main package,
 * which cross-references this data against the real Zod/generated Caddy
 * schemas to catch drift like the CONNECT/TRACE HTTP_METHODS gap that
 * prompted splitting this out).
 */

/** Root-level route properties */
export const ROUTE_PROPERTIES: Array<{ name: string; description: string }> = [
  { name: "@id", description: "Unique identifier for this route (used for API operations)" },
  { name: "match", description: "Array of matchers that determine when this route applies" },
  { name: "handle", description: "Array of handlers to execute when route matches" },
  { name: "terminal", description: "If true, no more routes will be evaluated after this one" },
  { name: "priority", description: "Route evaluation order (lower values = higher priority)" },
];

/** Match object properties -- keep in sync with CaddyRouteMatcherSchema (main package src/schemas.ts) */
export const MATCH_PROPERTIES: Array<{ name: string; description: string }> = [
  { name: "host", description: "Match requests by hostname(s)" },
  { name: "path", description: "Match requests by path pattern(s)" },
  { name: "path_regexp", description: "Match requests by path using a regular expression" },
  { name: "method", description: "Match requests by HTTP method(s)" },
  { name: "header", description: "Match requests by header value(s)" },
  {
    name: "header_regexp",
    description: "Match requests by header value using a regular expression",
  },
  { name: "query", description: "Match requests by query parameter(s)" },
  { name: "protocol", description: "Match requests by protocol (http, https, grpc)" },
  { name: "client_ip", description: "Match requests by client IP address" },
  { name: "remote_ip", description: "Match requests by remote IP address" },
  { name: "tls", description: "Match requests by TLS connection state" },
  { name: "not", description: "Negate the enclosed matchers" },
  { name: "expression", description: "CEL expression for advanced matching" },
];

/** Properties of an object inside the `handle` array, before its `handler` type is known */
export const HANDLE_OBJECT_PROPERTIES: Array<{ name: string; description: string }> = [
  {
    name: "handler",
    description: "The type of handler to invoke (e.g. reverse_proxy, headers, file_server)",
  },
];

/**
 * Common HTTP methods offered for the method matcher. Real Caddy's method
 * matcher accepts any string (see HttpMethodSchema in the main package's
 * schemas.ts) -- this is a curated suggestion list for autocomplete, not
 * an exhaustive/enforced set.
 */
export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "CONNECT",
  "TRACE",
];

/** Enum values for known fields */
export const ENUM_VALUES: Record<string, Array<{ value: string; description: string }>> = {
  selection_policy: [
    { value: "first", description: "Use first available upstream" },
    { value: "random", description: "Randomly select an upstream" },
    { value: "least_conn", description: "Select upstream with fewest connections" },
    { value: "round_robin", description: "Cycle through upstreams in order" },
    { value: "ip_hash", description: "Hash client IP for sticky sessions" },
    { value: "uri_hash", description: "Hash request URI for consistent routing" },
    { value: "header", description: "Hash a specific header value" },
    { value: "cookie", description: "Use cookie value for upstream selection" },
  ],
  encodings: [
    { value: "gzip", description: "Gzip compression (widely supported)" },
    { value: "zstd", description: "Zstandard compression (fast, high ratio)" },
    { value: "br", description: "Brotli compression (best for text)" },
  ],
  protocol: [
    { value: "http", description: "HTTP/1.x requests" },
    { value: "https", description: "HTTPS requests" },
    { value: "grpc", description: "gRPC requests" },
  ],
};
