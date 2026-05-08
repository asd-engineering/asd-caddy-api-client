/**
 * Unit tests for TLS connection policy builders
 */
import { describe, test, expect } from "vitest";
import {
  buildTlsConnectionPolicy,
  buildModernTlsPolicy,
  buildCompatibleTlsPolicy,
  buildAutomationPoliciesWithInternalFallback,
  collectExternalHostsFromRoutes,
  buildAutomaticHttpsConfig,
  filterAcmeManagedFromSkip,
  applyLocalCaInstallTrust,
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

describe("buildAutomationPoliciesWithInternalFallback", () => {
  test("emits localhost policy + catch-all by default", () => {
    const { policies } = buildAutomationPoliciesWithInternalFallback();

    expect(policies).toHaveLength(2);
    expect(policies[0]?.subjects).toEqual(["*.localhost", "localhost"]);
    expect(policies[0]?.issuers?.[0]).toEqual({ module: "internal" });
    // Catch-all has NO `subjects` field — that's what makes it match anything.
    expect(policies[1]?.subjects).toBeUndefined();
    expect(policies[1]?.issuers?.[0]).toEqual({ module: "internal" });
  });

  test("catch-all is always last (so earlier policies win)", () => {
    const { policies } = buildAutomationPoliciesWithInternalFallback();
    const last = policies[policies.length - 1];

    expect(last?.subjects).toBeUndefined();
  });

  test("catch-all only — when localhost policy is suppressed", () => {
    const { policies } = buildAutomationPoliciesWithInternalFallback({
      includeLocalhostPolicy: false,
    });

    expect(policies).toHaveLength(1);
    expect(policies[0]?.subjects).toBeUndefined();
    expect(policies[0]?.issuers?.[0]).toEqual({ module: "internal" });
  });

  test("propagates internal-issuer overrides (custom CA, lifetime)", () => {
    const { policies } = buildAutomationPoliciesWithInternalFallback({
      internalIssuer: { ca: "my-ca", lifetime: "8760h" },
    });

    for (const p of policies) {
      const issuer = p.issuers?.[0] as { module: string; ca?: string; lifetime?: string };
      expect(issuer.module).toBe("internal");
      expect(issuer.ca).toBe("my-ca");
      expect(issuer.lifetime).toBe("8760h");
    }
  });

  test("does not share issuer object across policies (mutation safety)", () => {
    const { policies } = buildAutomationPoliciesWithInternalFallback();
    const a = policies[0]?.issuers?.[0] as Record<string, unknown>;
    const b = policies[1]?.issuers?.[0] as Record<string, unknown>;

    expect(a).not.toBe(b);
  });
});

describe("collectExternalHostsFromRoutes", () => {
  test("returns empty for empty/undefined input", () => {
    expect(collectExternalHostsFromRoutes(undefined)).toEqual([]);
    expect(collectExternalHostsFromRoutes(null)).toEqual([]);
    expect(collectExternalHostsFromRoutes([])).toEqual([]);
  });

  test("extracts top-level hosts from match[].host[]", () => {
    const routes = [
      { match: [{ host: ["api.example.com", "example.com"] }], handle: [] },
      { match: [{ host: ["app.example.com"] }], handle: [] },
    ];

    expect(collectExternalHostsFromRoutes(routes)).toEqual([
      "api.example.com",
      "app.example.com",
      "example.com",
    ]);
  });

  test("filters out localhost variants and literal IPs", () => {
    const routes = [
      {
        match: [
          {
            host: [
              "localhost",
              "*.localhost",
              "asd.localhost",
              "deep.nested.localhost",
              "127.0.0.1",
              "127.0.0.1:8080",
              "[::1]",
              "real.example.com",
            ],
          },
        ],
      },
    ];

    expect(collectExternalHostsFromRoutes(routes)).toEqual(["real.example.com"]);
  });

  test("recurses into Caddy subroute handler", () => {
    const routes = [
      {
        match: [{ host: ["outer.example.com"] }],
        handle: [
          {
            handler: "subroute",
            routes: [{ match: [{ host: ["inner.example.com"] }], handle: [] }],
          },
        ],
      },
    ];

    expect(collectExternalHostsFromRoutes(routes)).toEqual([
      "inner.example.com",
      "outer.example.com",
    ]);
  });

  test("de-duplicates across multiple matchers + routes", () => {
    const routes = [
      { match: [{ host: ["a.example.com"] }, { host: ["a.example.com"] }] },
      { match: [{ host: ["a.example.com"] }] },
    ];

    expect(collectExternalHostsFromRoutes(routes)).toEqual(["a.example.com"]);
  });

  test("ignores matchers without a `host` field or non-string entries", () => {
    const routes = [
      { match: [{ path: ["/api/*"] }] },
      { match: [{ host: [42, null, undefined, "good.example.com"] }] },
    ];

    expect(collectExternalHostsFromRoutes(routes)).toEqual(["good.example.com"]);
  });
});

describe("buildAutomaticHttpsConfig", () => {
  test("returns undefined when no field would be set", () => {
    expect(buildAutomaticHttpsConfig()).toBeUndefined();
    expect(buildAutomaticHttpsConfig({})).toBeUndefined();
    expect(buildAutomaticHttpsConfig({ skip: [] })).toBeUndefined();
    expect(buildAutomaticHttpsConfig({ skip: ["localhost"] })).toBeUndefined();
  });

  test("emits boolean flags when set", () => {
    expect(buildAutomaticHttpsConfig({ disable: true })).toEqual({ disable: true });
    expect(buildAutomaticHttpsConfig({ disableRedirects: true })).toEqual({
      disable_redirects: true,
    });
    expect(buildAutomaticHttpsConfig({ disableCertificates: true })).toEqual({
      disable_certificates: true,
    });
    expect(buildAutomaticHttpsConfig({ ignoreLoadedCertificates: true })).toEqual({
      ignore_loaded_certificates: true,
    });
  });

  test("filters internal hosts from skip + skipCerts and de-duplicates", () => {
    const out = buildAutomaticHttpsConfig({
      skip: ["a.example.com", "localhost", "*.localhost", "127.0.0.1", "a.example.com"],
      skipCerts: ["b.example.com", "asd.localhost"],
    });

    expect(out?.skip).toEqual(["a.example.com"]);
    expect(out?.skip_certificates).toEqual(["b.example.com"]);
  });

  test("flags + skip lists coexist", () => {
    const out = buildAutomaticHttpsConfig({
      disableRedirects: true,
      skip: ["x.example.com"],
    });

    expect(out).toEqual({
      disable_redirects: true,
      skip: ["x.example.com"],
    });
  });

  test("integrates with collectExternalHostsFromRoutes", () => {
    const routes = [
      { match: [{ host: ["asd.localhost", "tunnel.example.com"] }] },
      { match: [{ host: ["other.example.com"] }] },
    ];
    const hosts = collectExternalHostsFromRoutes(routes);
    const out = buildAutomaticHttpsConfig({ skip: hosts, disableRedirects: true });

    expect(out).toEqual({
      disable_redirects: true,
      skip: ["other.example.com", "tunnel.example.com"],
    });
  });
});

describe("filterAcmeManagedFromSkip", () => {
  test("empty acme set: candidates pass through unchanged (returns a copy)", () => {
    // No referential-identity assertion — the function returns a fresh
    // array even on the empty-acme fast path so callers can mutate the
    // result without aliasing the input.
    const candidates = ["a.example.com", "*.example.com"];
    const out = filterAcmeManagedFromSkip(candidates, new Set());
    expect(out).toEqual(candidates);
  });

  // Core contract — case (1): exact match
  test("exact-match candidate is dropped (case-insensitive)", () => {
    expect(filterAcmeManagedFromSkip(["app.pro.com"], new Set(["app.pro.com"]))).toEqual([]);
    expect(filterAcmeManagedFromSkip(["App.Pro.Com"], new Set(["app.pro.com"]))).toEqual([]);
    expect(filterAcmeManagedFromSkip(["app.pro.com"], new Set(["APP.PRO.COM"]))).toEqual([]);
  });

  // Core contract — case (2): candidate is wildcard, ACME host is literal
  test("wildcard candidate that matches an ACME host is dropped", () => {
    expect(filterAcmeManagedFromSkip(["*.pro.com"], new Set(["app.pro.com"]))).toEqual([]);
  });

  test("wildcard candidate that matches no ACME host is kept", () => {
    expect(filterAcmeManagedFromSkip(["*.pro.com"], new Set(["api.other.com"]))).toEqual([
      "*.pro.com",
    ]);
  });

  // Core contract — case (3): ACME host is wildcard, candidate is literal.
  // This is the symmetric case the asd-side implementation missed before.
  test("literal candidate covered by an ACME wildcard is dropped", () => {
    expect(filterAcmeManagedFromSkip(["app.pro.com"], new Set(["*.pro.com"]))).toEqual([]);
  });

  test("literal candidate NOT covered by any ACME wildcard is kept", () => {
    expect(filterAcmeManagedFromSkip(["app.other.com"], new Set(["*.pro.com"]))).toEqual([
      "app.other.com",
    ]);
  });

  test("multi-ACME, multi-candidate", () => {
    expect(
      filterAcmeManagedFromSkip(["*.pro.com", "tunnel"], new Set(["app.pro.com", "tunnel.example"]))
    ).toEqual(["tunnel"]);
  });

  test("non-overlapping ACME entries don't strip anything", () => {
    const candidates = ["a.local", "b.local"];
    expect(filterAcmeManagedFromSkip(candidates, new Set(["c.example.com"]))).toEqual(candidates);
  });

  // Reviewer-pinned regression: a `*.api-*.example.com` skip candidate
  // covers `foo.api-prod.example.com` via generic glob (NOT the
  // single-label leading-wildcard branch). When that ACME host exists,
  // the candidate must be dropped.
  test("compound-wildcard candidate is evaluated as a generic glob", () => {
    expect(
      filterAcmeManagedFromSkip(
        ["*.api-*.example.com"],
        new Set(["foo.api-prod.example.com"]),
      ),
    ).toEqual([]);
  });
});

describe("applyLocalCaInstallTrust", () => {
  test("creates the apps.pki.certificate_authorities.local path when missing", () => {
    const cfg: Record<string, unknown> = {};
    applyLocalCaInstallTrust(cfg, false);
    const apps = cfg.apps as Record<string, unknown>;
    const pki = apps.pki as { certificate_authorities: Record<string, Record<string, unknown>> };
    expect(pki.certificate_authorities.local.install_trust).toBe(false);
  });

  test("preserves existing fields under apps.pki.certificate_authorities.local", () => {
    const cfg: Record<string, unknown> = {
      apps: {
        pki: {
          certificate_authorities: {
            local: { name: "asd-dev", root: { lifetime: "8760h" } },
          },
        },
      },
    };
    applyLocalCaInstallTrust(cfg, false);
    const local = (cfg.apps as Record<string, unknown>).pki as {
      certificate_authorities: { local: Record<string, unknown> };
    };
    expect(local.certificate_authorities.local.name).toBe("asd-dev");
    expect((local.certificate_authorities.local.root as Record<string, unknown>).lifetime).toBe(
      "8760h"
    );
    expect(local.certificate_authorities.local.install_trust).toBe(false);
  });

  test("idempotent: repeated calls converge", () => {
    const cfg: Record<string, unknown> = {};
    applyLocalCaInstallTrust(cfg, false);
    applyLocalCaInstallTrust(cfg, false);
    applyLocalCaInstallTrust(cfg, true);
    const apps = cfg.apps as Record<string, unknown>;
    const pki = apps.pki as { certificate_authorities: Record<string, Record<string, unknown>> };
    expect(pki.certificate_authorities.local.install_trust).toBe(true);
  });

  test("preserves unrelated apps", () => {
    const cfg: Record<string, unknown> = {
      apps: { http: { servers: { foo: { listen: [":80"] } } } },
    };
    applyLocalCaInstallTrust(cfg, false);
    const apps = cfg.apps as Record<string, unknown>;
    expect(apps.http).toBeDefined();
  });

  test("throws on non-object config (likely caller bug, surface it)", () => {
    expect(() =>
      applyLocalCaInstallTrust(null as unknown as Record<string, unknown>, false),
    ).toThrow(/config/);
    expect(() =>
      applyLocalCaInstallTrust(undefined as unknown as Record<string, unknown>, false),
    ).toThrow(/config/);
  });

  test("throws when an intermediate node exists but is the wrong shape", () => {
    // Permissive replacement (silently overwrite) was rejected — see the
    // helper docblock. These cases catch typos / config corruption rather
    // than mask them.
    expect(() =>
      applyLocalCaInstallTrust({ apps: "bad" as unknown as Record<string, unknown> }, false),
    ).toThrow(/config\.apps/);
    expect(() =>
      applyLocalCaInstallTrust(
        { apps: { pki: ["array-instead-of-object"] as unknown as Record<string, unknown> } },
        false,
      ),
    ).toThrow(/config\.apps\.pki/);
    expect(() =>
      applyLocalCaInstallTrust(
        {
          apps: {
            pki: {
              certificate_authorities: {
                local: 42 as unknown as Record<string, unknown>,
              },
            },
          },
        },
        false,
      ),
    ).toThrow(/local/);
  });
});
