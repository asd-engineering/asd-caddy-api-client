/**
 * [CONTRACT] Route Ordering
 *
 * This test suite defines the contract for route ordering guarantees.
 * These tests specify API-level behavior that must remain stable.
 *
 * Contract tests are different from scenario tests:
 * - Contract: API guarantees and invariants (stable, breaking these = breaking change)
 * - Scenario: Realistic deployment topologies (can evolve with product)
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../caddy/client";
import { createHealthRoute, createServiceRoute, createBasicAuthRoute } from "../../caddy/helpers";
import { sortRoutes, validateRouteOrdering, ROUTE_PRIORITIES } from "../../caddy/ordering";
import type { CaddyRoute } from "../../types";

describe("[CONTRACT] Route Ordering", () => {
  describe("API-level guarantees (unit)", () => {
    test("sortRoutes always places health routes first", () => {
      const routes = [
        createServiceRoute({
          id: "service",
          host: "example.localhost",
          upstream: "backend:8080",
        }),
        createHealthRoute({ instanceId: "test" }),
        createServiceRoute({
          id: "api",
          host: "example.localhost",
          path: "/api/*",
          upstream: "backend:8080",
        }),
      ];

      const sorted = sortRoutes(routes);

      expect(sorted[0]["@id"]).toBe("global-health");
    });

    test("sortRoutes places more specific paths before wildcards", () => {
      const routes = [
        createServiceRoute({
          id: "wildcard",
          host: "example.localhost",
          path: "/*",
          upstream: "backend:8080",
        }),
        createServiceRoute({
          id: "specific",
          host: "example.localhost",
          path: "/api/*",
          upstream: "backend:8080",
        }),
      ];

      const sorted = sortRoutes(routes);

      expect(sorted[0]["@id"]).toBe("specific");
      expect(sorted[1]["@id"]).toBe("wildcard");
    });

    test("sortRoutes respects explicit priority over path specificity", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "low-priority-specific",
          match: [{ path: ["/api/*"] }],
          priority: 100,
        },
        {
          "@id": "high-priority-wildcard",
          match: [{ path: ["/*"] }],
          priority: 10,
        },
      ];

      const sorted = sortRoutes(routes);

      expect(sorted[0]["@id"]).toBe("high-priority-wildcard");
      expect(sorted[1]["@id"]).toBe("low-priority-specific");
    });

    test("sortRoutes maintains order for routes with same priority", () => {
      const routes: CaddyRoute[] = [
        { "@id": "route-1", priority: 50 },
        { "@id": "route-2", priority: 50 },
        { "@id": "route-3", priority: 50 },
      ];

      const sorted = sortRoutes(routes);

      expect(sorted.map((r) => r["@id"])).toEqual(["route-1", "route-2", "route-3"]);
    });

    test("validateRouteOrdering rejects health route not first", () => {
      const routes = [
        createServiceRoute({
          id: "service",
          host: "example.localhost",
          upstream: "backend:8080",
        }),
        createHealthRoute({ instanceId: "test" }),
      ];

      expect(() => validateRouteOrdering(routes)).toThrow(/health.*must be first/i);
    });

    test("validateRouteOrdering rejects descending priorities", () => {
      const routes: CaddyRoute[] = [
        { "@id": "low", priority: 100 },
        { "@id": "high", priority: 10 },
      ];

      expect(() => validateRouteOrdering(routes)).toThrow(/ordering violation/i);
    });

    test("validateRouteOrdering accepts correctly ordered routes", () => {
      const routes = sortRoutes([
        createHealthRoute({ instanceId: "test" }),
        createServiceRoute({
          id: "api",
          host: "example.localhost",
          path: "/api/*",
          upstream: "backend:8080",
        }),
        createServiceRoute({
          id: "wildcard",
          host: "example.localhost",
          path: "/*",
          upstream: "backend:8080",
        }),
      ]);

      expect(() => validateRouteOrdering(routes)).not.toThrow();
    });
  });

  describe("Integration guarantees (requires Caddy)", () => {
    let client: CaddyClient;
    const SERVER = "test-routing-order-contract";
    const PORT = 8080;

    beforeAll(async () => {
      if (!process.env.INTEGRATION_TEST) {
        return;
      }

      client = new CaddyClient();

      // Ensure Caddy is accessible
      try {
        await client.getConfig();
      } catch {
        throw new Error(
          "Caddy not running. Start with: docker compose -f docker-compose.test.yml up -d"
        );
      }
    });

    afterAll(async () => {
      if (!process.env.INTEGRATION_TEST) {
        return;
      }

      // Cleanup: remove test server
      try {
        const servers = (await client.getServers()) as Record<string, unknown>;
        if (servers[SERVER]) {
          delete servers[SERVER];
          await client.patchServer(servers);
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "health endpoint is accessible before service routes are matched",
      async () => {
        // Setup routes: catch-all service on /*, health on /health
        // If ordering is wrong, /* would catch /health requests
        const routes = sortRoutes([
          createServiceRoute({
            id: "catch-all",
            host: "test.localhost",
            path: "/*",
            upstream: "echo-test:5678",
          }),
          createHealthRoute({ instanceId: "contract-test", services: 1 }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        // Make request to /health on test.localhost
        const http = await import("http");
        const healthResponse = await new Promise<{
          statusCode: number;
          headers: http.IncomingHttpHeaders;
          body: string;
        }>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "localhost",
              port: PORT,
              path: "/health",
              method: "GET",
              headers: { Host: "test.localhost" },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => (body += chunk));
              res.on("end", () =>
                resolve({
                  statusCode: res.statusCode ?? 0,
                  headers: res.headers,
                  body,
                })
              );
            }
          );
          req.on("error", reject);
          req.end();
        });

        // Health endpoint should be accessible despite /* catch-all
        expect(healthResponse.statusCode).toBe(200);
        expect(healthResponse.headers["x-asd-health"]).toBe("ok");
        expect(healthResponse.headers["x-asd-instance"]).toBe("contract-test");

        // Parse JSON body
        const healthBody = JSON.parse(healthResponse.body);
        expect(healthBody.status).toBe("healthy");
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "/api/* is matched before /* catch-all",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "contract-test" }),
          createServiceRoute({
            id: "api",
            host: "test.localhost",
            path: "/api/*",
            upstream: "echo-test-2:5679",
            serviceId: "api-backend",
          }),
          createServiceRoute({
            id: "default",
            host: "test.localhost",
            path: "/*",
            upstream: "echo-test:5678",
            serviceId: "default-backend",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        const http = await import("http");

        // Request to /api/users should hit api backend
        const apiResponse = await new Promise<{
          statusCode: number;
          headers: http.IncomingHttpHeaders;
          body: string;
        }>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "localhost",
              port: PORT,
              path: "/api/users",
              method: "GET",
              headers: { Host: "test.localhost" },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => (body += chunk));
              res.on("end", () =>
                resolve({
                  statusCode: res.statusCode ?? 0,
                  headers: res.headers,
                  body,
                })
              );
            }
          );
          req.on("error", reject);
          req.end();
        });

        expect(apiResponse.statusCode).toBe(200);
        expect(apiResponse.headers["x-asd-service-id"]).toBe("api-backend");
        expect(apiResponse.body).toContain("Hello from backend 2");

        // Request to /other should hit default backend
        const defaultResponse = await new Promise<{
          statusCode: number;
          headers: http.IncomingHttpHeaders;
          body: string;
        }>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "localhost",
              port: PORT,
              path: "/other",
              method: "GET",
              headers: { Host: "test.localhost" },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => (body += chunk));
              res.on("end", () =>
                resolve({
                  statusCode: res.statusCode ?? 0,
                  headers: res.headers,
                  body,
                })
              );
            }
          );
          req.on("error", reject);
          req.end();
        });

        expect(defaultResponse.statusCode).toBe(200);
        expect(defaultResponse.headers["x-asd-service-id"]).toBe("default-backend");
        expect(defaultResponse.body).toContain("Hello from backend 1");
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "path-level auth is matched before domain-level auth",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "contract-test" }),
          createBasicAuthRoute({
            id: "path-auth",
            host: "test.localhost",
            path: "/admin/*",
            accounts: [{ username: "admin", password: "$2a$14$hash" }],
            upstream: "echo-test-2:5679",
            serviceId: "admin-api",
          }),
          createBasicAuthRoute({
            id: "domain-auth",
            host: "test.localhost",
            accounts: [{ username: "user", password: "$2a$14$hash" }],
            upstream: "echo-test:5678",
            serviceId: "default",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        // Verify ordering in Caddy config
        const servers = (await client.getServers()) as Record<string, unknown>;
        const serverConfig = servers[SERVER] as { routes: CaddyRoute[] };
        const routeOrder = serverConfig.routes.map((r) => r["@id"]);

        // Path-auth should come before domain-auth
        const pathAuthIndex = routeOrder.indexOf("path-auth");
        const domainAuthIndex = routeOrder.indexOf("domain-auth");

        expect(pathAuthIndex).toBeGreaterThan(-1);
        expect(domainAuthIndex).toBeGreaterThan(-1);
        expect(pathAuthIndex).toBeLessThan(domainAuthIndex);

        // Also verify priorities
        expect(serverConfig.routes[pathAuthIndex].priority).toBe(ROUTE_PRIORITIES.AUTH_PATH);
        expect(serverConfig.routes[domainAuthIndex].priority).toBe(ROUTE_PRIORITIES.AUTH_DOMAIN);
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)("sorted routes pass validation", async () => {
      const unsortedRoutes = [
        createServiceRoute({
          id: "wildcard",
          host: "test.localhost",
          upstream: "echo-test:5678",
        }),
        createHealthRoute({ instanceId: "test" }),
        createServiceRoute({
          id: "api",
          host: "test.localhost",
          path: "/api/*",
          upstream: "echo-test-2:5679",
        }),
      ];

      const sorted = sortRoutes(unsortedRoutes);

      // Validation should pass
      expect(() => validateRouteOrdering(sorted)).not.toThrow();

      // Apply to Caddy and verify it works
      await client.patchServer({
        [SERVER]: {
          listen: [`:${PORT}`],
          routes: sorted,
        },
      });

      // Verify health is accessible
      const http = await import("http");
      const response = await new Promise<{ statusCode: number }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: "localhost",
            port: PORT,
            path: "/health",
            headers: { Host: "test.localhost" },
          },
          (res) => {
            res.on("data", () => {
              // Consume data
            });
            res.on("end", () => resolve({ statusCode: res.statusCode ?? 0 }));
          }
        );
        req.on("error", reject);
        req.end();
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("Priority constants contract", () => {
    test("priorities are in ascending order", () => {
      expect(ROUTE_PRIORITIES.HEALTH).toBeLessThan(ROUTE_PRIORITIES.AUTH_DOMAIN);
      expect(ROUTE_PRIORITIES.AUTH_DOMAIN).toBeLessThan(ROUTE_PRIORITIES.AUTH_PATH);
      expect(ROUTE_PRIORITIES.AUTH_PATH).toBeLessThan(ROUTE_PRIORITIES.SPECIFIC_PATH);
      expect(ROUTE_PRIORITIES.SPECIFIC_PATH).toBeLessThan(ROUTE_PRIORITIES.REWRITE);
      expect(ROUTE_PRIORITIES.REWRITE).toBeLessThan(ROUTE_PRIORITIES.SERVICE);
      expect(ROUTE_PRIORITIES.SERVICE).toBeLessThan(ROUTE_PRIORITIES.WILDCARD);
      expect(ROUTE_PRIORITIES.WILDCARD).toBeLessThan(ROUTE_PRIORITIES.FALLBACK);
    });

    test("HEALTH has priority 0 (always first)", () => {
      expect(ROUTE_PRIORITIES.HEALTH).toBe(0);
    });

    test("priorities have reasonable gaps for insertion", () => {
      // Gaps allow for future priority levels between existing ones
      expect(ROUTE_PRIORITIES.AUTH_DOMAIN - ROUTE_PRIORITIES.HEALTH).toBeGreaterThanOrEqual(10);
      expect(ROUTE_PRIORITIES.AUTH_PATH - ROUTE_PRIORITIES.AUTH_DOMAIN).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Helper function priority assignment contract", () => {
    test("createHealthRoute assigns HEALTH priority", () => {
      const route = createHealthRoute({ instanceId: "test" });
      expect(route.priority).toBe(ROUTE_PRIORITIES.HEALTH);
    });

    test("createServiceRoute with wildcard path assigns WILDCARD priority", () => {
      const route = createServiceRoute({
        id: "test",
        host: "example.localhost",
        path: "/*",
        upstream: "backend:8080",
      });
      expect(route.priority).toBe(ROUTE_PRIORITIES.WILDCARD);
    });

    test("createServiceRoute with specific path assigns SPECIFIC_PATH priority", () => {
      const route = createServiceRoute({
        id: "test",
        host: "example.localhost",
        path: "/api/*",
        upstream: "backend:8080",
      });
      expect(route.priority).toBe(ROUTE_PRIORITIES.SPECIFIC_PATH);
    });

    test("createBasicAuthRoute without path assigns AUTH_DOMAIN priority", () => {
      const route = createBasicAuthRoute({
        host: "admin.localhost",
        accounts: [{ username: "admin", password: "$2a$14$hash" }],
        upstream: "backend:8080",
      });
      expect(route.priority).toBe(ROUTE_PRIORITIES.AUTH_DOMAIN);
    });

    test("createBasicAuthRoute with path assigns AUTH_PATH priority", () => {
      const route = createBasicAuthRoute({
        host: "api.localhost",
        path: "/admin/*",
        accounts: [{ username: "admin", password: "$2a$14$hash" }],
        upstream: "backend:8080",
      });
      expect(route.priority).toBe(ROUTE_PRIORITIES.AUTH_PATH);
    });

    test("explicit priority overrides automatic assignment", () => {
      const route = createServiceRoute({
        id: "test",
        host: "example.localhost",
        upstream: "backend:8080",
        priority: 42,
      });
      expect(route.priority).toBe(42);
    });
  });
});
