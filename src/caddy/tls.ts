/**
 * TLS connection policy builders and utilities
 */
import type { TlsConnectionPolicy } from "../types.js";

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
export function buildTlsConnectionPolicy(
  options: TlsConnectionPolicyOptions
): TlsConnectionPolicy {
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
