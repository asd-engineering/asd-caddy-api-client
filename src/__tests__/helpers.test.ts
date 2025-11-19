/**
 * Unit tests for high-level helper functions
 */

import { describe, test, expect } from "vitest";
import {
  createHealthRoute,
  createServiceRoute,
  createBasicAuthRoute,
  createLoadBalancerRoute,
  createRewriteRoute,
  createRedirectRoute,
} from "../caddy/helpers";
import { ROUTE_PRIORITIES } from "../caddy/ordering";

describe("High-Level Helper Functions", () => {
  describe("createHealthRoute", () => {
    test("creates health route with standard format", () => {
      const route = createHealthRoute({
        instanceId: "prod-cluster-1",
      });

      expect(route["@id"]).toBe("global-health");
      expect(route.priority).toBe(ROUTE_PRIORITIES.HEALTH);
      expect(route.match).toEqual([{ path: ["/health"] }]);
      expect(route.terminal).toBe(true);
    });

    test("includes instance ID in headers", () => {
      const route = createHealthRoute({
        instanceId: "test-instance",
      });

      const headersHandler = route.handle?.find((h) => h.handler === "headers");
      expect(headersHandler).toBeDefined();
      expect(headersHandler?.response?.set?.["X-ASD-Instance"]).toEqual(["test-instance"]);
      expect(headersHandler?.response?.set?.["X-ASD-Health"]).toEqual(["ok"]);
    });

    test("includes service count and version in body when provided", () => {
      const route = createHealthRoute({
        instanceId: "prod",
        services: 10,
        version: "1.0.0",
      });

      const responseHandler = route.handle?.find((h) => h.handler === "static_response");
      expect(responseHandler).toBeDefined();

      if (!responseHandler?.body) {
        throw new Error("Response handler body is undefined");
      }
      const body = JSON.parse(responseHandler.body);
      expect(body.status).toBe("healthy");
      expect(body.services).toBe(10);
      expect(body.version).toBe("1.0.0");
    });

    test("supports custom health check path", () => {
      const route = createHealthRoute({
        instanceId: "prod",
        path: "/healthz",
      });

      expect(route.match).toEqual([{ path: ["/healthz"] }]);
    });
  });

  describe("createServiceRoute", () => {
    test("creates basic service route", () => {
      const route = createServiceRoute({
        id: "api-service",
        host: "api.localhost",
        upstream: "backend:8080",
      });

      expect(route["@id"]).toBe("api-service");
      expect(route.match).toEqual([{ host: ["api.localhost"], path: ["/*"] }]);
      expect(route.terminal).toBe(true);
    });

    test("includes security headers by default", () => {
      const route = createServiceRoute({
        id: "test",
        host: "test.localhost",
        upstream: "backend:8080",
      });

      const headersHandler = route.handle?.find((h) => h.handler === "headers");
      expect(headersHandler).toBeDefined();
      expect(headersHandler?.response?.set?.["X-Content-Type-Options"]).toEqual(["nosniff"]);
      expect(headersHandler?.response?.set?.["X-Frame-Options"]).toEqual(["DENY"]);
    });

    test("includes service ID and type headers when provided", () => {
      const route = createServiceRoute({
        id: "api",
        host: "api.localhost",
        upstream: "backend:8080",
        serviceId: "api-backend-v1",
        serviceType: "api",
      });

      const headersHandler = route.handle?.find((h) => h.handler === "headers");
      expect(headersHandler?.response?.set?.["X-ASD-Service-ID"]).toEqual(["api-backend-v1"]);
      expect(headersHandler?.response?.set?.["X-ASD-Service-Type"]).toEqual(["api"]);
    });

    test("includes compression handler by default", () => {
      const route = createServiceRoute({
        id: "test",
        host: "test.localhost",
        upstream: "backend:8080",
      });

      const encodeHandler = route.handle?.find((h) => h.handler === "encode");
      expect(encodeHandler).toBeDefined();
      expect(encodeHandler?.encodings).toHaveProperty("gzip");
      expect(encodeHandler?.encodings).toHaveProperty("zstd");
    });

    test("can disable compression", () => {
      const route = createServiceRoute({
        id: "test",
        host: "test.localhost",
        upstream: "backend:8080",
        enableCompression: false,
      });

      const encodeHandler = route.handle?.find((h) => h.handler === "encode");
      expect(encodeHandler).toBeUndefined();
    });

    test("supports custom path patterns", () => {
      const route = createServiceRoute({
        id: "api",
        host: "api.localhost",
        path: "/api/v1/*",
        upstream: "backend:8080",
      });

      expect(route.match).toEqual([{ host: ["api.localhost"], path: ["/api/v1/*"] }]);
    });

    test("normalizes string upstream to array format", () => {
      const route = createServiceRoute({
        id: "test",
        host: "test.localhost",
        upstream: "backend:8080",
      });

      const proxyHandler = route.handle?.find((h) => h.handler === "reverse_proxy");
      expect(proxyHandler?.upstreams).toEqual([{ dial: "backend:8080" }]);
    });

    test("accepts array upstream format", () => {
      const route = createServiceRoute({
        id: "test",
        host: "test.localhost",
        upstream: [{ dial: "backend-1:8080" }, { dial: "backend-2:8080" }],
      });

      const proxyHandler = route.handle?.find((h) => h.handler === "reverse_proxy");
      expect(proxyHandler?.upstreams).toHaveLength(2);
    });

    test("assigns wildcard priority for /* path", () => {
      const route = createServiceRoute({
        id: "test",
        host: "test.localhost",
        path: "/*",
        upstream: "backend:8080",
      });

      expect(route.priority).toBe(ROUTE_PRIORITIES.WILDCARD);
    });

    test("assigns specific path priority for non-wildcard paths", () => {
      const route = createServiceRoute({
        id: "test",
        host: "test.localhost",
        path: "/api/*",
        upstream: "backend:8080",
      });

      expect(route.priority).toBe(ROUTE_PRIORITIES.SPECIFIC_PATH);
    });

    test("respects explicit priority", () => {
      const route = createServiceRoute({
        id: "test",
        host: "test.localhost",
        upstream: "backend:8080",
        priority: 42,
      });

      expect(route.priority).toBe(42);
    });
  });

  describe("createBasicAuthRoute", () => {
    const testAccounts = [
      { username: "admin", password: "$2a$14$hash1" },
      { username: "user", password: "$2a$14$hash2" },
    ];

    test("creates domain-level auth route", () => {
      const route = createBasicAuthRoute({
        host: "admin.localhost",
        accounts: testAccounts,
        upstream: "backend:8080",
      });

      expect(route.match).toEqual([{ host: ["admin.localhost"] }]);
      expect(route.priority).toBe(ROUTE_PRIORITIES.AUTH_DOMAIN);
    });

    test("creates path-level auth route", () => {
      const route = createBasicAuthRoute({
        host: "api.localhost",
        path: "/admin/*",
        accounts: testAccounts,
        upstream: "backend:8080",
      });

      expect(route.match).toEqual([{ host: ["api.localhost"], path: ["/admin/*"] }]);
      expect(route.priority).toBe(ROUTE_PRIORITIES.AUTH_PATH);
    });

    test("includes authentication handler with accounts", () => {
      const route = createBasicAuthRoute({
        host: "admin.localhost",
        accounts: testAccounts,
        upstream: "backend:8080",
        realm: "Admin Area",
      });

      const authHandler = route.handle?.find((h) => h.handler === "authentication");
      expect(authHandler).toBeDefined();
      expect(authHandler?.providers?.http_basic?.accounts).toEqual(testAccounts);
      expect(authHandler?.providers?.http_basic?.realm).toBe("Admin Area");
    });

    test("uses default realm when not provided", () => {
      const route = createBasicAuthRoute({
        host: "admin.localhost",
        accounts: testAccounts,
        upstream: "backend:8080",
      });

      const authHandler = route.handle?.find((h) => h.handler === "authentication");
      expect(authHandler?.providers?.http_basic?.realm).toBe("Protected Area");
    });

    test("includes auth type header", () => {
      const domainRoute = createBasicAuthRoute({
        host: "admin.localhost",
        accounts: testAccounts,
        upstream: "backend:8080",
      });

      const pathRoute = createBasicAuthRoute({
        host: "api.localhost",
        path: "/admin/*",
        accounts: testAccounts,
        upstream: "backend:8080",
      });

      const domainHeaders = domainRoute.handle?.find((h) => h.handler === "headers");
      const pathHeaders = pathRoute.handle?.find((h) => h.handler === "headers");

      expect(domainHeaders?.response?.set?.["X-ASD-Auth-Type"]).toEqual(["domain-level"]);
      expect(pathHeaders?.response?.set?.["X-ASD-Auth-Type"]).toEqual(["path-level"]);
    });

    test("generates default ID from host and path", () => {
      const domainRoute = createBasicAuthRoute({
        host: "admin.localhost",
        accounts: testAccounts,
        upstream: "backend:8080",
      });

      const pathRoute = createBasicAuthRoute({
        host: "api.localhost",
        path: "/admin/*",
        accounts: testAccounts,
        upstream: "backend:8080",
      });

      expect(domainRoute["@id"]).toBe("auth-admin.localhost");
      expect(pathRoute["@id"]).toBe("auth-api.localhost-admin");
    });

    test("accepts custom ID", () => {
      const route = createBasicAuthRoute({
        id: "custom-auth-route",
        host: "admin.localhost",
        accounts: testAccounts,
        upstream: "backend:8080",
      });

      expect(route["@id"]).toBe("custom-auth-route");
    });
  });

  describe("createLoadBalancerRoute", () => {
    const upstreams = ["backend-1:8080", "backend-2:8080", "backend-3:8080"];

    test("creates load balancer route with multiple upstreams", () => {
      const route = createLoadBalancerRoute({
        id: "api-lb",
        host: "api.localhost",
        upstreams,
      });

      const proxyHandler = route.handle?.find((h) => h.handler === "reverse_proxy");
      expect(proxyHandler?.upstreams).toEqual([
        { dial: "backend-1:8080" },
        { dial: "backend-2:8080" },
        { dial: "backend-3:8080" },
      ]);
    });

    test("includes load balancing policy", () => {
      const route = createLoadBalancerRoute({
        id: "api-lb",
        host: "api.localhost",
        upstreams,
        policy: "round_robin",
      });

      const proxyHandler = route.handle?.find((h) => h.handler === "reverse_proxy");
      expect(proxyHandler?.load_balancing?.selection_policy?.policy).toBe("round_robin");
    });

    test("supports different load balancing policies", () => {
      const policies = ["round_robin", "least_conn", "ip_hash", "first", "random"] as const;

      for (const policy of policies) {
        const route = createLoadBalancerRoute({
          id: `lb-${policy}`,
          host: "api.localhost",
          upstreams,
          policy,
        });

        const proxyHandler = route.handle?.find((h) => h.handler === "reverse_proxy");
        expect(proxyHandler?.load_balancing?.selection_policy?.policy).toBe(policy);
      }
    });

    test("includes health checks when enabled", () => {
      const route = createLoadBalancerRoute({
        id: "api-lb",
        host: "api.localhost",
        upstreams,
        healthCheck: {
          path: "/health",
          interval: "10s",
          timeout: "2s",
        },
      });

      const proxyHandler = route.handle?.find((h) => h.handler === "reverse_proxy");
      expect(proxyHandler?.health_checks?.active).toEqual({
        path: "/health",
        interval: "10s",
        timeout: "2s",
      });
    });

    test("uses default health check values", () => {
      const route = createLoadBalancerRoute({
        id: "api-lb",
        host: "api.localhost",
        upstreams,
        healthCheck: {},
      });

      const proxyHandler = route.handle?.find((h) => h.handler === "reverse_proxy");
      expect(proxyHandler?.health_checks?.active).toEqual({
        path: "/health",
        interval: "10s",
        timeout: "2s",
      });
    });

    test("omits health checks when not enabled", () => {
      const route = createLoadBalancerRoute({
        id: "api-lb",
        host: "api.localhost",
        upstreams,
      });

      const proxyHandler = route.handle?.find((h) => h.handler === "reverse_proxy");
      expect(proxyHandler?.health_checks).toBeUndefined();
    });
  });

  describe("createRewriteRoute", () => {
    test("creates route with path rewriting", () => {
      const route = createRewriteRoute({
        id: "api-rewrite",
        host: "app.localhost",
        pathPrefix: "/api/v1",
        upstream: "backend:3000",
      });

      expect(route.match).toEqual([
        {
          host: ["app.localhost"],
          path: ["/api/v1/*"],
        },
      ]);
    });

    test("includes rewrite handler", () => {
      const route = createRewriteRoute({
        id: "api-rewrite",
        host: "app.localhost",
        pathPrefix: "/backend-service",
        upstream: "backend:3000",
      });

      const rewriteHandler = route.handle?.find((h) => h.handler === "rewrite");
      expect(rewriteHandler).toBeDefined();
      expect(rewriteHandler?.strip_path_prefix).toBe("/backend-service");
    });

    test("includes path rewrite header", () => {
      const route = createRewriteRoute({
        id: "api-rewrite",
        host: "app.localhost",
        pathPrefix: "/api",
        upstream: "backend:3000",
      });

      const headersHandler = route.handle?.find((h) => h.handler === "headers");
      expect(headersHandler?.response?.set?.["X-ASD-Path-Rewrite"]).toEqual(["true"]);
    });

    test("assigns rewrite priority", () => {
      const route = createRewriteRoute({
        id: "api-rewrite",
        host: "app.localhost",
        pathPrefix: "/api",
        upstream: "backend:3000",
      });

      expect(route.priority).toBe(ROUTE_PRIORITIES.REWRITE);
    });
  });

  describe("createRedirectRoute", () => {
    test("creates redirect from www to domain", () => {
      const route = createRedirectRoute({
        from: "www.example.com",
        to: "example.com",
      });

      expect(route.match).toEqual([{ host: ["www.example.com"] }]);

      const responseHandler = route.handle?.find((h) => h.handler === "static_response");
      expect(responseHandler?.status_code).toBe(301); // Permanent by default
      expect(responseHandler?.headers?.Location).toEqual(["https://example.com{http.request.uri}"]);
    });

    test("creates redirect from domain to www", () => {
      const route = createRedirectRoute({
        from: "example.com",
        to: "www.example.com",
      });

      const responseHandler = route.handle?.find((h) => h.handler === "static_response");
      expect(responseHandler?.headers?.Location).toEqual([
        "https://www.example.com{http.request.uri}",
      ]);
    });

    test("uses 301 for permanent redirects by default", () => {
      const route = createRedirectRoute({
        from: "www.example.com",
        to: "example.com",
      });

      const responseHandler = route.handle?.find((h) => h.handler === "static_response");
      expect(responseHandler?.status_code).toBe(301);
    });

    test("uses 302 for temporary redirects", () => {
      const route = createRedirectRoute({
        from: "www.example.com",
        to: "example.com",
        permanent: false,
      });

      const responseHandler = route.handle?.find((h) => h.handler === "static_response");
      expect(responseHandler?.status_code).toBe(302);
    });

    test("generates default ID from hosts", () => {
      const route = createRedirectRoute({
        from: "www.example.com",
        to: "example.com",
      });

      expect(route["@id"]).toBe("redirect-www.example.com-to-example.com");
    });

    test("accepts custom ID", () => {
      const route = createRedirectRoute({
        id: "custom-redirect",
        from: "www.example.com",
        to: "example.com",
      });

      expect(route["@id"]).toBe("custom-redirect");
    });
  });
});
