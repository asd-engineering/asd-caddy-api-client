/**
 * TLS connection policy builders and utilities
 */
import type { TlsConnectionPolicy } from "../types.js";
import type { AutomationPolicy, InternalIssuer } from "../generated/caddy-tls.js";
import type { AutoHTTPSConfig } from "../generated/caddy-http.js";

/**
 * Common TLS 1.3 cipher suites (recommended)
 */
export const TLS_1_3_CIPHER_SUITES = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
] as const;

/**
 * Common TLS 1.2 cipher suites (recommended)
 */
export const TLS_1_2_CIPHER_SUITES = [
  "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
  "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
  "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
  "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
  "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
  "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
] as const;

/**
 * Modern cipher suites (TLS 1.2 + 1.3, secure)
 */
export const MODERN_CIPHER_SUITES = [...TLS_1_3_CIPHER_SUITES, ...TLS_1_2_CIPHER_SUITES];

/**
 * Recommended elliptic curves (in order of preference)
 */
export const RECOMMENDED_CURVES = ["x25519", "secp256r1", "secp384r1"] as const;

/**
 * ALPN protocols for HTTP/3, HTTP/2, and HTTP/1.1
 */
export const HTTP_ALPN_PROTOCOLS = ["h3", "h2", "http/1.1"] as const;

/**
 * ALPN protocols for HTTP/2 and HTTP/1.1 (no HTTP/3)
 */
export const HTTP2_ALPN_PROTOCOLS = ["h2", "http/1.1"] as const;

/**
 * ALPN protocols for HTTP/1.1 only
 */
export const HTTP1_ALPN_PROTOCOLS = ["http/1.1"] as const;

/**
 * Options for building TLS connection policy
 */
export interface TlsConnectionPolicyOptions {
  /** SNI hostnames to match (e.g., ["example.com", "*.example.com"]) */
  sni?: string[];
  /** Certificate tags to select (any_tag) */
  certificateTags?: string[];
  /** Certificate tags required (all_tags) */
  requiredCertificateTags?: string[];
  /** Minimum TLS version ("1.2" or "1.3") */
  protocolMin?: "1.2" | "1.3";
  /** Maximum TLS version ("1.2" or "1.3") */
  protocolMax?: "1.2" | "1.3";
  /** Cipher suites to allow (or "modern" for recommended suites) */
  cipherSuites?: string[] | "modern";
  /** Elliptic curves to allow (or "recommended") */
  curves?: string[] | "recommended";
  /** ALPN protocols (or "http3", "http2", "http1") */
  alpn?: string[] | "http3" | "http2" | "http1";
  /** Client authentication mode */
  clientAuthMode?: "request" | "require" | "verify_if_given";
  /** Client CA certificate files */
  clientCaCertFiles?: string[];
}

/**
 * Build a TLS connection policy
 *
 * @param options - TLS policy options
 * @returns TLS connection policy object
 *
 * @example
 * ```typescript
 * // Modern TLS 1.3 only with HTTP/3
 * const policy = buildTlsConnectionPolicy({
 *   sni: ["example.com"],
 *   certificateTags: ["example-cert"],
 *   protocolMin: "1.3",
 *   cipherSuites: "modern",
 *   curves: "recommended",
 *   alpn: "http3"
 * });
 * ```
 */
export function buildTlsConnectionPolicy(options: TlsConnectionPolicyOptions): TlsConnectionPolicy {
  const policy: TlsConnectionPolicy = {};

  // SNI matching
  if (options.sni && options.sni.length > 0) {
    policy.match = {
      sni: options.sni,
    };
  }

  // Certificate selection
  if (options.certificateTags || options.requiredCertificateTags) {
    policy.certificate_selection = {};
    if (options.certificateTags) {
      policy.certificate_selection.any_tag = options.certificateTags;
    }
    if (options.requiredCertificateTags) {
      policy.certificate_selection.all_tags = options.requiredCertificateTags;
    }
  }

  // Protocol versions
  if (options.protocolMin) {
    policy.protocol_min = options.protocolMin === "1.2" ? "tls1.2" : "tls1.3";
  }
  if (options.protocolMax) {
    policy.protocol_max = options.protocolMax === "1.2" ? "tls1.2" : "tls1.3";
  }

  // Cipher suites
  if (options.cipherSuites) {
    if (options.cipherSuites === "modern") {
      policy.cipher_suites = [...MODERN_CIPHER_SUITES];
    } else {
      policy.cipher_suites = options.cipherSuites;
    }
  }

  // Elliptic curves
  if (options.curves) {
    if (options.curves === "recommended") {
      policy.curves = [...RECOMMENDED_CURVES];
    } else {
      policy.curves = options.curves;
    }
  }

  // ALPN protocols
  if (options.alpn) {
    if (options.alpn === "http3") {
      policy.alpn = [...HTTP_ALPN_PROTOCOLS];
    } else if (options.alpn === "http2") {
      policy.alpn = [...HTTP2_ALPN_PROTOCOLS];
    } else if (options.alpn === "http1") {
      policy.alpn = [...HTTP1_ALPN_PROTOCOLS];
    } else {
      policy.alpn = options.alpn;
    }
  }

  // Client authentication
  if (options.clientAuthMode || options.clientCaCertFiles) {
    policy.client_authentication = {};
    if (options.clientAuthMode) {
      policy.client_authentication.mode = options.clientAuthMode;
    }
    if (options.clientCaCertFiles) {
      policy.client_authentication.trusted_ca_certs_pem_files = options.clientCaCertFiles;
    }
  }

  return policy;
}

/**
 * Build a modern, secure TLS policy (TLS 1.3 with HTTP/3 support)
 *
 * @param options - Basic options (sni, certificateTags)
 * @returns Secure TLS connection policy
 *
 * @example
 * ```typescript
 * const policy = buildModernTlsPolicy({
 *   sni: ["example.com"],
 *   certificateTags: ["example-cert"]
 * });
 * ```
 */
export function buildModernTlsPolicy(options: {
  sni?: string[];
  certificateTags?: string[];
}): TlsConnectionPolicy {
  return buildTlsConnectionPolicy({
    ...options,
    protocolMin: "1.3",
    cipherSuites: "modern",
    curves: "recommended",
    alpn: "http3",
  });
}

/**
 * Build a compatible TLS policy (TLS 1.2+, HTTP/2 support, broader compatibility)
 *
 * @param options - Basic options (sni, certificateTags)
 * @returns Compatible TLS connection policy
 *
 * @example
 * ```typescript
 * const policy = buildCompatibleTlsPolicy({
 *   sni: ["example.com"],
 *   certificateTags: ["example-cert"]
 * });
 * ```
 */
export function buildCompatibleTlsPolicy(options: {
  sni?: string[];
  certificateTags?: string[];
}): TlsConnectionPolicy {
  return buildTlsConnectionPolicy({
    ...options,
    protocolMin: "1.2",
    cipherSuites: "modern",
    curves: "recommended",
    alpn: "http2",
  });
}

// ============================================================================
// AUTOMATION POLICIES (cert issuance) + AUTOMATIC-HTTPS
// ============================================================================
//
// Caddy's TLS app exposes a chain of automation policies at
// `apps.tls.automation.policies`. Caddy evaluates them in order and uses
// the first policy whose `subjects` list matches the requested hostname;
// a policy with no `subjects` is an unconditional catch-all. If no policy
// matches a hostname, Caddy falls back to its built-in default — which,
// for any non-internal name, is "obtain a public cert via ACME from
// Let's Encrypt." The HTTP server's `automatic_https` block governs
// HTTP→HTTPS redirects and the global skip-list independently of the
// policy chain. See:
//   https://caddyserver.com/docs/json/apps/tls/automation/policies/
//   https://caddyserver.com/docs/json/apps/http/servers/automatic_https/
//   https://caddyserver.com/docs/automatic-https
//
// SCOPE: this module only builds Caddy *core* primitives. Anything that
// needs an xcaddy plugin's schema (e.g. `caddy-dns/*` provider blocks for
// ACME-DNS challenges) belongs in `src/plugins/`, where the type/schema
// generation pipeline (see scripts/generate-plugin-types.ts) gives us a
// validated representation of that plugin's config.
//

/**
 * The shape Caddy expects in `policy.issuers[]` for the internal issuer:
 * Caddy's generated {@link InternalIssuer} type (`ca`, `lifetime`,
 * `sign_with_root`) plus the `module: "internal"` discriminator that
 * Caddy's module system adds at the JSON boundary. See:
 *   https://caddyserver.com/docs/json/apps/tls/automation/policies/issuers/internal/
 */
export type InternalIssuerJson = InternalIssuer & { module: "internal" };

/**
 * Options for {@link buildAutomationPoliciesWithInternalFallback}.
 */
export interface InternalFallbackPoliciesOptions {
  /**
   * If `true` (default), prepend an explicit policy scoping the internal
   * issuer to `*.localhost` + `localhost`. The catch-all below would
   * handle these too, but Caddy already treats `.localhost` specially in
   * its built-in auto-HTTPS rules and emitting this policy is documentary.
   */
  includeLocalhostPolicy?: boolean;
  /**
   * Optional override for the internal issuer used by the localhost
   * policy and the catch-all (e.g. a custom CA id or `lifetime`).
   * Caddy core's {@link InternalIssuer} fields, minus the `module`
   * discriminator (added automatically). Defaults to an empty issuer
   * (i.e. `{ module: "internal" }`).
   */
  internalIssuer?: InternalIssuer;
}

/**
 * Build a TLS `automation.policies` array whose final entry is an
 * unscoped (catch-all) policy that uses Caddy's `internal` issuer.
 *
 * **Why this exists.** Without an unscoped catch-all, any hostname not
 * matched by a more-specific policy hits Caddy's default behavior:
 * obtain a Let's Encrypt cert via HTTP-01 / TLS-ALPN-01. For Caddy
 * instances behind a tunnel/edge that already terminates TLS, or
 * running on a private network with no inbound port 80/443, that's
 * always wrong: the ACME challenge can't be solved, every renewal job
 * fails, and the log fills with `"obtaining certificate: ... context
 * canceled"` and `"no solvers available for remaining challenges"`.
 *
 * The fix is a terminal policy with no `subjects` field that uses the
 * internal (self-signed) issuer. Caddy's own schema describes
 * `AutomationPolicy.subjects` as a *filter, not a command*; omitting it
 * means "match anything not already matched."
 *
 * **Adding ACME-DNS or other plugin-backed issuers**: don't pass them
 * here. Construct a typed plugin policy via the plugin's schema (under
 * `src/plugins/<plugin-name>/`) and merge it into the policy array
 * before this catch-all in the calling code. This builder intentionally
 * exposes no `unknown`-shaped passthrough.
 *
 * Policy order produced:
 *   1. (default) `subjects: ["*.localhost", "localhost"]` → internal
 *   2. **Catch-all** (no `subjects`) → internal
 *
 * @example
 * ```typescript
 * const { policies } = buildAutomationPoliciesWithInternalFallback();
 * // [
 * //   { subjects: ["*.localhost", "localhost"], issuers: [{ module: "internal" }] },
 * //   { issuers: [{ module: "internal" }] },
 * // ]
 * ```
 *
 * @param options - {@link InternalFallbackPoliciesOptions}
 * @returns Object shaped for `apps.tls.automation`.
 */
export function buildAutomationPoliciesWithInternalFallback(
  options: InternalFallbackPoliciesOptions = {}
): { policies: AutomationPolicy[] } {
  const issuer: InternalIssuerJson = {
    module: "internal",
    ...(options.internalIssuer ?? {}),
  };
  const policies: AutomationPolicy[] = [];

  if (options.includeLocalhostPolicy !== false) {
    policies.push({
      subjects: ["*.localhost", "localhost"],
      issuers: [{ ...issuer }],
    });
  }

  // Catch-all. MUST be last and MUST omit `subjects`.
  policies.push({ issuers: [{ ...issuer }] });

  return { policies };
}

/**
 * Hostnames Caddy's built-in auto-HTTPS rules already exclude from the
 * public-ACME path: `localhost`, `*.localhost`, anything ending in
 * `.localhost`, and any literal IP address. Including these in
 * `automatic_https.skip` is a no-op (and visually noisy).
 *
 * See: https://caddyserver.com/docs/automatic-https#hostname-requirements
 */
function isInternalHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  if (!h) return true;
  if (h === "localhost" || h === "*.localhost") return true;
  if (h.endsWith(".localhost")) return true;
  // Literal IPv4 (loose; sufficient for skip-list filtering).
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(h)) return true;
  // Literal IPv6 in brackets.
  if (/^\[[0-9a-f:]+\](:\d+)?$/.test(h)) return true;
  return false;
}

/**
 * Walk a Caddy `routes[]` tree (or any nested fragment) and collect every
 * non-internal hostname referenced in `match[].host[]`.
 *
 * Recurses into Caddy's `subroute` handler shape, where nested routes
 * live at `handle[].routes[]`. Hostnames Caddy already treats as internal
 * (`localhost`, `*.localhost`, `.localhost` suffixes, literal IPs) are
 * filtered out — see {@link isInternalHost}.
 *
 * Useful as input to {@link buildAutomaticHttpsConfig} when you want
 * `automatic_https.skip` to mirror the actual route topology rather than
 * a fixed list maintained somewhere else.
 *
 * @param routes - A Caddy `server.routes` array (or any nested fragment).
 * @returns Sorted, de-duplicated list of non-internal hostnames.
 */
export function collectExternalHostsFromRoutes(routes: unknown): string[] {
  const out = new Set<string>();

  const visit = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    if (Array.isArray(obj.match)) {
      for (const m of obj.match) {
        if (!m || typeof m !== "object") continue;
        const hosts = (m as Record<string, unknown>).host;
        if (!Array.isArray(hosts)) continue;
        for (const h of hosts) {
          if (typeof h !== "string" || !h) continue;
          if (isInternalHost(h)) continue;
          out.add(h);
        }
      }
    }

    // Caddy's `subroute` handler nests further routes at handle[].routes[].
    if (Array.isArray(obj.handle)) for (const h of obj.handle) visit(h);
    if (Array.isArray(obj.routes)) for (const r of obj.routes) visit(r);
  };

  visit(routes);
  return Array.from(out).sort();
}

/**
 * Options for {@link buildAutomaticHttpsConfig}. Mirrors Caddy core's
 * generated {@link AutoHTTPSConfig} (camelCased for the TypeScript API,
 * but emitted to Caddy's snake_case shape).
 */
export interface AutomaticHttpsConfigOptions {
  /**
   * Hostnames to add to `automatic_https.skip` — Caddy disables automatic
   * HTTPS (cert acquisition AND HTTP→HTTPS redirect) for these.
   * Internal hosts (see {@link isInternalHost}) are filtered out and
   * duplicates are de-duplicated.
   */
  skip?: string[];
  /**
   * Hostnames to add to `automatic_https.skip_certificates` — Caddy will
   * not obtain certs for these but will still install the HTTP→HTTPS
   * redirect. Use when the host is reachable on HTTPS via a manually-
   * loaded cert.
   */
  skipCerts?: string[];
  /** Sets `automatic_https.disable_redirects: true`. */
  disableRedirects?: boolean;
  /** Sets `automatic_https.disable: true` (entire pipeline off). */
  disable?: boolean;
  /** Sets `automatic_https.disable_certificates: true` (cert mgmt off, redirects stay). */
  disableCertificates?: boolean;
  /** Sets `automatic_https.ignore_loaded_certificates: true`. */
  ignoreLoadedCertificates?: boolean;
}

/**
 * Build a Caddy `automatic_https` config block.
 *
 * Symmetric to {@link collectExternalHostsFromRoutes}: pass the result of
 * that walker as `skip` to derive the skip list dynamically from the live
 * routes.
 *
 * Returns `undefined` when no field would be set, so the caller can
 * conditionally assign without polluting the config with empty objects:
 *
 *   const auto = buildAutomaticHttpsConfig({ skip: hosts, disableRedirects: true });
 *   if (auto) server.automatic_https = auto;
 *
 * @see https://caddyserver.com/docs/json/apps/http/servers/automatic_https/
 */
export function buildAutomaticHttpsConfig(
  options: AutomaticHttpsConfigOptions = {}
): AutoHTTPSConfig | undefined {
  const out: AutoHTTPSConfig = {};

  if (options.disable) out.disable = true;
  if (options.disableRedirects) out.disable_redirects = true;
  if (options.disableCertificates) out.disable_certificates = true;
  if (options.ignoreLoadedCertificates) out.ignore_loaded_certificates = true;

  const filterAndDedupe = (hosts: string[] | undefined): string[] => {
    if (!hosts || hosts.length === 0) return [];
    const set = new Set<string>();
    for (const h of hosts) {
      if (typeof h !== "string" || !h) continue;
      if (isInternalHost(h)) continue;
      set.add(h);
    }
    return Array.from(set).sort();
  };

  const skip = filterAndDedupe(options.skip);
  if (skip.length > 0) out.skip = skip;

  const skipCerts = filterAndDedupe(options.skipCerts);
  if (skipCerts.length > 0) out.skip_certificates = skipCerts;

  return Object.keys(out).length > 0 ? out : undefined;
}
