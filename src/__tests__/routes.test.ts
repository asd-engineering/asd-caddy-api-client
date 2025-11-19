/**
 * Unit tests for route builders
 */
import { describe, test, expect } from "vitest";
import {
  buildServiceRoutes,
  buildHealthCheckRoute,
  buildHostRoute,
  buildPathRoute,
  buildLoadBalancerRoute,
  buildReverseProxyHandler,
  buildSecurityHeadersHandler,
  buildRewriteHandler,
  buildRedirectRoute,
  buildCompressionHandler,
} from "../caddy/routes.js";

describe("buildHealthCheckRoute", () => {
  test("creates health check route", () => {
    const route = buildHealthCheckRoute({
      host: "api.localhost",
      serviceId: "my-service",
    });

    expect(route.match).toBeDefined();
    expect(route.match![0].host).toEqual(["api.localhost"]);
    expect(route.match![0].path).toEqual(["/asd/healthcheck"]);
    expect(route.handle[0].handler).toBe("static_response");
    expect(route.handle[0].status_code).toBe(200);
    expect(route.terminal).toBe(true);
  });

  test("includes priority if specified", () => {
    const route = buildHealthCheckRoute({
      host: "api.localhost",
      serviceId: "my-service",
      priority: 100,
    });

    expect((route as { priority?: number }).priority).toBe(100);
  });
});

describe("buildHostRoute", () => {
  test("creates basic host route", () => {
    const route = buildHostRoute({
      host: "api.localhost",
      dial: "127.0.0.1:3000",
    });

    expect(route.match![0].host).toEqual(["api.localhost"]);
    expect(route.handle.length).toBe(1);
    expect(route.handle[0].handler).toBe("reverse_proxy");
    expect(route.terminal).toBe(true);
  });

  test("includes security headers", () => {
    const route = buildHostRoute({
      host: "api.localhost",
      dial: "127.0.0.1:3000",
      securityHeaders: {
        enableHsts: true,
        hstsMaxAge: 31536000,
        frameOptions: "DENY",
        enableCompression: true,
      },
    });

    expect(route.handle.length).toBe(2); // headers + reverse_proxy
    expect(route.handle[0].handler).toBe("headers");
    expect(route.handle[1].handler).toBe("reverse_proxy");
  });

  test("includes basic auth", () => {
    const route = buildHostRoute({
      host: "api.localhost",
      dial: "127.0.0.1:3000",
      basicAuth: {
        enabled: true,
        username: "admin",
        passwordHash: "$2y$10$...",
      },
    });

    expect(route.handle.length).toBe(2); // auth + reverse_proxy
    expect(route.handle[0].handler).toBe("authentication");
  });

  test("includes both security headers and basic auth", () => {
    const route = buildHostRoute({
      host: "api.localhost",
      dial: "127.0.0.1:3000",
      securityHeaders: {
        enableHsts: true,
        hstsMaxAge: 31536000,
        frameOptions: "DENY",
        enableCompression: true,
      },
      basicAuth: {
        enabled: true,
        username: "admin",
        passwordHash: "$2y$10$...",
      },
    });

    expect(route.handle.length).toBe(3); // headers + auth + reverse_proxy
  });
});

describe("buildPathRoute", () => {
  test("creates basic path route", () => {
    const route = buildPathRoute({
      path: "/api",
      host: "example.localhost",
      dial: "127.0.0.1:3000",
    });

    expect(route.match![0].host).toEqual(["example.localhost"]);
    expect(route.match![0].path).toEqual(["/api*"]);
    expect(route.handle.length).toBe(2); // rewrite + reverse_proxy
    expect(route.handle[0].handler).toBe("rewrite");
    expect(route.handle[1].handler).toBe("reverse_proxy");
  });

  test("skips rewrite when stripPrefix is false", () => {
    const route = buildPathRoute({
      path: "/api",
      host: "example.localhost",
      dial: "127.0.0.1:3000",
      stripPrefix: false,
    });

    expect(route.handle.length).toBe(1); // Only reverse_proxy
    expect(route.handle[0].handler).toBe("reverse_proxy");
  });
});

describe("buildLoadBalancerRoute", () => {
  test("creates load balancer route with default policy", () => {
    const route = buildLoadBalancerRoute({
      host: "api.localhost",
      upstreams: ["127.0.0.1:3000", "127.0.0.1:3001"],
    });

    expect(route.match![0].host).toEqual(["api.localhost"]);
    expect(route.handle[0].handler).toBe("reverse_proxy");
    expect(route.handle[0].upstreams).toEqual([
      { dial: "127.0.0.1:3000" },
      { dial: "127.0.0.1:3001" },
    ]);
    expect(route.handle[0].health_checks).toBeDefined();
  });

  test("creates load balancer route with round_robin policy", () => {
    const route = buildLoadBalancerRoute({
      host: "api.localhost",
      upstreams: ["127.0.0.1:3000", "127.0.0.1:3001"],
      policy: "round_robin",
    });

    expect(route.handle[0].load_balancing).toBeDefined();
    expect(route.handle[0].load_balancing.selection_policy?.policy).toBe("round_robin");
  });

  test("uses custom health check settings", () => {
    const route = buildLoadBalancerRoute({
      host: "api.localhost",
      upstreams: ["127.0.0.1:3000"],
      healthCheckPath: "/api/health",
      healthCheckInterval: "5s",
    });

    expect(route.handle[0].health_checks.active.path).toBe("/api/health");
    expect(route.handle[0].health_checks.active.interval).toBe("5s");
  });
});

describe("buildServiceRoutes", () => {
  test("creates host route only", () => {
    const routes = buildServiceRoutes({
      host: "api.localhost",
      dial: "127.0.0.1:3000",
      enablePathRoute: false,
    });

    expect(routes.length).toBe(2); // health check + service route
    expect(routes[0].match![0].path).toEqual(["/asd/healthcheck"]);
    expect(routes[1].match![0].host).toEqual(["api.localhost"]);
  });

  test("creates path route only", () => {
    const routes = buildServiceRoutes({
      path: "/api",
      dial: "127.0.0.1:3000",
      enableHostRoute: false,
    });

    expect(routes.length).toBe(2); // health check + service route
    expect(routes[1].match![0].path).toEqual(["/api*"]);
  });

  test("creates both host and path routes", () => {
    const routes = buildServiceRoutes({
      host: "api.localhost",
      path: "/api",
      dial: "127.0.0.1:3000",
    });

    expect(routes.length).toBe(4); // 2 health checks + 2 service routes
  });

  test("sets correct priorities", () => {
    const routes = buildServiceRoutes({
      host: "api.localhost",
      dial: "127.0.0.1:3000",
      priority: 50,
    });

    const healthCheck = routes[0] as { priority?: number };
    const serviceRoute = routes[1] as { priority?: number };

    expect(healthCheck.priority).toBe(1050); // priority + 1000
    expect(serviceRoute.priority).toBe(50);
  });
});

describe("buildReverseProxyHandler", () => {
  test("creates reverse proxy handler", () => {
    const handler = buildReverseProxyHandler("127.0.0.1:3000");

    expect(handler.handler).toBe("reverse_proxy");
    expect(handler.upstreams).toEqual([{ dial: "127.0.0.1:3000" }]);
    expect(handler.transport).toEqual({ protocol: "http" });
  });
});

describe("buildSecurityHeadersHandler", () => {
  test("creates security headers without HSTS", () => {
    const handler = buildSecurityHeadersHandler({
      enableHsts: false,
      frameOptions: "DENY",
      enableCompression: true,
    });

    expect(handler.handler).toBe("headers");
    expect(handler.headers?.response?.set?.["X-Frame-Options"]).toEqual(["DENY"]);
    expect(handler.headers?.response?.set?.["Strict-Transport-Security"]).toBeUndefined();
  });

  test("creates security headers with HSTS", () => {
    const handler = buildSecurityHeadersHandler({
      enableHsts: true,
      hstsMaxAge: 31536000,
      frameOptions: "SAMEORIGIN",
      enableCompression: true,
    });

    expect(handler.headers?.response?.set?.["Strict-Transport-Security"]).toEqual([
      "max-age=31536000; includeSubDomains",
    ]);
    expect(handler.headers?.response?.set?.["X-Frame-Options"]).toEqual(["SAMEORIGIN"]);
  });
});

describe("buildRewriteHandler", () => {
  test("creates rewrite handler", () => {
    const handler = buildRewriteHandler("/api");

    expect(handler.handler).toBe("rewrite");
    expect(handler.strip_path_prefix).toBe("/api");
  });
});

describe("buildRedirectRoute", () => {
  test("creates www to domain redirect with permanent status", () => {
    const route = buildRedirectRoute({
      fromHost: "www.example.com",
      toHost: "example.com",
      permanent: true,
      id: "example.com-redirect",
    });

    expect(route["@id"]).toBe("example.com-redirect");
    expect(route.match).toBeDefined();
    expect(route.match![0].host).toEqual(["www.example.com"]);
    expect(route.handle[0].handler).toBe("static_response");
    expect(route.handle[0].status_code).toBe(308); // Uses 308 instead of 301
    expect(route.handle[0].headers?.Location).toEqual(["https://example.com{http.request.uri}"]);
    expect(route.terminal).toBe(true);
  });

  test("creates domain to www redirect with temporary status", () => {
    const route = buildRedirectRoute({
      fromHost: "example.com",
      toHost: "www.example.com",
      permanent: false,
      id: "example.com-redirect",
    });

    expect(route.handle[0].status_code).toBe(307); // Uses 307 instead of 302
    expect(route.handle[0].headers?.Location).toEqual([
      "https://www.example.com{http.request.uri}",
    ]);
  });

  test("defaults to permanent redirect", () => {
    const route = buildRedirectRoute({
      fromHost: "www.example.com",
      toHost: "example.com",
    });

    expect(route.handle[0].status_code).toBe(308); // Uses 308 instead of 301
  });

  test("preserves query string and path with redirect", () => {
    const route = buildRedirectRoute({
      fromHost: "www.example.com",
      toHost: "example.com",
    });

    // Check that {http.request.uri} is included to preserve path and query
    expect(route.handle[0].headers?.Location?.[0]).toContain("{http.request.uri}");
  });
});

describe("buildCompressionHandler", () => {
  test("creates compression handler with gzip and zstd by default", () => {
    const handler = buildCompressionHandler();

    expect(handler.handler).toBe("encode");
    expect(handler.encodings).toHaveProperty("gzip");
    expect(handler.encodings).toHaveProperty("zstd");
    expect(handler.encodings).not.toHaveProperty("br");
  });

  test("allows disabling gzip", () => {
    const handler = buildCompressionHandler({ gzip: false });

    expect(handler.encodings).not.toHaveProperty("gzip");
    expect(handler.encodings).toHaveProperty("zstd");
  });

  test("allows disabling zstd", () => {
    const handler = buildCompressionHandler({ zstd: false });

    expect(handler.encodings).toHaveProperty("gzip");
    expect(handler.encodings).not.toHaveProperty("zstd");
  });

  test("allows enabling brotli", () => {
    const handler = buildCompressionHandler({ brotli: true });

    expect(handler.encodings).toHaveProperty("gzip");
    expect(handler.encodings).toHaveProperty("zstd");
    expect(handler.encodings).toHaveProperty("br");
  });

  test("supports custom combinations", () => {
    const handler = buildCompressionHandler({ gzip: true, zstd: false, brotli: true });

    expect(handler.encodings).toHaveProperty("gzip");
    expect(handler.encodings).not.toHaveProperty("zstd");
    expect(handler.encodings).toHaveProperty("br");
  });
});
