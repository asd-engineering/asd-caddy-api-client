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
      redirectMode: "permanent",
      adminUrl: "http://127.0.0.1:2019",
    });

    expect(result.enableHsts).toBe(true);
    expect(result.hstsMaxAge).toBe(63072000);
    expect(result.frameOptions).toBe("SAMEORIGIN");
    expect(result.redirectMode).toBe("permanent");
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
