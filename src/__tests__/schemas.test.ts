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
} from "../schemas.js";

describe("CaddyDurationSchema", () => {
  test("validates integer nanoseconds", () => {
    expect(() => CaddyDurationSchema.parse(5000000000)).not.toThrow();
    expect(() => CaddyDurationSchema.parse(0)).not.toThrow();
  });

  test("validates Go duration strings", () => {
    expect(() => CaddyDurationSchema.parse("10s")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1m")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("2h")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("500ms")).not.toThrow();
    expect(() => CaddyDurationSchema.parse("1.5s")).not.toThrow();
  });

  test("rejects invalid duration strings", () => {
    expect(() => CaddyDurationSchema.parse("invalid")).toThrow();
    expect(() => CaddyDurationSchema.parse("10")).toThrow();
    expect(() => CaddyDurationSchema.parse("10x")).toThrow();
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
