/**
 * Core type definitions for Caddy API client
 */

// ============================================================================
// Basic Types
// ============================================================================

/**
 * Domain name (e.g., "example.com")
 */
export type Domain = string;

/**
 * Dial address in host:port format (e.g., "127.0.0.1:3000")
 */
export type DialAddress = string;

/**
 * HTTP method
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * Frame options for X-Frame-Options header
 */
export type FrameOptions = "DENY" | "SAMEORIGIN";

/**
 * Redirect mode for domain redirects
 * - "none": No redirect
 * - "www_to_domain": Redirect www.example.com to example.com
 * - "domain_to_www": Redirect example.com to www.example.com
 */
export type RedirectMode = "none" | "www_to_domain" | "domain_to_www";

/**
 * HTTP redirect status code
 * - 301: Moved Permanently (may change POST to GET)
 * - 308: Permanent Redirect (preserves HTTP method) - Recommended
 * - 302: Found (temporary, may change POST to GET)
 * - 307: Temporary Redirect (preserves HTTP method)
 */
export type RedirectStatusCode = 301 | 302 | 307 | 308;

/**
 * TLS issuer type
 */
export type TlsIssuer = "letsencrypt" | "zerossl" | "acme";

// ============================================================================
// Caddy JSON Config Types
// ============================================================================

/**
 * Caddy route matcher
 */
export interface CaddyRouteMatcher {
  host?: string[];
  path?: string[];
  method?: HttpMethod[];
  header?: Record<string, string[]>;
  query?: Record<string, string[]>;
}

// ============================================================================
// Handler Types (Discriminated Union)
// ============================================================================

/**
 * Reverse proxy handler - forward requests to upstream servers
 */
export interface ReverseProxyHandler {
  handler: "reverse_proxy";
  upstreams?: { dial: string; max_requests?: number }[];
  transport?: {
    protocol?: string;
    tls?: {
      server_name?: string;
      insecure_skip_verify?: boolean;
      ca?: string;
    };
  };
  load_balancing?: {
    policy?: string;
    selection_policy?: {
      policy?: string;
    };
    retries?: number;
    try_duration?: string;
    try_interval?: string;
  };
  health_checks?: {
    active?: {
      path?: string;
      uri?: string;
      interval?: string;
      timeout?: string;
      expect_status?: number;
      passes?: number;
      fails?: number;
    };
    passive?: {
      fail_duration?: string;
      max_fails?: number;
      unhealthy_status?: number[];
    };
  };
  headers?: {
    request?: {
      set?: Record<string, string[]>;
      add?: Record<string, string[]>;
      delete?: string[];
    };
    response?: {
      set?: Record<string, string[]>;
      add?: Record<string, string[]>;
      delete?: string[];
    };
  };
  flush_interval?: string | number;
}

/**
 * Headers handler - modify request/response headers
 */
export interface HeadersHandler {
  handler: "headers";
  request?: {
    set?: Record<string, string[]>;
    add?: Record<string, string[]>;
    delete?: string[];
  };
  response?: {
    deferred?: boolean;
    set?: Record<string, string[]>;
    add?: Record<string, string[]>;
    delete?: string[];
    require?: {
      status_code?: number[];
    };
  };
}

/**
 * Static response handler - return static content
 */
export interface StaticResponseHandler {
  handler: "static_response";
  status_code?: number | string;
  body?: string;
  headers?: Record<string, string[]>;
  close?: boolean;
  abort?: boolean;
}

/**
 * Authentication handler - HTTP basic auth
 */
export interface AuthenticationHandler {
  handler: "authentication";
  providers?: {
    http_basic?: {
      accounts?: {
        username: string;
        password: string;
      }[];
      realm?: string;
      hash?: {
        algorithm?: string;
      };
    };
  };
}

/**
 * Rewrite handler - URI rewriting
 */
export interface RewriteHandler {
  handler: "rewrite";
  uri?: string;
  strip_path_prefix?: string;
  strip_path_suffix?: string;
  uri_substring?: {
    find: string;
    replace: string;
    limit?: number;
  }[];
}

/**
 * Encode handler - response compression
 */
export interface EncodeHandler {
  handler: "encode";
  encodings?: {
    gzip?: Record<string, unknown>;
    zstd?: Record<string, unknown>;
    br?: Record<string, unknown>;
  };
  prefer?: string[];
  minimum_length?: number;
}

/**
 * Subroute handler - nested routes
 */
export interface SubrouteHandler {
  handler: "subroute";
  routes?: CaddyRoute[];
}

/**
 * Generic handler - extensibility fallback for unknown handlers
 */
export interface GenericHandler {
  handler: string;
  [key: string]: unknown;
}

/**
 * Caddy route handler - discriminated union of all 20 known handlers with generic fallback
 *
 * Known handlers get strict type checking. Unknown handlers (custom plugins)
 * use GenericHandler which allows any properties for extensibility.
 */
export type CaddyRouteHandler =
  | ReverseProxyHandler
  | HeadersHandler
  | StaticResponseHandler
  | AuthenticationHandler
  | RewriteHandler
  | EncodeHandler
  | SubrouteHandler
  | FileServerHandler
  | TemplatesHandler
  | MapHandler
  | PushHandler
  | RequestBodyHandler
  | VarsHandler
  | InterceptHandler
  | InvokeHandler
  | TracingHandler
  | LogAppendHandler
  | ErrorHandler
  | CopyResponseHandler
  | CopyResponseHeadersHandler
  | GenericHandler;

// Handler types for new handlers (minimal interfaces for backwards compatibility)
// Full validation is done via Zod schemas in schemas.ts

export interface FileServerHandler {
  handler: "file_server";
  root?: string;
  index_names?: string[];
  browse?: Record<string, unknown>;
  hide?: string[];
  [key: string]: unknown;
}

export interface TemplatesHandler {
  handler: "templates";
  file_root?: string;
  mime_types?: string[];
  delimiters?: string[];
  [key: string]: unknown;
}

export interface MapHandler {
  handler: "map";
  source?: string;
  destinations?: string[];
  mappings?: { input?: string; outputs?: unknown[] }[];
  defaults?: string[];
  [key: string]: unknown;
}

export interface PushHandler {
  handler: "push";
  resources?: { target?: string; method?: string }[];
  headers?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RequestBodyHandler {
  handler: "request_body";
  max_size?: number;
  [key: string]: unknown;
}

export interface VarsHandler {
  handler: "vars";
  [key: string]: unknown;
}

export interface InterceptHandler {
  handler: "intercept";
  handle_response?: unknown[];
  [key: string]: unknown;
}

export interface InvokeHandler {
  handler: "invoke";
  name?: string;
  [key: string]: unknown;
}

export interface TracingHandler {
  handler: "tracing";
  span?: string;
  [key: string]: unknown;
}

export interface LogAppendHandler {
  handler: "log_append";
  key?: string;
  value?: string;
  [key: string]: unknown;
}

export interface ErrorHandler {
  handler: "error";
  error?: string;
  status_code?: string | number;
  [key: string]: unknown;
}

export interface CopyResponseHandler {
  handler: "copy_response";
  status_code?: number;
  [key: string]: unknown;
}

export interface CopyResponseHeadersHandler {
  handler: "copy_response_headers";
  include?: string[];
  exclude?: string[];
  [key: string]: unknown;
}

/**
 * Caddy route definition
 */
export interface CaddyRoute {
  "@id"?: string; // Route identifier for tracking and updates
  match?: CaddyRouteMatcher[];
  handle?: CaddyRouteHandler[];
  terminal?: boolean;
  priority?: number; // Explicit priority for route ordering (0-100)
}

/**
 * TLS connection policy configuration
 */
export interface TlsConnectionPolicy {
  /** SNI hostnames to match */
  match?: {
    sni?: string[];
  };
  /** Certificate selection criteria */
  certificate_selection?: {
    any_tag?: string[];
    all_tags?: string[];
    serial_number?: string;
    subject_organization?: string;
  };
  /** Minimum TLS protocol version (e.g., "1.2", "1.3") */
  protocol_min?: string;
  /** Maximum TLS protocol version (e.g., "1.2", "1.3") */
  protocol_max?: string;
  /** Cipher suites to allow */
  cipher_suites?: string[];
  /** Elliptic curves to allow */
  curves?: string[];
  /** ALPN protocols (e.g., ["h3", "h2", "http/1.1"]) */
  alpn?: string[];
  /** Client authentication settings */
  client_authentication?: {
    mode?: "request" | "require" | "verify_if_given";
    trusted_ca_certs?: string[];
    trusted_ca_certs_pem_files?: string[];
  };
}

/**
 * Caddy server configuration
 */
export interface CaddyServer {
  listen: string[];
  routes: CaddyRoute[];
  automatic_https?: {
    disable?: boolean;
    skip?: string[];
    disable_redirects?: boolean;
  };
  tls_connection_policies?: TlsConnectionPolicy[];
}

/**
 * Caddy TLS automation policy
 */
export interface CaddyTlsAutomationPolicy {
  subjects?: string[];
  issuers?: {
    module: string;
    ca?: string;
    email?: string;
  }[];
  on_demand?: boolean;
}

/**
 * Caddy TLS certificate
 */
export interface CaddyTlsCertificate {
  certificate: string;
  key: string;
  tags?: string[];
}

// ============================================================================
// Client Options
// ============================================================================

/**
 * Options for CaddyClient constructor
 */
export interface CaddyClientOptions {
  /**
   * Caddy Admin API base URL
   * @default "http://127.0.0.1:2019"
   */
  adminUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 5000
   */
  timeout?: number;
}

// ============================================================================
// Domain Management Options
// ============================================================================

/**
 * Security headers configuration
 */
export interface SecurityHeaders {
  /**
   * Enable HSTS (HTTP Strict Transport Security)
   * @default false
   */
  enableHsts?: boolean;

  /**
   * HSTS max-age in seconds
   * @default 31536000 (1 year)
   */
  hstsMaxAge?: number;

  /**
   * X-Frame-Options header value
   * @default "DENY"
   */
  frameOptions?: FrameOptions;

  /**
   * Enable gzip/brotli compression
   * @default true
   */
  enableCompression?: boolean;
}

/**
 * Options for adding a domain with automatic TLS
 */
export interface AddDomainWithAutoTlsOptions {
  /**
   * Domain name (e.g., "example.com")
   */
  domain: Domain;

  /**
   * Target upstream address (e.g., "127.0.0.1:3000")
   */
  target: string;

  /**
   * Target upstream port
   */
  targetPort: number;

  /**
   * Enable security headers (HSTS, X-Frame-Options, etc.)
   * @default true
   */
  enableSecurityHeaders?: boolean;

  /**
   * Enable HSTS
   * @default false
   */
  enableHsts?: boolean;

  /**
   * HSTS max-age in seconds
   * @default 31536000
   */
  hstsMaxAge?: number;

  /**
   * X-Frame-Options value
   * @default "DENY"
   */
  frameOptions?: FrameOptions;

  /**
   * Enable compression
   * @default true
   */
  enableCompression?: boolean;

  /**
   * HTTP to HTTPS redirect mode
   * @default "none"
   */
  redirectMode?: RedirectMode;

  /**
   * HTTP redirect status code
   * @default 308 (Permanent Redirect - preserves HTTP method)
   */
  redirectStatusCode?: RedirectStatusCode;

  /**
   * Caddy Admin API URL (overrides client default)
   */
  adminUrl?: string;
}

/**
 * Options for adding a domain with custom TLS certificate
 */
export interface AddDomainWithTlsOptions extends Omit<AddDomainWithAutoTlsOptions, "domain"> {
  domain: Domain;
  certFile: string;
  keyFile: string;
}

/**
 * Options for updating a domain
 */
export interface UpdateDomainOptions {
  domain: Domain;
  target?: string;
  targetPort?: number;
  enableSecurityHeaders?: boolean;
  enableHsts?: boolean;
  hstsMaxAge?: number;
  frameOptions?: FrameOptions;
  enableCompression?: boolean;
  redirectMode?: RedirectMode;
  redirectStatusCode?: RedirectStatusCode;
  adminUrl?: string;
}

/**
 * Options for deleting a domain
 */
export interface DeleteDomainOptions {
  domain: Domain;
  adminUrl?: string;
}

/**
 * Domain configuration
 */
export interface DomainConfig {
  domain: Domain;
  target: string;
  targetPort: number;
  tlsEnabled: boolean;
  autoTls: boolean;
  certFile?: string;
  keyFile?: string;
  securityHeaders: SecurityHeaders;
  redirectMode: RedirectMode;
}

// ============================================================================
// Route Builder Options
// ============================================================================

/**
 * Options for building service routes
 */
export interface ServiceRouteOptions {
  /**
   * Host for host-based route
   */
  host?: string;

  /**
   * Path for path-based route
   */
  path?: string;

  /**
   * Host for path-based route
   * @default "asd.localhost"
   */
  pathRouteHost?: string;

  /**
   * Dial address (host:port)
   */
  dial: DialAddress;

  /**
   * Service identifier for health checks
   */
  serviceId?: string;

  /**
   * Enable host-based route
   * @default true
   */
  enableHostRoute?: boolean;

  /**
   * Enable path-based route
   * @default true
   */
  enablePathRoute?: boolean;

  /**
   * Strip path prefix
   * @default true
   */
  stripPrefix?: boolean;

  /**
   * Route priority (higher = matches first)
   * @default 50
   */
  priority?: number;

  /**
   * Security headers configuration
   */
  securityHeaders?: SecurityHeaders;

  /**
   * Basic authentication configuration
   */
  basicAuth?: BasicAuthOptions;
}

/**
 * Basic authentication account
 */
export interface BasicAuthAccount {
  username: string;
  password: string; // Bcrypt hash
}

/**
 * Basic authentication options
 * Supports single account (legacy) or multiple accounts
 */
export interface BasicAuthOptions {
  enabled: boolean;
  /** Single username (legacy - use accounts instead) */
  username?: string;
  /** Single password hash (legacy - use accounts instead) */
  passwordHash?: string;
  /** Multiple accounts (recommended) */
  accounts?: BasicAuthAccount[];
  /** Authentication realm */
  realm?: string;
  /** Hash algorithm (default: bcrypt) */
  hash?: {
    algorithm?: "bcrypt";
    cost?: number;
  };
}

/**
 * Options for building health check route
 */
export interface HealthCheckRouteOptions {
  host: string;
  serviceId: string;
  priority?: number;
}

/**
 * Options for building host route
 */
export interface HostRouteOptions {
  host: string;
  dial: DialAddress;
  securityHeaders?: SecurityHeaders;
  basicAuth?: BasicAuthOptions;
  priority?: number;
}

/**
 * Options for building path route
 */
export interface PathRouteOptions {
  path: string;
  host: string;
  dial: DialAddress;
  stripPrefix?: boolean;
  securityHeaders?: SecurityHeaders;
  basicAuth?: BasicAuthOptions;
  priority?: number;
}

/**
 * Options for building load balancer route
 */
export interface LoadBalancerRouteOptions {
  host: string;
  upstreams: DialAddress[];
  healthCheckPath?: string;
  healthCheckInterval?: string;
  policy?: "first" | "random" | "least_conn" | "round_robin";
  priority?: number;
}

// ============================================================================
// MITMProxy Options
// ============================================================================

/**
 * Options for starting mitmweb
 */
export interface MitmwebOptions {
  /**
   * Port for mitmweb UI
   * @default 8081
   */
  webPort?: number;

  /**
   * Port for proxy
   * @default 8080
   */
  proxyPort?: number;

  /**
   * Listen address
   * @default "127.0.0.1"
   */
  listenAddress?: string;

  /**
   * Auto-open browser
   * @default true
   */
  openBrowser?: boolean;

  /**
   * Custom Python addon scripts
   */
  scripts?: string[];

  /**
   * Working directory for mitmproxy
   */
  workingDir?: string;
}

/**
 * Mitmweb status
 */
export interface MitmwebStatus {
  running: boolean;
  pid?: number;
  webUrl?: string;
  proxyUrl?: string;
}

// ============================================================================
// Caddy Admin API Response Types
// ============================================================================

/**
 * Upstream server status from /reverse_proxy/upstreams endpoint
 */
export interface UpstreamStatus {
  /** Upstream address (host:port) */
  address: string;
  /** Number of active requests */
  num_requests: number;
  /** Number of failed health checks */
  fails: number;
  /** Whether the upstream is currently healthy */
  healthy: boolean;
}
