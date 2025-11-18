/**
 * Unit tests for TLS connection policy builders
 */
import { describe, test, expect } from "vitest";
import {
  buildTlsConnectionPolicy,
  buildModernTlsPolicy,
  buildCompatibleTlsPolicy,
  TLS_1_3_CIPHER_SUITES,
  TLS_1_2_CIPHER_SUITES,
  MODERN_CIPHER_SUITES,
  RECOMMENDED_CURVES,
  HTTP_ALPN_PROTOCOLS,
  HTTP2_ALPN_PROTOCOLS,
  HTTP1_ALPN_PROTOCOLS,
} from "../caddy/tls.js";

describe("TLS Constants", () => {
  test("TLS 1.3 cipher suites are defined", () => {
    expect(TLS_1_3_CIPHER_SUITES).toHaveLength(3);
    expect(TLS_1_3_CIPHER_SUITES).toContain("TLS_AES_256_GCM_SHA384");
  });

  test("TLS 1.2 cipher suites are defined", () => {
    expect(TLS_1_2_CIPHER_SUITES.length).toBeGreaterThan(0);
    expect(TLS_1_2_CIPHER_SUITES).toContain("TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384");
  });

  test("Modern cipher suites combine TLS 1.2 and 1.3", () => {
    expect(MODERN_CIPHER_SUITES.length).toBe(
      TLS_1_3_CIPHER_SUITES.length + TLS_1_2_CIPHER_SUITES.length
    );
  });

  test("Recommended curves are defined", () => {
    expect(RECOMMENDED_CURVES).toEqual(["x25519", "secp256r1", "secp384r1"]);
  });

  test("HTTP ALPN protocols include HTTP/3", () => {
    expect(HTTP_ALPN_PROTOCOLS).toEqual(["h3", "h2", "http/1.1"]);
  });

  test("HTTP/2 ALPN protocols exclude HTTP/3", () => {
    expect(HTTP2_ALPN_PROTOCOLS).toEqual(["h2", "http/1.1"]);
  });

  test("HTTP/1.1 ALPN protocols only include HTTP/1.1", () => {
    expect(HTTP1_ALPN_PROTOCOLS).toEqual(["http/1.1"]);
  });
});

describe("buildTlsConnectionPolicy", () => {
  test("builds empty policy with no options", () => {
    const policy = buildTlsConnectionPolicy({});
    expect(policy).toEqual({});
  });

  test("builds policy with SNI matching", () => {
    const policy = buildTlsConnectionPolicy({
      sni: ["example.com", "*.example.com"],
    });

    expect(policy.match).toEqual({
      sni: ["example.com", "*.example.com"],
    });
  });

  test("builds policy with certificate tag selection", () => {
    const policy = buildTlsConnectionPolicy({
      certificateTags: ["cert-tag-1", "cert-tag-2"],
    });

    expect(policy.certificate_selection).toEqual({
      any_tag: ["cert-tag-1", "cert-tag-2"],
    });
  });

  test("builds policy with required certificate tags", () => {
    const policy = buildTlsConnectionPolicy({
      requiredCertificateTags: ["required-tag"],
    });

    expect(policy.certificate_selection).toEqual({
      all_tags: ["required-tag"],
    });
  });

  test("builds policy with both any_tag and all_tags", () => {
    const policy = buildTlsConnectionPolicy({
      certificateTags: ["any-tag"],
      requiredCertificateTags: ["required-tag"],
    });

    expect(policy.certificate_selection).toEqual({
      any_tag: ["any-tag"],
      all_tags: ["required-tag"],
    });
  });

  test("builds policy with TLS 1.2 minimum version", () => {
    const policy = buildTlsConnectionPolicy({
      protocolMin: "1.2",
    });

    expect(policy.protocol_min).toBe("tls1.2");
  });

  test("builds policy with TLS 1.3 minimum version", () => {
    const policy = buildTlsConnectionPolicy({
      protocolMin: "1.3",
    });

    expect(policy.protocol_min).toBe("tls1.3");
  });

  test("builds policy with TLS 1.3 maximum version", () => {
    const policy = buildTlsConnectionPolicy({
      protocolMax: "1.3",
    });

    expect(policy.protocol_max).toBe("tls1.3");
  });

  test("builds policy with TLS version range", () => {
    const policy = buildTlsConnectionPolicy({
      protocolMin: "1.2",
      protocolMax: "1.3",
    });

    expect(policy.protocol_min).toBe("tls1.2");
    expect(policy.protocol_max).toBe("tls1.3");
  });

  test("builds policy with modern cipher suites", () => {
    const policy = buildTlsConnectionPolicy({
      cipherSuites: "modern",
    });

    expect(policy.cipher_suites).toEqual(MODERN_CIPHER_SUITES);
  });

  test("builds policy with custom cipher suites", () => {
    const customSuites = ["TLS_AES_256_GCM_SHA384"];
    const policy = buildTlsConnectionPolicy({
      cipherSuites: customSuites,
    });

    expect(policy.cipher_suites).toEqual(customSuites);
  });

  test("builds policy with recommended curves", () => {
    const policy = buildTlsConnectionPolicy({
      curves: "recommended",
    });

    expect(policy.curves).toEqual(RECOMMENDED_CURVES);
  });

  test("builds policy with custom curves", () => {
    const customCurves = ["x25519"];
    const policy = buildTlsConnectionPolicy({
      curves: customCurves,
    });

    expect(policy.curves).toEqual(customCurves);
  });

  test("builds policy with HTTP/3 ALPN", () => {
    const policy = buildTlsConnectionPolicy({
      alpn: "http3",
    });

    expect(policy.alpn).toEqual(HTTP_ALPN_PROTOCOLS);
  });

  test("builds policy with HTTP/2 ALPN", () => {
    const policy = buildTlsConnectionPolicy({
      alpn: "http2",
    });

    expect(policy.alpn).toEqual(HTTP2_ALPN_PROTOCOLS);
  });

  test("builds policy with HTTP/1.1 ALPN", () => {
    const policy = buildTlsConnectionPolicy({
      alpn: "http1",
    });

    expect(policy.alpn).toEqual(HTTP1_ALPN_PROTOCOLS);
  });

  test("builds policy with custom ALPN protocols", () => {
    const customAlpn = ["h2", "http/1.1"];
    const policy = buildTlsConnectionPolicy({
      alpn: customAlpn,
    });

    expect(policy.alpn).toEqual(customAlpn);
  });

  test("builds policy with client authentication mode", () => {
    const policy = buildTlsConnectionPolicy({
      clientAuthMode: "require",
    });

    expect(policy.client_authentication).toEqual({
      mode: "require",
    });
  });

  test("builds policy with client CA cert files", () => {
    const policy = buildTlsConnectionPolicy({
      clientCaCertFiles: ["/path/to/ca.crt"],
    });

    expect(policy.client_authentication).toEqual({
      trusted_ca_certs_pem_files: ["/path/to/ca.crt"],
    });
  });

  test("builds policy with full client authentication", () => {
    const policy = buildTlsConnectionPolicy({
      clientAuthMode: "verify_if_given",
      clientCaCertFiles: ["/path/to/ca1.crt", "/path/to/ca2.crt"],
    });

    expect(policy.client_authentication).toEqual({
      mode: "verify_if_given",
      trusted_ca_certs_pem_files: ["/path/to/ca1.crt", "/path/to/ca2.crt"],
    });
  });

  test("builds comprehensive policy with all options", () => {
    const policy = buildTlsConnectionPolicy({
      sni: ["example.com"],
      certificateTags: ["cert-tag"],
      protocolMin: "1.3",
      cipherSuites: "modern",
      curves: "recommended",
      alpn: "http3",
      clientAuthMode: "request",
    });

    expect(policy.match?.sni).toEqual(["example.com"]);
    expect(policy.certificate_selection?.any_tag).toEqual(["cert-tag"]);
    expect(policy.protocol_min).toBe("tls1.3");
    expect(policy.cipher_suites).toEqual(MODERN_CIPHER_SUITES);
    expect(policy.curves).toEqual(RECOMMENDED_CURVES);
    expect(policy.alpn).toEqual(HTTP_ALPN_PROTOCOLS);
    expect(policy.client_authentication?.mode).toBe("request");
  });
});

describe("buildModernTlsPolicy", () => {
  test("builds modern TLS 1.3 policy", () => {
    const policy = buildModernTlsPolicy({
      sni: ["example.com"],
      certificateTags: ["cert-tag"],
    });

    expect(policy.match?.sni).toEqual(["example.com"]);
    expect(policy.certificate_selection?.any_tag).toEqual(["cert-tag"]);
    expect(policy.protocol_min).toBe("tls1.3");
    expect(policy.cipher_suites).toEqual(MODERN_CIPHER_SUITES);
    expect(policy.curves).toEqual(RECOMMENDED_CURVES);
    expect(policy.alpn).toEqual(HTTP_ALPN_PROTOCOLS);
  });

  test("builds modern policy without SNI", () => {
    const policy = buildModernTlsPolicy({
      certificateTags: ["cert-tag"],
    });

    expect(policy.match).toBeUndefined();
    expect(policy.certificate_selection?.any_tag).toEqual(["cert-tag"]);
    expect(policy.protocol_min).toBe("tls1.3");
  });

  test("builds modern policy without certificate tags", () => {
    const policy = buildModernTlsPolicy({
      sni: ["example.com"],
    });

    expect(policy.match?.sni).toEqual(["example.com"]);
    expect(policy.certificate_selection).toBeUndefined();
    expect(policy.protocol_min).toBe("tls1.3");
  });

  test("builds modern policy with empty options", () => {
    const policy = buildModernTlsPolicy({});

    expect(policy.match).toBeUndefined();
    expect(policy.certificate_selection).toBeUndefined();
    expect(policy.protocol_min).toBe("tls1.3");
    expect(policy.cipher_suites).toEqual(MODERN_CIPHER_SUITES);
    expect(policy.alpn).toEqual(HTTP_ALPN_PROTOCOLS);
  });
});

describe("buildCompatibleTlsPolicy", () => {
  test("builds compatible TLS 1.2+ policy", () => {
    const policy = buildCompatibleTlsPolicy({
      sni: ["example.com"],
      certificateTags: ["cert-tag"],
    });

    expect(policy.match?.sni).toEqual(["example.com"]);
    expect(policy.certificate_selection?.any_tag).toEqual(["cert-tag"]);
    expect(policy.protocol_min).toBe("tls1.2");
    expect(policy.cipher_suites).toEqual(MODERN_CIPHER_SUITES);
    expect(policy.curves).toEqual(RECOMMENDED_CURVES);
    expect(policy.alpn).toEqual(HTTP2_ALPN_PROTOCOLS); // No HTTP/3
  });

  test("builds compatible policy without HTTP/3", () => {
    const policy = buildCompatibleTlsPolicy({});

    expect(policy.alpn).toEqual(HTTP2_ALPN_PROTOCOLS);
    expect(policy.alpn).not.toContain("h3");
  });

  test("builds compatible policy with TLS 1.2", () => {
    const policy = buildCompatibleTlsPolicy({});

    expect(policy.protocol_min).toBe("tls1.2");
    expect(policy.protocol_max).toBeUndefined();
  });
});
