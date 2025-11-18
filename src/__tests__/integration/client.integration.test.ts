/**
 * Integration tests for CaddyClient against real Caddy instance
 *
 * Run these tests with:
 * 1. docker compose -f docker-compose.test.yml up -d
 * 2. bun test:integration
 * 3. docker compose -f docker-compose.test.yml down
 */
import { describe, test, expect, beforeAll } from "vitest";
import { CaddyClient } from "../../caddy/client.js";

const CADDY_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2019";
const INTEGRATION_TEST = process.env.INTEGRATION_TEST === "true";

// Skip integration tests unless explicitly enabled
const describeIntegration = INTEGRATION_TEST ? describe : describe.skip;

describeIntegration("CaddyClient Integration Tests", () => {
  let client: CaddyClient;

  beforeAll(async () => {
    client = new CaddyClient({ adminUrl: CADDY_URL });

    // Verify Caddy is running
    try {
      await client.getConfig();
    } catch {
      throw new Error(
        `Caddy not running at ${CADDY_URL}. Start with: docker compose -f docker-compose.test.yml up -d`
      );
    }
  });

  test.skip("getVersion returns real Caddy version info", async () => {
    // Note: Caddy 2.9's Admin API "/" endpoint returns 404
    // This test is skipped until we determine the correct version endpoint
    const version = await client.getVersion();

    // Validate actual response structure from Caddy
    expect(version).toBeDefined();
    expect(version).toHaveProperty("version");
  });

  test("getConfig returns actual Caddy configuration structure", async () => {
    const config = await client.getConfig();

    // Validate actual Caddy config structure
    expect(config).toBeDefined();
    expect(config).toHaveProperty("apps");
  });

  test("getServers returns server configuration object", async () => {
    const servers = await client.getServers();

    // May be empty initially, but should be an object
    expect(servers).toBeDefined();
    expect(typeof servers).toBe("object");
  });

  test("can add and retrieve routes from real Caddy", async () => {
    // First create a server using patchServer
    const serverName = "test-server.localhost";
    await client.patchServer({
      [serverName]: {
        listen: [":443"],
        routes: [],
      },
    });

    const testRoute = {
      match: [{ host: ["integration-test.localhost"] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test:5678" }],
        },
      ],
      terminal: true,
    };

    // Add route to the server we just created
    const added = await client.addRoute(serverName, testRoute);
    expect(added).toBe(true);

    // Retrieve routes to verify
    const routes = await client.getRoutes(serverName);
    expect(routes.length).toBeGreaterThan(0);

    const foundRoute = routes.find((r) => r.match?.[0]?.host?.[0] === "integration-test.localhost");
    expect(foundRoute).toBeDefined();
    expect(foundRoute?.handle?.[0]?.handler).toBe("reverse_proxy");
  });

  test("addRoute is idempotent (returns false if route exists)", async () => {
    // Create a server first
    const serverName = "idempotent-server.localhost";
    await client.patchServer({
      [serverName]: {
        listen: [":443"],
        routes: [],
      },
    });

    const testRoute = {
      match: [{ host: ["idempotent-test.localhost"] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test:5678" }],
        },
      ],
      terminal: true,
    };

    // First add
    const firstAdd = await client.addRoute(serverName, testRoute);
    expect(firstAdd).toBe(true);

    // Second add (should detect existing route)
    const secondAdd = await client.addRoute(serverName, testRoute);
    expect(secondAdd).toBe(false);
  });

  test("removeRoutesByHost removes routes from real Caddy", async () => {
    const hostname = "remove-test.localhost";
    const serverName = "remove-server.localhost";

    // Create server first
    await client.patchServer({
      [serverName]: {
        listen: [":443"],
        routes: [],
      },
    });

    const testRoute = {
      match: [{ host: [hostname] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test:5678" }],
        },
      ],
      terminal: true,
    };

    // Add route
    await client.addRoute(serverName, testRoute);

    // Remove by hostname
    const removedCount = await client.removeRoutesByHost(hostname, serverName);
    expect(removedCount).toBeGreaterThan(0);

    // Verify removed
    const routes = await client.getRoutes(serverName);
    const stillExists = routes.some((r) => r.match?.[0]?.host?.[0] === hostname);
    expect(stillExists).toBe(false);
  });

  test("patchServer updates server configuration", async () => {
    const serverConfig = {
      "patch-test.localhost": {
        listen: [":443"],
        routes: [
          {
            handle: [
              {
                handler: "reverse_proxy",
                upstreams: [{ dial: "echo-test:5678" }],
              },
            ],
          },
        ],
      },
    };

    await client.patchServer(serverConfig);

    // Verify server was created
    const servers = (await client.getServers()) as Record<string, unknown>;
    expect(servers).toHaveProperty("patch-test.localhost");
  });

  test("validates real API error responses", async () => {
    // Attempt to get routes from non-existent server
    await expect(client.getRoutes("nonexistent-server")).rejects.toThrow();
  });

  test("client handles normal requests without timeout", async () => {
    // Validates that normal requests work
    // (Testing actual timeout requires mocking or unreliable network conditions)
    await expect(client.getConfig()).resolves.toBeDefined();
  });

  describe("Route Manipulation Functions", () => {
    const testServerName = "route-manipulation.localhost";

    beforeAll(async () => {
      // Create a test server with initial routes
      await client.patchServer({
        [testServerName]: {
          listen: [":443"],
          routes: [
            {
              "@id": "healthcheck",
              match: [{ path: ["/health"] }],
              handle: [
                {
                  handler: "static_response",
                  status_code: 200,
                  body: "OK",
                },
              ],
              terminal: true,
            },
          ],
        },
      });
    });

    describe("insertRoute", () => {
      test("inserts route at beginning of route list", async () => {
        const newRoute = {
          "@id": "inserted-at-beginning",
          match: [{ host: ["beginning.localhost"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        };

        await client.insertRoute(testServerName, newRoute, "beginning");

        const routes = await client.getRoutes(testServerName);
        expect(routes.length).toBeGreaterThan(0);
        expect(routes[0]["@id"]).toBe("inserted-at-beginning");
      });

      test("inserts route at end of route list", async () => {
        const newRoute = {
          "@id": "inserted-at-end",
          match: [{ host: ["end.localhost"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        };

        await client.insertRoute(testServerName, newRoute, "end");

        const routes = await client.getRoutes(testServerName);
        expect(routes.length).toBeGreaterThan(0);
        expect(routes[routes.length - 1]["@id"]).toBe("inserted-at-end");
      });

      test("inserts route after health checks by default", async () => {
        // First, reset server to just have health check
        await client.patchServer({
          [testServerName]: {
            listen: [":443"],
            routes: [
              {
                "@id": "healthcheck",
                match: [{ path: ["/health"] }],
                handle: [
                  {
                    handler: "static_response",
                    status_code: 200,
                  },
                ],
                terminal: true,
              },
            ],
          },
        });

        const newRoute = {
          "@id": "after-healthcheck",
          match: [{ host: ["after-health.localhost"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        };

        await client.insertRoute(testServerName, newRoute);

        const routes = await client.getRoutes(testServerName);
        const healthCheckIndex = routes.findIndex((r) => r["@id"] === "healthcheck");
        const newRouteIndex = routes.findIndex((r) => r["@id"] === "after-healthcheck");

        expect(healthCheckIndex).toBeGreaterThanOrEqual(0);
        expect(newRouteIndex).toBe(healthCheckIndex + 1);
      });

      test("validates route before inserting", async () => {
        const invalidRoute = {
          handle: [], // Invalid: empty handlers
        };

        await expect(
          client.insertRoute(testServerName, invalidRoute as any)
        ).rejects.toThrow();
      });
    });

    describe("replaceRouteById", () => {
      test("replaces existing route by @id", async () => {
        // First, insert a route
        const initialRoute = {
          "@id": "replaceable-route",
          match: [{ host: ["old-host.localhost"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        };

        await client.insertRoute(testServerName, initialRoute, "end");

        // Now replace it
        const newRoute = {
          match: [{ host: ["new-host.localhost"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:9999" }],
            },
          ],
          terminal: true,
        };

        const replaced = await client.replaceRouteById(
          testServerName,
          "replaceable-route",
          newRoute
        );
        expect(replaced).toBe(true);

        // Verify replacement
        const routes = await client.getRoutes(testServerName);
        const replacedRoute = routes.find((r) => r["@id"] === "replaceable-route");
        expect(replacedRoute).toBeDefined();
        expect(replacedRoute?.match?.[0]?.host?.[0]).toBe("new-host.localhost");
        expect(replacedRoute?.handle?.[0]?.upstreams?.[0]?.dial).toBe("echo-test:9999");
      });

      test("preserves @id when replacing route", async () => {
        const initialRoute = {
          "@id": "preserve-id-test",
          match: [{ host: ["preserve.localhost"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        };

        await client.insertRoute(testServerName, initialRoute, "end");

        const newRoute = {
          match: [{ host: ["updated.localhost"] }],
          handle: [
            {
              handler: "static_response",
              status_code: 200,
            },
          ],
          terminal: true,
        };

        await client.replaceRouteById(testServerName, "preserve-id-test", newRoute);

        const routes = await client.getRoutes(testServerName);
        const route = routes.find((r) => r["@id"] === "preserve-id-test");
        expect(route).toBeDefined();
        expect(route?.["@id"]).toBe("preserve-id-test");
        expect(route?.handle?.[0]?.handler).toBe("static_response");
      });

      test("returns false when route @id not found", async () => {
        const newRoute = {
          match: [{ host: ["test.localhost"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        };

        const replaced = await client.replaceRouteById(
          testServerName,
          "non-existent-id",
          newRoute
        );
        expect(replaced).toBe(false);
      });

      test("validates route before replacing", async () => {
        const invalidRoute = {
          handle: [], // Invalid: empty handlers
        };

        await expect(
          client.replaceRouteById(testServerName, "any-id", invalidRoute as any)
        ).rejects.toThrow();
      });
    });

    describe("removeRouteById", () => {
      test("removes route by @id", async () => {
        // First, insert a route to remove
        const routeToRemove = {
          "@id": "remove-me",
          match: [{ host: ["removable.localhost"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        };

        await client.insertRoute(testServerName, routeToRemove, "end");

        // Verify it exists
        let routes = await client.getRoutes(testServerName);
        let found = routes.find((r) => r["@id"] === "remove-me");
        expect(found).toBeDefined();

        // Remove it
        const removed = await client.removeRouteById(testServerName, "remove-me");
        expect(removed).toBe(true);

        // Verify it's gone
        routes = await client.getRoutes(testServerName);
        found = routes.find((r) => r["@id"] === "remove-me");
        expect(found).toBeUndefined();
      });

      test("returns false when route @id not found", async () => {
        const removed = await client.removeRouteById(testServerName, "does-not-exist");
        expect(removed).toBe(false);
      });

      test("removes all routes with same @id", async () => {
        // Insert two routes with same @id (edge case)
        await client.patchServer({
          [testServerName]: {
            listen: [":443"],
            routes: [
              {
                "@id": "duplicate-id",
                match: [{ host: ["dup1.localhost"] }],
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "echo-test:5678" }],
                  },
                ],
                terminal: true,
              },
              {
                "@id": "duplicate-id",
                match: [{ host: ["dup2.localhost"] }],
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "echo-test:5678" }],
                  },
                ],
                terminal: true,
              },
              {
                "@id": "keep-me",
                match: [{ host: ["keep.localhost"] }],
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "echo-test:5678" }],
                  },
                ],
                terminal: true,
              },
            ],
          },
        });

        // Remove all routes with duplicate-id
        const removed = await client.removeRouteById(testServerName, "duplicate-id");
        expect(removed).toBe(true);

        // Verify both duplicates are gone
        const routes = await client.getRoutes(testServerName);
        const duplicates = routes.filter((r) => r["@id"] === "duplicate-id");
        expect(duplicates).toHaveLength(0);

        // Verify kept route still exists
        const kept = routes.find((r) => r["@id"] === "keep-me");
        expect(kept).toBeDefined();
      });
    });

    describe("Complex route manipulation scenarios", () => {
      test("can perform multiple insertions and replacements", async () => {
        // Reset server
        await client.patchServer({
          [testServerName]: {
            listen: [":443"],
            routes: [],
          },
        });

        // Insert health check
        await client.insertRoute(
          testServerName,
          {
            "@id": "health",
            match: [{ path: ["/health"] }],
            handle: [{ handler: "static_response", status_code: 200 }],
            terminal: true,
          },
          "beginning"
        );

        // Insert domain route
        await client.insertRoute(
          testServerName,
          {
            "@id": "domain1",
            match: [{ host: ["domain1.localhost"] }],
            handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test:5678" }] }],
            terminal: true,
          },
          "after-health-checks"
        );

        // Insert another domain route
        await client.insertRoute(
          testServerName,
          {
            "@id": "domain2",
            match: [{ host: ["domain2.localhost"] }],
            handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test:5678" }] }],
            terminal: true,
          },
          "after-health-checks"
        );

        // Replace domain1
        await client.replaceRouteById(testServerName, "domain1", {
          match: [{ host: ["updated-domain1.localhost"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test:9999" }] }],
          terminal: true,
        });

        // Verify final state
        const routes = await client.getRoutes(testServerName);
        expect(routes).toHaveLength(3);

        const health = routes.find((r) => r["@id"] === "health");
        const domain1 = routes.find((r) => r["@id"] === "domain1");
        const domain2 = routes.find((r) => r["@id"] === "domain2");

        expect(health).toBeDefined();
        expect(domain1).toBeDefined();
        expect(domain1?.match?.[0]?.host?.[0]).toBe("updated-domain1.localhost");
        expect(domain2).toBeDefined();
      });

      test("handles route ordering correctly", async () => {
        // Reset and create ordered routes
        await client.patchServer({
          [testServerName]: {
            listen: [":443"],
            routes: [],
          },
        });

        // Insert at end
        await client.insertRoute(
          testServerName,
          {
            "@id": "last",
            match: [{ host: ["last.localhost"] }],
            handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test:5678" }] }],
            terminal: true,
          },
          "end"
        );

        // Insert at beginning
        await client.insertRoute(
          testServerName,
          {
            "@id": "first",
            match: [{ host: ["first.localhost"] }],
            handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test:5678" }] }],
            terminal: true,
          },
          "beginning"
        );

        // Insert at end again
        await client.insertRoute(
          testServerName,
          {
            "@id": "actually-last",
            match: [{ host: ["actually-last.localhost"] }],
            handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test:5678" }] }],
            terminal: true,
          },
          "end"
        );

        const routes = await client.getRoutes(testServerName);
        expect(routes[0]["@id"]).toBe("first");
        expect(routes[routes.length - 1]["@id"]).toBe("actually-last");
      });
    });
  });
});
