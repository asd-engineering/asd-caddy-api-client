/**
 * Unit tests for Zod schemas
 */
import { describe, test, expect } from "vitest";
import {
  DomainSchema,
  DialAddressSchema,
  ServiceRouteOptionsSchema,
  AddDomainWithAutoTlsOptionsSchema,
  LoadBalancerRouteOptionsSchema,
  CaddyAdapterSchema,
  AdaptOptionsSchema,
  validate,
} from "../schemas.js";

describe("DomainSchema", () => {
  test("validates correct domain names", () => {
    expect(() => DomainSchema.parse("example.com")).not.toThrow();
    expect(() => DomainSchema.parse("sub.example.com")).not.toThrow();
    expect(() => DomainSchema.parse("api.sub.example.com")).not.toThrow();
    expect(() => DomainSchema.parse("localhost")).not.toThrow();
  });

  test("rejects invalid domain names", () => {
    expect(() => DomainSchema.parse("")).toThrow();
    expect(() => DomainSchema.parse("-invalid.com")).toThrow();
    expect(() => DomainSchema.parse("invalid-.com")).toThrow();
    expect(() => DomainSchema.parse("inva lid.com")).toThrow();
  });
});

describe("DialAddressSchema", () => {
  test("validates correct dial addresses", () => {
    expect(() => DialAddressSchema.parse("127.0.0.1:3000")).not.toThrow();
    expect(() => DialAddressSchema.parse("localhost:8080")).not.toThrow();
    expect(() => DialAddressSchema.parse("example.com:443")).not.toThrow();
  });

  test("rejects invalid dial addresses", () => {
    expect(() => DialAddressSchema.parse("127.0.0.1")).toThrow();
    expect(() => DialAddressSchema.parse(":3000")).toThrow();
    expect(() => DialAddressSchema.parse("localhost")).toThrow();
    expect(() => DialAddressSchema.parse("localhost:")).toThrow();
  });
});

describe("CaddyAdapterSchema", () => {
  test("validates correct adapter names", () => {
    expect(() => CaddyAdapterSchema.parse("caddyfile")).not.toThrow();
    expect(() => CaddyAdapterSchema.parse("json")).not.toThrow();
    expect(() => CaddyAdapterSchema.parse("yaml")).not.toThrow();
    expect(() => CaddyAdapterSchema.parse("nginx")).not.toThrow();
    expect(() => CaddyAdapterSchema.parse("apache")).not.toThrow();
  });

  test("rejects invalid adapter names", () => {
    expect(() => CaddyAdapterSchema.parse("invalid")).toThrow();
    expect(() => CaddyAdapterSchema.parse("")).toThrow();
    expect(() => CaddyAdapterSchema.parse("CADDYFILE")).toThrow();
  });
});

describe("AdaptOptionsSchema", () => {
  test("validates config with default adapter", () => {
    const result = AdaptOptionsSchema.parse({ config: "example.com { respond OK }" });
    expect(result.config).toBe("example.com { respond OK }");
    expect(result.adapter).toBe("caddyfile");
  });

  test("validates config with explicit adapter", () => {
    const result = AdaptOptionsSchema.parse({
      config: '{"apps":{}}',
      adapter: "json",
    });
    expect(result.config).toBe('{"apps":{}}');
    expect(result.adapter).toBe("json");
  });

  test("rejects empty config", () => {
    expect(() => AdaptOptionsSchema.parse({ config: "" })).toThrow();
  });

  test("rejects invalid adapter", () => {
    expect(() =>
      AdaptOptionsSchema.parse({ config: "example.com {}", adapter: "invalid" })
    ).toThrow();
  });
});

describe("ServiceRouteOptionsSchema", () => {
  test("validates minimal options", () => {
    const result = ServiceRouteOptionsSchema.parse({
      dial: "127.0.0.1:3000",
    });

    expect(result.dial).toBe("127.0.0.1:3000");
    expect(result.enableHostRoute).toBe(true);
    expect(result.enablePathRoute).toBe(true);
    expect(result.stripPrefix).toBe(true);
    expect(result.priority).toBe(50);
    expect(result.pathRouteHost).toBe("asd.localhost");
    expect(result.serviceId).toBe("unknown");
  });

  test("validates full options", () => {
    const result = ServiceRouteOptionsSchema.parse({
      host: "api.localhost",
      path: "/api",
      pathRouteHost: "example.localhost",
      dial: "127.0.0.1:3000",
      serviceId: "my-service",
      enableHostRoute: false,
      enablePathRoute: true,
      stripPrefix: false,
      priority: 100,
      securityHeaders: {
        enableHsts: true,
        hstsMaxAge: 31536000,
        frameOptions: "SAMEORIGIN",
        enableCompression: true,
      },
    });

    expect(result.host).toBe("api.localhost");
    expect(result.path).toBe("/api");
    expect(result.enableHostRoute).toBe(false);
    expect(result.priority).toBe(100);
    expect(result.securityHeaders?.enableHsts).toBe(true);
  });

  test("rejects invalid dial address", () => {
    expect(() =>
      ServiceRouteOptionsSchema.parse({
        dial: "invalid",
      })
    ).toThrow();
  });
});

describe("AddDomainWithAutoTlsOptionsSchema", () => {
  test("validates minimal options", () => {
    const result = AddDomainWithAutoTlsOptionsSchema.parse({
      domain: "example.com",
      target: "127.0.0.1",
      targetPort: 3000,
    });

    expect(result.domain).toBe("example.com");
    expect(result.target).toBe("127.0.0.1");
    expect(result.targetPort).toBe(3000);
    expect(result.enableSecurityHeaders).toBe(true);
    expect(result.enableHsts).toBe(false);
    expect(result.redirectMode).toBe("none");
  });

  test("validates full options", () => {
    const result = AddDomainWithAutoTlsOptionsSchema.parse({
      domain: "example.com",
      target: "127.0.0.1",
      targetPort: 3000,
      enableSecurityHeaders: true,
      enableHsts: true,
      hstsMaxAge: 63072000,
      frameOptions: "SAMEORIGIN",
      enableCompression: false,
      redirectMode: "www_to_domain",
      adminUrl: "http://127.0.0.1:2019",
    });

    expect(result.enableHsts).toBe(true);
    expect(result.hstsMaxAge).toBe(63072000);
    expect(result.frameOptions).toBe("SAMEORIGIN");
    expect(result.redirectMode).toBe("www_to_domain");
  });

  test("rejects invalid port", () => {
    expect(() =>
      AddDomainWithAutoTlsOptionsSchema.parse({
        domain: "example.com",
        target: "127.0.0.1",
        targetPort: 70000, // Invalid port
      })
    ).toThrow();

    expect(() =>
      AddDomainWithAutoTlsOptionsSchema.parse({
        domain: "example.com",
        target: "127.0.0.1",
        targetPort: 0, // Invalid port
      })
    ).toThrow();
  });

  test("rejects invalid domain", () => {
    expect(() =>
      AddDomainWithAutoTlsOptionsSchema.parse({
        domain: "",
        target: "127.0.0.1",
        targetPort: 3000,
      })
    ).toThrow();
  });
});

describe("LoadBalancerRouteOptionsSchema", () => {
  test("validates minimal options", () => {
    const result = LoadBalancerRouteOptionsSchema.parse({
      host: "api.localhost",
      upstreams: ["127.0.0.1:3000", "127.0.0.1:3001"],
    });

    expect(result.host).toBe("api.localhost");
    expect(result.upstreams).toEqual(["127.0.0.1:3000", "127.0.0.1:3001"]);
    expect(result.policy).toBe("first");
    expect(result.healthCheckPath).toBe("/health");
    expect(result.healthCheckInterval).toBe("10s");
  });

  test("validates full options", () => {
    const result = LoadBalancerRouteOptionsSchema.parse({
      host: "api.localhost",
      upstreams: ["127.0.0.1:3000", "127.0.0.1:3001", "127.0.0.1:3002"],
      healthCheckPath: "/api/health",
      healthCheckInterval: "5s",
      policy: "round_robin",
      priority: 100,
    });

    expect(result.upstreams.length).toBe(3);
    expect(result.policy).toBe("round_robin");
    expect(result.healthCheckPath).toBe("/api/health");
    expect(result.priority).toBe(100);
  });

  test("rejects empty upstreams", () => {
    expect(() =>
      LoadBalancerRouteOptionsSchema.parse({
        host: "api.localhost",
        upstreams: [],
      })
    ).toThrow();
  });

  test("rejects invalid upstream format", () => {
    expect(() =>
      LoadBalancerRouteOptionsSchema.parse({
        host: "api.localhost",
        upstreams: ["invalid"],
      })
    ).toThrow();
  });
});

describe("validate helper", () => {
  test("returns parsed data on success", () => {
    const result = validate(DomainSchema, "example.com");
    expect(result).toBe("example.com");
  });

  test("throws on validation failure", () => {
    expect(() => validate(DomainSchema, "")).toThrow("Validation failed");
  });
});

// ============================================================================
// Advanced Caddy Schemas Tests
// ============================================================================

import {
  CaddyDurationSchema,
  ActiveHealthChecksSchema,
  PassiveHealthChecksSchema,
  HealthChecksSchema,
  LoadBalancingSchema,
  UpstreamSchema,
  ExtendedRouteMatcherSchema,
  ReverseProxyHandlerSchema,
  CaddyRouteMatcherSchema,
  CaddyRouteSchema,
} from "../schemas.js";

describe("CaddyDurationSchema", () => {
  test("validates integer nanoseconds", () => {
    expect(() => CaddyDurationSchema.parse(5000000000)).not.toThrow();
    expect(() => CaddyDurationSchema.parse(0)).not.toThrow();
    expect(() => CaddyDurationSchema.parse(-1000)).not.toThrow(); // negative nanoseconds
  });

  test("validates single unit duration strings", () => {
    expect(() => CaddyDurationSchema.parse("10s")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1m")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("2h")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("500ms")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("100us")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("100µs")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("50ns")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1d")).not.toThrow();
  });

  test("validates combined unit duration strings", () => {
    // From Caddy Go source tests
    expect(() => CaddyDurationSchema.parse("1h30m")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1d30m")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1m2d")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1m2d30s")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1d2d")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("30s500ms")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("2h45m30s")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1h30m45s100ms")).not.toThrow();
  });

  test("validates decimal duration values", () => {
    expect(() => CaddyDurationSchema.parse("1.5s")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1.5d")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("4m1.25d")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("2.5h")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("100.25ms")).not.toThrow();
  });

  test("validates negative duration strings", () => {
    expect(() => CaddyDurationSchema.parse("-30s")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("-1h30m")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("-1.25d12h")).not.toThrow();
  });

  test("validates zero duration (special case)", () => {
    // "0" is valid in Go's time.ParseDuration without a unit
    expect(() => CaddyDurationSchema.parse("0")).not.toThrow();
    expect(CaddyDurationSchema.parse("0")).toBe("0");
  });

  test("rejects invalid duration strings", () => {
    expect(() => CaddyDurationSchema.parse("invalid")).toThrow();
    expect(() => CaddyDurationSchema.parse("10")).toThrow(); // missing unit
    expect(() => CaddyDurationSchema.parse("10x")).toThrow(); // invalid unit
    expect(() => CaddyDurationSchema.parse("")).toThrow(); // empty
    expect(() => CaddyDurationSchema.parse("h30m")).toThrow(); // missing number
    expect(() => CaddyDurationSchema.parse("1w")).toThrow(); // weeks not supported
  });
});

describe("ActiveHealthChecksSchema", () => {
  test("validates minimal config", () => {
    const result = ActiveHealthChecksSchema.parse({});
    expect(result).toEqual({});
  });

  test("validates full config", () => {
    const result = ActiveHealthChecksSchema.parse({
      uri: "/health?ready=true",
      port: 8080,
      headers: { "X-Health-Check": ["true"] },
      follow_redirects: true,
      interval: "30s",
      timeout: "5s",
      passes: 2,
      fails: 3,
      max_size: 1024,
      expect_status: 200,
      expect_body: "healthy",
    });

    expect(result.uri).toBe("/health?ready=true");
    expect(result.port).toBe(8080);
    expect(result.interval).toBe("30s");
    expect(result.expect_status).toBe(200);
  });

  test("rejects invalid port", () => {
    expect(() => ActiveHealthChecksSchema.parse({ port: 70000 })).toThrow();
  });

  test("rejects invalid status code", () => {
    expect(() => ActiveHealthChecksSchema.parse({ expect_status: 999 })).toThrow();
  });
});

describe("PassiveHealthChecksSchema", () => {
  test("validates full config", () => {
    const result = PassiveHealthChecksSchema.parse({
      fail_duration: "30s",
      max_fails: 3,
      unhealthy_request_count: 100,
      unhealthy_status: [500, 502, 503],
      unhealthy_latency: "10s",
    });

    expect(result.fail_duration).toBe("30s");
    expect(result.max_fails).toBe(3);
    expect(result.unhealthy_status).toEqual([500, 502, 503]);
  });
});

describe("HealthChecksSchema", () => {
  test("validates combined health checks", () => {
    const result = HealthChecksSchema.parse({
      active: {
        uri: "/health",
        interval: "10s",
        timeout: "5s",
      },
      passive: {
        fail_duration: "30s",
        max_fails: 3,
      },
    });

    expect(result.active?.uri).toBe("/health");
    expect(result.passive?.max_fails).toBe(3);
  });
});

describe("LoadBalancingSchema", () => {
  test("validates selection policies", () => {
    const result = LoadBalancingSchema.parse({
      selection_policy: { policy: "round_robin" },
      retries: 3,
      try_duration: "30s",
      try_interval: "250ms",
    });

    expect(result.selection_policy?.policy).toBe("round_robin");
    expect(result.retries).toBe(3);
  });

  test("validates all policy types", () => {
    const policies = [
      "first",
      "random",
      "least_conn",
      "round_robin",
      "ip_hash",
      "uri_hash",
      "header",
      "cookie",
    ];
    for (const policy of policies) {
      expect(() =>
        LoadBalancingSchema.parse({
          selection_policy: { policy },
        })
      ).not.toThrow();
    }
  });
});

describe("UpstreamSchema", () => {
  test("validates upstream with max_requests", () => {
    const result = UpstreamSchema.parse({
      dial: "localhost:3000",
      max_requests: 100,
    });

    expect(result.dial).toBe("localhost:3000");
    expect(result.max_requests).toBe(100);
  });

  test("rejects empty dial", () => {
    expect(() => UpstreamSchema.parse({ dial: "" })).toThrow();
  });
});

describe("ExtendedRouteMatcherSchema", () => {
  test("validates basic matchers", () => {
    const result = ExtendedRouteMatcherSchema.parse({
      host: ["example.com"],
      path: ["/api/*"],
      method: ["GET", "POST"],
    });

    expect(result.host).toEqual(["example.com"]);
    expect(result.path).toEqual(["/api/*"]);
  });

  test("validates IP-based matchers", () => {
    const result = ExtendedRouteMatcherSchema.parse({
      client_ip: { ranges: ["192.168.0.0/16", "10.0.0.0/8"] },
      remote_ip: { ranges: ["1.2.3.4/32"] },
    });

    expect(result.client_ip?.ranges).toHaveLength(2);
    expect(result.remote_ip?.ranges).toEqual(["1.2.3.4/32"]);
  });

  test("validates regex matchers", () => {
    const result = ExtendedRouteMatcherSchema.parse({
      path_regexp: { name: "api_version", pattern: "^/api/v[0-9]+/" },
      header_regexp: {
        "Content-Type": { pattern: "^application/json" },
      },
    });

    expect(result.path_regexp?.pattern).toBe("^/api/v[0-9]+/");
  });

  test("validates protocol matcher", () => {
    const result = ExtendedRouteMatcherSchema.parse({
      protocol: "https",
    });

    expect(result.protocol).toBe("https");
  });

  test("validates CEL expression matcher", () => {
    const result = ExtendedRouteMatcherSchema.parse({
      expression: "{http.request.uri.path}.startsWith('/api')",
    });

    expect(result.expression).toContain("startsWith");
  });

  test("validates negation matcher", () => {
    const result = ExtendedRouteMatcherSchema.parse({
      not: [{ path: ["/health", "/metrics"] }],
    });

    expect(result.not).toHaveLength(1);
    expect(result.not?.[0].path).toEqual(["/health", "/metrics"]);
  });

  test("validates TLS matcher", () => {
    // Match only completed TLS handshakes
    const result = ExtendedRouteMatcherSchema.parse({
      tls: { handshake_complete: true },
    });
    expect(result.tls?.handshake_complete).toBe(true);

    // Match early data (0-RTT) requests
    const earlyData = ExtendedRouteMatcherSchema.parse({
      tls: { handshake_complete: false },
    });
    expect(earlyData.tls?.handshake_complete).toBe(false);

    // Empty TLS matcher (matches any TLS request)
    const anyTls = ExtendedRouteMatcherSchema.parse({
      tls: {},
    });
    expect(anyTls.tls).toEqual({});
  });

  test("validates file matcher", () => {
    // Basic try_files configuration
    const result = ExtendedRouteMatcherSchema.parse({
      file: {
        root: "/var/www",
        try_files: [
          "{http.request.uri.path}",
          "{http.request.uri.path}/index.html",
          "/fallback.html",
        ],
      },
    });
    expect(result.file?.root).toBe("/var/www");
    expect(result.file?.try_files).toHaveLength(3);

    // PHP-style split path
    const phpConfig = ExtendedRouteMatcherSchema.parse({
      file: {
        try_files: ["{http.request.uri.path}", "{http.request.uri.path}/index.php"],
        split_path: [".php"],
      },
    });
    expect(phpConfig.file?.split_path).toEqual([".php"]);

    // All try_policy options
    const policies = [
      "first_exist",
      "first_exist_fallback",
      "smallest_size",
      "largest_size",
      "most_recently_modified",
    ] as const;
    for (const policy of policies) {
      expect(() =>
        ExtendedRouteMatcherSchema.parse({
          file: { try_policy: policy },
        })
      ).not.toThrow();
    }
  });

  test("rejects invalid file matcher try_policy", () => {
    expect(() =>
      ExtendedRouteMatcherSchema.parse({
        file: { try_policy: "invalid_policy" },
      })
    ).toThrow();
  });
});

// Regression coverage for CaddyRouteMatcherSchema — the schema actually
// wired into CaddyRouteSchema.match (used by buildServiceRoutes() and
// every other route builder), unlike ExtendedRouteMatcherSchema above
// (equivalent coverage, but never imported/used anywhere in this
// package). Before this fix, CaddyRouteMatcherSchema only recognized
// host/path/method/header/query — zod's default "strip" mode meant
// protocol/remote_ip/client_ip/header_regexp/path_regexp/not/expression
// weren't rejected, they were silently DROPPED from the parsed result.
// A route meant to be restricted by e.g. remote_ip would parse
// successfully but end up with no IP restriction at all. Every shape
// here is verified against real Caddy via `caddy validate`, not just
// schema-shape-correct — see the doc comment on CaddyRouteMatcherSchema.
describe("CaddyRouteMatcherSchema", () => {
  test("preserves protocol instead of silently dropping it", () => {
    const result = CaddyRouteMatcherSchema.parse({ protocol: "https" });
    expect(result.protocol).toBe("https");
  });

  test("preserves remote_ip instead of silently dropping it", () => {
    const result = CaddyRouteMatcherSchema.parse({
      remote_ip: { ranges: ["10.0.0.0/8"] },
    });
    expect(result.remote_ip?.ranges).toEqual(["10.0.0.0/8"]);
  });

  test("preserves client_ip instead of silently dropping it", () => {
    const result = CaddyRouteMatcherSchema.parse({
      client_ip: { ranges: ["192.168.0.0/16"] },
    });
    expect(result.client_ip?.ranges).toEqual(["192.168.0.0/16"]);
  });

  test("preserves path_regexp (flat shape, not the tygo-embedding-artifact nested shape)", () => {
    const result = CaddyRouteMatcherSchema.parse({
      path_regexp: { name: "api_version", pattern: "^/api/v[0-9]+/" },
    });
    expect(result.path_regexp?.pattern).toBe("^/api/v[0-9]+/");
  });

  test("preserves header_regexp instead of silently dropping it", () => {
    const result = CaddyRouteMatcherSchema.parse({
      header_regexp: { "Content-Type": { pattern: "^application/json" } },
    });
    expect(result.header_regexp?.["Content-Type"]?.pattern).toBe("^application/json");
  });

  test("preserves not instead of silently dropping it", () => {
    const result = CaddyRouteMatcherSchema.parse({
      not: [{ path: ["/health", "/metrics"] }],
    });
    expect(result.not).toEqual([{ path: ["/health", "/metrics"] }]);
  });

  test("preserves expression instead of silently dropping it", () => {
    const result = CaddyRouteMatcherSchema.parse({
      expression: "{http.request.uri.path}.startsWith('/api')",
    });
    expect(result.expression).toContain("startsWith");
  });

  test("rejects protocol wrapped in an array — real Caddy's MatchProtocol is a plain string", () => {
    // https://github.com/caddyserver/caddy: caddyhttp.MatchProtocol unmarshals
    // a JSON string, not an array — confirmed via `caddy validate`.
    expect(() => CaddyRouteMatcherSchema.parse({ protocol: ["https"] })).toThrow();
  });
});

describe("CaddyRouteSchema — matcher passthrough", () => {
  test("a full route with every extended matcher round-trips without data loss", () => {
    const route = CaddyRouteSchema.parse({
      "@id": "api-route",
      match: [
        {
          host: ["api.example.com"],
          path: ["/v1/*"],
          path_regexp: { pattern: "^/v[0-9]+/" },
          method: ["GET", "POST"],
          header: { "X-Api-Key": ["*"] },
          header_regexp: { "X-Request-Id": { pattern: "^[a-f0-9-]+$" } },
          query: { debug: ["true"] },
          client_ip: { ranges: ["192.168.0.0/16"] },
          remote_ip: { ranges: ["10.0.0.0/8"] },
          protocol: "https",
          expression: "header({'X-Test': '1'})",
          not: [{ path: ["/v1/admin/*"] }],
        },
      ],
      handle: [{ handler: "static_response", body: "ok" }],
    });

    const match = route.match?.[0];
    expect(match?.protocol).toBe("https");
    expect(match?.remote_ip?.ranges).toEqual(["10.0.0.0/8"]);
    expect(match?.client_ip?.ranges).toEqual(["192.168.0.0/16"]);
    expect(match?.path_regexp?.pattern).toBe("^/v[0-9]+/");
    expect(match?.header_regexp?.["X-Request-Id"]?.pattern).toBe("^[a-f0-9-]+$");
    expect(match?.not).toEqual([{ path: ["/v1/admin/*"] }]);
    expect(match?.expression).toContain("header(");
  });
});

describe("ReverseProxyHandlerSchema", () => {
  test("validates minimal config", () => {
    const result = ReverseProxyHandlerSchema.parse({
      handler: "reverse_proxy",
      upstreams: [{ dial: "localhost:3000" }],
    });

    expect(result.handler).toBe("reverse_proxy");
    expect(result.upstreams?.[0].dial).toBe("localhost:3000");
  });

  test("validates full config with health checks and load balancing", () => {
    const result = ReverseProxyHandlerSchema.parse({
      handler: "reverse_proxy",
      upstreams: [
        { dial: "localhost:3000", max_requests: 100 },
        { dial: "localhost:3001", max_requests: 100 },
      ],
      load_balancing: {
        selection_policy: { policy: "round_robin" },
        retries: 3,
        try_duration: "30s",
      },
      health_checks: {
        active: {
          uri: "/health",
          interval: "10s",
          timeout: "5s",
          expect_status: 200,
        },
        passive: {
          fail_duration: "30s",
          max_fails: 3,
        },
      },
      flush_interval: "100ms",
      headers: {
        request: {
          set: { "X-Forwarded-Proto": ["https"] },
        },
        response: {
          delete: ["Server"],
        },
      },
    });

    expect(result.upstreams).toHaveLength(2);
    expect(result.load_balancing?.selection_policy?.policy).toBe("round_robin");
    expect(result.health_checks?.active?.expect_status).toBe(200);
    expect(result.headers?.request?.set?.["X-Forwarded-Proto"]).toEqual(["https"]);
  });

  test("rejects wrong handler type", () => {
    expect(() =>
      ReverseProxyHandlerSchema.parse({
        handler: "static_response",
      })
    ).toThrow();
  });
});

// ============================================================================
// Handler-Specific Schema Tests
// ============================================================================

import {
  HeadersHandlerSchema,
  StaticResponseHandlerSchema,
  AuthenticationHandlerSchema,
  RewriteHandlerSchema,
  EncodeHandlerSchema,
  KnownCaddyHandlerSchema,
  CaddyHandlerSchema,
} from "../schemas.js";

describe("HeadersHandlerSchema", () => {
  test("validates security headers", () => {
    const result = HeadersHandlerSchema.parse({
      handler: "headers",
      response: {
        set: {
          "X-Frame-Options": ["DENY"],
          "X-Content-Type-Options": ["nosniff"],
        },
      },
    });
    expect(result.handler).toBe("headers");
    expect(result.response?.set?.["X-Frame-Options"]).toEqual(["DENY"]);
  });

  test("validates request headers", () => {
    const result = HeadersHandlerSchema.parse({
      handler: "headers",
      request: {
        set: { "X-Custom-Header": ["value"] },
        add: { "X-Another": ["added"] },
        delete: ["X-Remove-Me"],
      },
    });
    expect(result.request?.set?.["X-Custom-Header"]).toEqual(["value"]);
    expect(result.request?.delete).toEqual(["X-Remove-Me"]);
  });

  test("validates deferred response headers", () => {
    const result = HeadersHandlerSchema.parse({
      handler: "headers",
      response: {
        deferred: true,
        set: { "Cache-Control": ["no-store"] },
      },
    });
    expect(result.response?.deferred).toBe(true);
  });

  test("rejects wrong handler type", () => {
    expect(() =>
      HeadersHandlerSchema.parse({
        handler: "reverse_proxy",
      })
    ).toThrow();
  });
});

describe("StaticResponseHandlerSchema", () => {
  test("validates health check response", () => {
    const result = StaticResponseHandlerSchema.parse({
      handler: "static_response",
      status_code: 200,
      body: "OK",
    });
    expect(result.status_code).toBe(200);
    expect(result.body).toBe("OK");
  });

  test("validates JSON response with headers", () => {
    const result = StaticResponseHandlerSchema.parse({
      handler: "static_response",
      status_code: 200,
      body: '{"status": "healthy"}',
      headers: {
        "Content-Type": ["application/json"],
      },
    });
    expect(result.headers?.["Content-Type"]).toEqual(["application/json"]);
  });

  test("validates status_code as string", () => {
    const result = StaticResponseHandlerSchema.parse({
      handler: "static_response",
      status_code: "204",
    });
    expect(result.status_code).toBe("204");
  });

  test("validates close and abort options", () => {
    const closeResult = StaticResponseHandlerSchema.parse({
      handler: "static_response",
      close: true,
    });
    expect(closeResult.close).toBe(true);

    const abortResult = StaticResponseHandlerSchema.parse({
      handler: "static_response",
      abort: true,
    });
    expect(abortResult.abort).toBe(true);
  });

  test("rejects invalid status code", () => {
    expect(() =>
      StaticResponseHandlerSchema.parse({
        handler: "static_response",
        status_code: 999,
      })
    ).toThrow();

    expect(() =>
      StaticResponseHandlerSchema.parse({
        handler: "static_response",
        status_code: 50,
      })
    ).toThrow();
  });

  test("rejects wrong handler type", () => {
    expect(() =>
      StaticResponseHandlerSchema.parse({
        handler: "headers",
      })
    ).toThrow();
  });
});

describe("AuthenticationHandlerSchema", () => {
  test("validates basic auth with accounts", () => {
    const result = AuthenticationHandlerSchema.parse({
      handler: "authentication",
      providers: {
        http_basic: {
          accounts: [
            { username: "admin", password: "$2a$14$..." },
            { username: "user", password: "$2a$14$..." },
          ],
        },
      },
    });
    expect(result.providers?.http_basic?.accounts).toHaveLength(2);
    expect(result.providers?.http_basic?.accounts?.[0].username).toBe("admin");
  });

  test("validates basic auth with realm", () => {
    const result = AuthenticationHandlerSchema.parse({
      handler: "authentication",
      providers: {
        http_basic: {
          accounts: [{ username: "admin", password: "hash" }],
          realm: "Restricted Area",
        },
      },
    });
    expect(result.providers?.http_basic?.realm).toBe("Restricted Area");
  });

  test("validates basic auth with hash algorithm", () => {
    const result = AuthenticationHandlerSchema.parse({
      handler: "authentication",
      providers: {
        http_basic: {
          accounts: [{ username: "admin", password: "hash" }],
          hash: { algorithm: "bcrypt" },
        },
      },
    });
    expect(result.providers?.http_basic?.hash?.algorithm).toBe("bcrypt");
  });

  test("validates minimal authentication handler", () => {
    const result = AuthenticationHandlerSchema.parse({
      handler: "authentication",
    });
    expect(result.handler).toBe("authentication");
  });

  test("rejects wrong handler type", () => {
    expect(() =>
      AuthenticationHandlerSchema.parse({
        handler: "static_response",
      })
    ).toThrow();
  });
});

describe("RewriteHandlerSchema", () => {
  test("validates URI rewrite", () => {
    const result = RewriteHandlerSchema.parse({
      handler: "rewrite",
      uri: "/new-path{http.request.uri.query}",
    });
    expect(result.uri).toBe("/new-path{http.request.uri.query}");
  });

  test("validates strip_path_prefix", () => {
    const result = RewriteHandlerSchema.parse({
      handler: "rewrite",
      strip_path_prefix: "/api/v1",
    });
    expect(result.strip_path_prefix).toBe("/api/v1");
  });

  test("validates strip_path_suffix", () => {
    const result = RewriteHandlerSchema.parse({
      handler: "rewrite",
      strip_path_suffix: ".html",
    });
    expect(result.strip_path_suffix).toBe(".html");
  });

  test("validates uri_substring replacement", () => {
    const result = RewriteHandlerSchema.parse({
      handler: "rewrite",
      uri_substring: [
        { find: "/old/", replace: "/new/" },
        { find: ".php", replace: "", limit: 1 },
      ],
    });
    expect(result.uri_substring).toHaveLength(2);
    expect(result.uri_substring?.[0].find).toBe("/old/");
    expect(result.uri_substring?.[1].limit).toBe(1);
  });

  test("rejects wrong handler type", () => {
    expect(() =>
      RewriteHandlerSchema.parse({
        handler: "headers",
      })
    ).toThrow();
  });
});

describe("EncodeHandlerSchema", () => {
  test("validates gzip encoding", () => {
    const result = EncodeHandlerSchema.parse({
      handler: "encode",
      encodings: {
        gzip: {},
      },
    });
    expect(result.encodings?.gzip).toBeDefined();
  });

  test("validates multiple encodings with preference", () => {
    const result = EncodeHandlerSchema.parse({
      handler: "encode",
      encodings: {
        gzip: {},
        zstd: {},
        br: {},
      },
      prefer: ["zstd", "br", "gzip"],
    });
    expect(result.prefer).toEqual(["zstd", "br", "gzip"]);
  });

  test("validates minimum_length option", () => {
    const result = EncodeHandlerSchema.parse({
      handler: "encode",
      encodings: { gzip: {} },
      minimum_length: 1024,
    });
    expect(result.minimum_length).toBe(1024);
  });

  test("rejects non-positive minimum_length", () => {
    expect(() =>
      EncodeHandlerSchema.parse({
        handler: "encode",
        minimum_length: 0,
      })
    ).toThrow();

    expect(() =>
      EncodeHandlerSchema.parse({
        handler: "encode",
        minimum_length: -100,
      })
    ).toThrow();
  });

  test("rejects wrong handler type", () => {
    expect(() =>
      EncodeHandlerSchema.parse({
        handler: "reverse_proxy",
      })
    ).toThrow();
  });
});

describe("KnownCaddyHandlerSchema", () => {
  test("validates reverse_proxy handler", () => {
    const result = KnownCaddyHandlerSchema.parse({
      handler: "reverse_proxy",
      upstreams: [{ dial: "localhost:3000" }],
    });
    expect(result.handler).toBe("reverse_proxy");
  });

  test("validates headers handler", () => {
    const result = KnownCaddyHandlerSchema.parse({
      handler: "headers",
      response: { set: { "X-Test": ["value"] } },
    });
    expect(result.handler).toBe("headers");
  });

  test("validates static_response handler", () => {
    const result = KnownCaddyHandlerSchema.parse({
      handler: "static_response",
      status_code: 200,
      body: "Hello",
    });
    expect(result.handler).toBe("static_response");
  });

  test("validates authentication handler", () => {
    const result = KnownCaddyHandlerSchema.parse({
      handler: "authentication",
      providers: { http_basic: { accounts: [] } },
    });
    expect(result.handler).toBe("authentication");
  });

  test("validates rewrite handler", () => {
    const result = KnownCaddyHandlerSchema.parse({
      handler: "rewrite",
      uri: "/new",
    });
    expect(result.handler).toBe("rewrite");
  });

  test("validates encode handler", () => {
    const result = KnownCaddyHandlerSchema.parse({
      handler: "encode",
      encodings: { gzip: {} },
    });
    expect(result.handler).toBe("encode");
  });

  test("rejects unknown handler types", () => {
    // Custom plugin handlers are not in KnownCaddyHandlerSchema
    expect(() =>
      KnownCaddyHandlerSchema.parse({
        handler: "custom_plugin",
        config: { key: "value" },
      })
    ).toThrow();
  });
});

describe("CaddyHandlerSchema", () => {
  test("validates known handlers strictly", () => {
    const result = CaddyHandlerSchema.parse({
      handler: "headers",
      response: { set: { "X-Test": ["value"] } },
    });
    expect(result.handler).toBe("headers");
  });

  test("allows unknown handlers through fallback", () => {
    const result = CaddyHandlerSchema.parse({
      handler: "file_server",
      root: "/var/www",
      index_names: ["index.html"],
    });
    expect(result.handler).toBe("file_server");
  });

  test("allows templates handler", () => {
    const result = CaddyHandlerSchema.parse({
      handler: "templates",
      file_root: "/var/www/templates",
    });
    expect(result.handler).toBe("templates");
  });

  test("allows vars handler", () => {
    const result = CaddyHandlerSchema.parse({
      handler: "vars",
      root: "/var/www",
    });
    expect(result.handler).toBe("vars");
  });

  test("validates multiple handlers in sequence", () => {
    const handlers = [
      { handler: "headers", response: { set: { "X-Test": ["1"] } } },
      { handler: "reverse_proxy", upstreams: [{ dial: "localhost:3000" }] },
    ];

    for (const h of handlers) {
      expect(() => CaddyHandlerSchema.parse(h)).not.toThrow();
    }
  });
});
