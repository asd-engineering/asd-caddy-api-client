/**
 * [CONTRACT] Idempotency
 *
 * This test suite defines the contract for idempotent operations.
 * Applying the same configuration multiple times should produce identical state.
 *
 * Idempotency guarantees:
 * - Reapplying same configuration = no change
 * - Server state is deterministic
 * - No duplicate routes from repeated operations
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../caddy/client";
import { createHealthRoute, createServiceRoute } from "../../caddy/helpers";
import { sortRoutes } from "../../caddy/ordering";
import type { CaddyRoute } from "../../types";

describe("[CONTRACT] Idempotency", () => {
  let client: CaddyClient;
  const SERVER = "test-idempotency-contract";
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

  describe("Configuration idempotency", () => {
    test.skipIf(!process.env.INTEGRATION_TEST)(
      "applying same configuration twice produces identical state",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "idempotency-test", services: 2 }),
          createServiceRoute({
            id: "api",
            host: "api.localhost",
            path: "/api/*",
            upstream: "echo-test:5678",
            serviceId: "api-backend",
          }),
          createServiceRoute({
            id: "default",
            host: "api.localhost",
            upstream: "echo-test-2:5679",
            serviceId: "default-backend",
          }),
        ]);

        const config = {
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        };

        // First application
        await client.patchServer(config);
        const state1 = await client.getServers();

        // Second application (should be idempotent)
        await client.patchServer(config);
        const state2 = await client.getServers();

        // States should be identical
        expect(state1).toEqual(state2);
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "applying same routes array produces same route count",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "test" }),
          createServiceRoute({
            id: "service-1",
            host: "test.localhost",
            upstream: "backend:8080",
          }),
        ]);

        const config = { [SERVER]: { listen: [`:${PORT}`], routes } };

        // Apply configuration
        await client.patchServer(config);
        const servers1 = (await client.getServers()) as Record<string, unknown>;
        const server1 = servers1[SERVER] as { routes: CaddyRoute[] };
        const routeCount1 = server1.routes.length;

        // Reapply same configuration
        await client.patchServer(config);
        const servers2 = (await client.getServers()) as Record<string, unknown>;
        const server2 = servers2[SERVER] as { routes: CaddyRoute[] };
        const routeCount2 = server2.routes.length;

        // Route count should be identical
        expect(routeCount1).toBe(routeCount2);
        expect(routeCount1).toBe(2); // Health + service
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "route ordering is preserved across reapplications",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "test" }),
          createServiceRoute({
            id: "specific",
            host: "test.localhost",
            path: "/api/*",
            upstream: "backend:8080",
          }),
          createServiceRoute({
            id: "wildcard",
            host: "test.localhost",
            upstream: "backend:8080",
          }),
        ]);

        const config = { [SERVER]: { listen: [`:${PORT}`], routes } };

        // First application
        await client.patchServer(config);
        const servers1 = (await client.getServers()) as Record<string, unknown>;
        const server1 = servers1[SERVER] as { routes: CaddyRoute[] };
        const routeOrder1 = server1.routes.map((r) => r["@id"]);

        // Second application
        await client.patchServer(config);
        const servers2 = (await client.getServers()) as Record<string, unknown>;
        const server2 = servers2[SERVER] as { routes: CaddyRoute[] };
        const routeOrder2 = server2.routes.map((r) => r["@id"]);

        // Order should be preserved
        expect(routeOrder1).toEqual(routeOrder2);
        expect(routeOrder1).toEqual(["global-health", "specific", "wildcard"]);
      }
    );
  });

  describe("Route manipulation idempotency", () => {
    test.skipIf(!process.env.INTEGRATION_TEST)(
      "inserting same route twice with same @id does not duplicate",
      async () => {
        const route = createHealthRoute({ instanceId: "test" });
        route["@id"] = "unique-route";

        // Setup initial server
        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes: [],
          },
        });

        // First insert
        await client.insertRoute(SERVER, route, "end");
        const servers1 = (await client.getServers()) as Record<string, unknown>;
        const server1 = servers1[SERVER] as { routes: CaddyRoute[] };

        // Second insert (should not duplicate due to @id)
        await client.insertRoute(SERVER, route, "end");
        const servers2 = (await client.getServers()) as Record<string, unknown>;
        const server2 = servers2[SERVER] as { routes: CaddyRoute[] };

        // Route count should be same
        expect(server1.routes.length).toBe(server2.routes.length);

        // Should only have one instance of the route
        const routesWithId = server2.routes.filter((r) => r["@id"] === "unique-route");
        expect(routesWithId.length).toBe(1);
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "replacing route by ID multiple times produces same result",
      async () => {
        const initialRoute = createServiceRoute({
          id: "test-route",
          host: "test.localhost",
          upstream: "backend-1:8080",
          serviceId: "backend-1",
        });

        const replacementRoute = createServiceRoute({
          id: "test-route", // Same ID
          host: "test.localhost",
          upstream: "backend-2:8080",
          serviceId: "backend-2",
        });

        // Setup initial server with route
        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes: [initialRoute],
          },
        });

        // First replacement
        await client.replaceRouteById(SERVER, "test-route", replacementRoute);
        const servers1 = (await client.getServers()) as Record<string, unknown>;
        const server1 = servers1[SERVER] as { routes: CaddyRoute[] };

        // Second replacement (same operation)
        await client.replaceRouteById(SERVER, "test-route", replacementRoute);
        const servers2 = (await client.getServers()) as Record<string, unknown>;
        const server2 = servers2[SERVER] as { routes: CaddyRoute[] };

        // States should be identical
        expect(server1.routes).toEqual(server2.routes);

        // Should still have exactly one route
        expect(server2.routes.length).toBe(1);

        // Route should have updated upstream
        const route = server2.routes[0];
        const proxyHandler = route.handle?.find((h) => h.handler === "reverse_proxy");
        expect(proxyHandler?.upstreams).toEqual([{ dial: "backend-2:8080" }]);
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "removing non-existent route is idempotent",
      async () => {
        const route = createServiceRoute({
          id: "existing",
          host: "test.localhost",
          upstream: "backend:8080",
        });

        // Setup server with one route
        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes: [route],
          },
        });

        // Try to remove non-existent route
        const removed1 = await client.removeRouteById(SERVER, "non-existent");
        expect(removed1).toBe(false); // Should return false

        const servers1 = (await client.getServers()) as Record<string, unknown>;
        const server1 = servers1[SERVER] as { routes: CaddyRoute[] };

        // Try again
        const removed2 = await client.removeRouteById(SERVER, "non-existent");
        expect(removed2).toBe(false);

        const servers2 = (await client.getServers()) as Record<string, unknown>;
        const server2 = servers2[SERVER] as { routes: CaddyRoute[] };

        // State should be unchanged
        expect(server1.routes).toEqual(server2.routes);
        expect(server2.routes.length).toBe(1);
      }
    );
  });

  describe("Sort operation idempotency", () => {
    test("sortRoutes is idempotent", () => {
      const routes = [
        createServiceRoute({
          id: "wildcard",
          host: "test.localhost",
          upstream: "backend:8080",
        }),
        createHealthRoute({ instanceId: "test" }),
        createServiceRoute({
          id: "specific",
          host: "test.localhost",
          path: "/api/*",
          upstream: "backend:8080",
        }),
      ];

      const sorted1 = sortRoutes(routes);
      const sorted2 = sortRoutes(sorted1); // Sort already sorted
      const sorted3 = sortRoutes(sorted2); // Sort again

      // All should be identical
      expect(sorted1).toEqual(sorted2);
      expect(sorted2).toEqual(sorted3);

      // Order should be correct
      expect(sorted1.map((r) => r["@id"])).toEqual(["global-health", "specific", "wildcard"]);
    });

    test("sortRoutes on empty array is idempotent", () => {
      const empty: CaddyRoute[] = [];

      const sorted1 = sortRoutes(empty);
      const sorted2 = sortRoutes(sorted1);

      expect(sorted1).toEqual([]);
      expect(sorted2).toEqual([]);
    });

    test("sortRoutes on single route is idempotent", () => {
      const routes = [createHealthRoute({ instanceId: "test" })];

      const sorted1 = sortRoutes(routes);
      const sorted2 = sortRoutes(sorted1);
      const sorted3 = sortRoutes(sorted2);

      expect(sorted1).toEqual(sorted2);
      expect(sorted2).toEqual(sorted3);
      expect(sorted1.length).toBe(1);
    });
  });

  describe("Config retrieval idempotency", () => {
    test.skipIf(!process.env.INTEGRATION_TEST)(
      "getServers returns same data on repeated calls",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "test" }),
          createServiceRoute({
            id: "service",
            host: "test.localhost",
            upstream: "backend:8080",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        // Multiple reads
        const servers1 = await client.getServers();
        const servers2 = await client.getServers();
        const servers3 = await client.getServers();

        // All should be identical (read operations don't modify state)
        expect(servers1).toEqual(servers2);
        expect(servers2).toEqual(servers3);
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "getConfig returns same data on repeated calls",
      async () => {
        const routes = sortRoutes([createHealthRoute({ instanceId: "test" })]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        // Multiple config reads
        const config1 = await client.getConfig();
        const config2 = await client.getConfig();
        const config3 = await client.getConfig();

        // All should be identical
        expect(config1).toEqual(config2);
        expect(config2).toEqual(config3);
      }
    );
  });

  describe("Helper function idempotency", () => {
    test("createHealthRoute produces identical output for same input", () => {
      const options = { instanceId: "test", services: 5, version: "1.0.0" };

      const route1 = createHealthRoute(options);
      const route2 = createHealthRoute(options);
      const route3 = createHealthRoute(options);

      expect(route1).toEqual(route2);
      expect(route2).toEqual(route3);
    });

    test("createServiceRoute produces identical output for same input", () => {
      const options = {
        id: "api",
        host: "api.localhost",
        path: "/api/*",
        upstream: "backend:8080",
        serviceId: "api-v1",
        serviceType: "api",
      };

      const route1 = createServiceRoute(options);
      const route2 = createServiceRoute(options);

      expect(route1).toEqual(route2);
    });

    test("sortRoutes produces same output for same input", () => {
      const routes = [
        createHealthRoute({ instanceId: "test" }),
        createServiceRoute({
          id: "service",
          host: "test.localhost",
          upstream: "backend:8080",
        }),
      ];

      const sorted1 = sortRoutes(routes);
      const sorted2 = sortRoutes(routes);
      const sorted3 = sortRoutes(routes);

      expect(sorted1).toEqual(sorted2);
      expect(sorted2).toEqual(sorted3);
    });
  });
});
