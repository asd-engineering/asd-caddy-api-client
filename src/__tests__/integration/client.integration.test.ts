/**
 * Integration tests for CaddyClient against real Caddy instance
 *
 * Run these tests with:
 * 1. docker compose -f docker-compose.test.yml up -d
 * 2. bun test:integration
 * 3. docker compose -f docker-compose.test.yml down
 */
import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import { CaddyClient } from "../../caddy/client.js";
import * as http from "http";
import { DELAY_SHORT, DELAY_MEDIUM, DELAY_LONG, DELAY_SERVER_START } from "./constants.js";

const CADDY_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2019";
const INTEGRATION_TEST = process.env.INTEGRATION_TEST === "true";

/**
 * Helper function to make HTTP requests with custom Host header
 * Node's fetch() doesn't allow overriding the Host header, so we use http.request
 */
function httpRequest(options: {
  host: string;
  port: number;
  path: string;
  headers?: Record<string, string>;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: options.host,
        port: options.port,
        path: options.path,
        method: "GET",
        headers: options.headers ?? {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// Skip integration tests unless explicitly enabled
const describeIntegration = INTEGRATION_TEST ? describe : describe.skip;

// Helper to add delay between operations
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeIntegration("CaddyClient Integration Tests", () => {
  let client: CaddyClient;

  // List of all servers created during tests for cleanup
  const testServers = [
    "test-server.localhost",
    "idempotent-server.localhost",
    "remove-server.localhost",
    "patch-test.localhost",
    "route-manipulation.localhost",
    "functional-test.localhost",
    "position-test.localhost",
  ];

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

  afterAll(async () => {
    // Clean up all test servers
    try {
      const servers = (await client.getServers()) as Record<string, unknown>;
      let modified = false;

      for (const serverName of testServers) {
        if (servers[serverName]) {
          delete servers[serverName];
          modified = true;
        }
      }

      if (modified) {
        await client.patchServer(servers);
        await delay(DELAY_MEDIUM);
      }
    } catch {
      // Ignore cleanup errors
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
    const serverName = "patch-test.localhost";
    const serverConfig = {
      [serverName]: {
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

    // Verify server was created by trying to get its config
    const config = await client.getServerConfig(serverName);
    expect(config).toBeDefined();
    expect(config).toHaveProperty("listen");
    expect(config).toHaveProperty("routes");
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

    beforeEach(async () => {
      // Reset server to clean state before each test
      try {
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
        await delay(DELAY_SHORT);
      } catch {
        // Ignore errors
      }
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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

        const replaced = await client.replaceRouteById(testServerName, "non-existent-id", newRoute);
        expect(replaced).toBe(false);
      });

      test("validates route before replacing", async () => {
        const invalidRoute = {
          handle: [], // Invalid: empty handlers
        };

        await expect(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
        await delay(DELAY_LONG); // Increased delay to ensure server is ready

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
        await delay(DELAY_SHORT);

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
        await delay(DELAY_SHORT);

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
        await delay(DELAY_SHORT);

        // Replace domain1
        await client.replaceRouteById(testServerName, "domain1", {
          match: [{ host: ["updated-domain1.localhost"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test:9999" }] }],
          terminal: true,
        });
        await delay(DELAY_SHORT);

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

    describe("Functional route ordering tests (HTTP requests)", () => {
      const functionalTestServer = "functional-test.localhost";

      beforeEach(async () => {
        // Clean up: Delete the server completely before each test
        try {
          // Server names with dots need to have dots percent-encoded to prevent path traversal issues
          const escapedServer = functionalTestServer.replace(/\./g, "%2E");
          await client.request(`/config/apps/http/servers/${escapedServer}`, {
            method: "DELETE",
          });
          await delay(DELAY_MEDIUM); // Wait for server deletion to take effect
        } catch {
          // Server might not exist, ignore
        }
      });

      test("verifies route order affects which backend handles requests (FUNCTIONAL)", async () => {
        // Create a server on port 80 (HTTP) for actual testing
        // IMPORTANT: Explicitly disable auto-HTTPS to prevent TLS cert acquisition
        await client.patchServer({
          [functionalTestServer]: {
            listen: [":80"],
            routes: [],
            automatic_https: {
              disable: true,
            },
          },
        });
        await delay(DELAY_LONG); // Increased delay for server to be ready

        // Scenario: Test that route order determines which backend handles the request
        // We'll create overlapping routes and verify the FIRST matching route wins

        // Route 1: Specific host "backend1.localhost" -> echo-test (backend 1)
        await client.insertRoute(
          functionalTestServer,
          {
            "@id": "backend1-route",
            match: [{ host: ["backend1.localhost"] }],
            handle: [
              {
                handler: "reverse_proxy",
                upstreams: [{ dial: "echo-test:5678" }],
              },
            ],
            terminal: true,
          },
          "beginning"
        );
        await delay(DELAY_SHORT);

        // Route 2: Specific host "backend2.localhost" -> echo-test-2 (backend 2)
        await client.insertRoute(
          functionalTestServer,
          {
            "@id": "backend2-route",
            match: [{ host: ["backend2.localhost"] }],
            handle: [
              {
                handler: "reverse_proxy",
                upstreams: [{ dial: "echo-test-2:5679" }],
              },
            ],
            terminal: true,
          },
          "end"
        );
        await delay(DELAY_SHORT);

        // Route 3: Catch-all route for all other hosts -> echo-test-3 (backend 3)
        // Note: In Caddy, omitting the match field (or having empty match) creates a catch-all
        await client.insertRoute(
          functionalTestServer,
          {
            "@id": "wildcard-route",
            // No match field = matches all requests
            handle: [
              {
                handler: "reverse_proxy",
                upstreams: [{ dial: "echo-test-3:5680" }],
              },
            ],
            terminal: true,
          },
          "end"
        );
        await delay(DELAY_SERVER_START); // Extra time for Caddy to start HTTP server

        // Verify route order in config
        const routes = await client.getRoutes(functionalTestServer);
        expect(routes[0]["@id"]).toBe("backend1-route");
        expect(routes[1]["@id"]).toBe("backend2-route");
        expect(routes[2]["@id"]).toBe("wildcard-route");

        // NOW TEST THE ACTUAL ROUTING BEHAVIOR WITH HTTP REQUESTS
        // Make HTTP requests and verify which backend responds

        // Request 1: backend1.localhost should hit backend 1
        const body1 = await httpRequest({
          host: "localhost",
          port: 8080,
          path: "/",
          headers: { Host: "backend1.localhost" },
        });
        expect(body1).toContain("Hello from backend 1");

        // Request 2: backend2.localhost should hit backend 2
        const body2 = await httpRequest({
          host: "localhost",
          port: 8080,
          path: "/",
          headers: { Host: "backend2.localhost" },
        });
        expect(body2).toContain("Hello from backend 2");

        // Request 3: any other host should hit backend 3 (wildcard)
        const body3 = await httpRequest({
          host: "localhost",
          port: 8080,
          path: "/",
          headers: { Host: "other.localhost" },
        });
        expect(body3).toContain("Hello from backend 3");
      });

      test("verifies route order precedence - first match wins (FUNCTIONAL)", async () => {
        // This test proves that route ORDER matters by creating overlapping routes
        // and showing different backends handle requests based on order

        // Setup: Create a server with two overlapping routes in different orders
        // IMPORTANT: Explicitly disable auto-HTTPS to prevent TLS cert acquisition
        await client.patchServer({
          [functionalTestServer]: {
            listen: [":80"],
            routes: [],
            automatic_https: {
              disable: true,
            },
          },
        });
        await delay(DELAY_LONG); // Increased delay for server to be ready

        // Scenario 1: Specific route BEFORE wildcard
        // Route 1: /api/* -> backend 2
        await client.insertRoute(
          functionalTestServer,
          {
            "@id": "specific-route",
            match: [{ path: ["/api/*"] }],
            handle: [
              {
                handler: "reverse_proxy",
                upstreams: [{ dial: "echo-test-2:5679" }],
              },
            ],
            terminal: true,
          },
          "beginning"
        );
        await delay(DELAY_SHORT);

        // Route 2: /* (wildcard) -> backend 3
        await client.insertRoute(
          functionalTestServer,
          {
            "@id": "wildcard",
            match: [{ path: ["/*"] }],
            handle: [
              {
                handler: "reverse_proxy",
                upstreams: [{ dial: "echo-test-3:5680" }],
              },
            ],
            terminal: true,
          },
          "end"
        );
        await delay(DELAY_SERVER_START);

        // Test: /api/test should hit backend 2 (specific route matches first)
        const body1 = await httpRequest({
          host: "localhost",
          port: 8080,
          path: "/api/test",
        });
        expect(body1).toContain("Hello from backend 2");

        // Test: /other should hit backend 3 (wildcard route)
        const body2 = await httpRequest({
          host: "localhost",
          port: 8080,
          path: "/other",
        });
        expect(body2).toContain("Hello from backend 3");

        // NOW SWAP THE ORDER using replaceRouteById and verify behavior changes
        // Put wildcard FIRST by replacing routes with swapped order
        await client.patchServer({
          [functionalTestServer]: {
            listen: [":80"],
            automatic_https: {
              disable: true,
            },
            routes: [
              {
                "@id": "wildcard",
                match: [{ path: ["/*"] }],
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "echo-test-3:5680" }],
                  },
                ],
                terminal: true,
              },
              {
                "@id": "specific-route",
                match: [{ path: ["/api/*"] }],
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "echo-test-2:5679" }],
                  },
                ],
                terminal: true,
              },
            ],
          },
        });
        await delay(DELAY_SERVER_START);

        // Test: /api/test should NOW hit backend 3 (wildcard matches first!)
        const body3 = await httpRequest({
          host: "localhost",
          port: 8080,
          path: "/api/test",
        });
        expect(body3).toContain("Hello from backend 3");

        // Test: /other should still hit backend 3 (wildcard)
        const body4 = await httpRequest({
          host: "localhost",
          port: 8080,
          path: "/other",
        });
        expect(body4).toContain("Hello from backend 3");

        // This proves route order ACTUALLY matters for routing behavior!
      });
    });

    describe("Route ordering and positioning tests", () => {
      const positionTestServer = "position-test.localhost";

      beforeEach(async () => {
        // Reset position test server before each test
        try {
          await client.patchServer({
            [positionTestServer]: {
              listen: [":8443"],
              routes: [],
            },
          });
          await delay(DELAY_SHORT);
        } catch {
          // Ignore errors
        }
      });

      test("verifies beginning position truly inserts at start", async () => {
        // Reset server
        await client.patchServer({
          [positionTestServer]: {
            listen: [":8443"],
            routes: [
              {
                "@id": "existing-route",
                match: [{ path: ["/existing"] }],
                handle: [{ handler: "static_response", status_code: 200 }],
                terminal: true,
              },
            ],
          },
        });
        await delay(DELAY_LONG); // Wait for server to be ready

        // Insert at beginning
        await client.insertRoute(
          positionTestServer,
          {
            "@id": "new-first-route",
            match: [{ path: ["/new-first"] }],
            handle: [{ handler: "static_response", status_code: 200 }],
            terminal: true,
          },
          "beginning"
        );

        const routes = await client.getRoutes(positionTestServer);
        expect(routes[0]["@id"]).toBe("new-first-route");
        expect(routes[1]["@id"]).toBe("existing-route");
      });

      test("verifies after-health-checks inserts after static_response handlers", async () => {
        // Reset server with health check and existing domain route
        await client.patchServer({
          [positionTestServer]: {
            listen: [":8443"],
            routes: [
              {
                "@id": "health",
                match: [{ path: ["/health"] }],
                handle: [
                  {
                    handler: "static_response",
                    status_code: 200,
                  },
                ],
                terminal: true,
              },
              {
                "@id": "existing-domain",
                match: [{ host: ["existing.com"] }],
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
        await delay(DELAY_LONG); // Wait for server to be ready

        // Insert with after-health-checks (default)
        await client.insertRoute(positionTestServer, {
          "@id": "new-domain",
          match: [{ host: ["new.com"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test-2:5679" }],
            },
          ],
          terminal: true,
        });

        const routes = await client.getRoutes(positionTestServer);
        // Should be: health, new-domain, existing-domain
        expect(routes[0]["@id"]).toBe("health");
        expect(routes[1]["@id"]).toBe("new-domain");
        expect(routes[2]["@id"]).toBe("existing-domain");
      });

      test("verifies multiple after-health-checks insertions insert immediately after health checks", async () => {
        // Reset server
        await client.patchServer({
          [positionTestServer]: {
            listen: [":8443"],
            routes: [
              {
                "@id": "health",
                match: [{ path: ["/health"] }],
                handle: [{ handler: "static_response", status_code: 200 }],
                terminal: true,
              },
            ],
          },
        });
        await delay(DELAY_LONG); // Wait for server to be ready

        // Insert three routes in sequence using after-health-checks
        // Each insertion should insert immediately after health check
        await client.insertRoute(positionTestServer, {
          "@id": "domain-1",
          match: [{ host: ["domain1.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test:5678" }] }],
          terminal: true,
        });
        // Routes: [health, domain-1]

        await client.insertRoute(positionTestServer, {
          "@id": "domain-2",
          match: [{ host: ["domain2.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test-2:5679" }] }],
          terminal: true,
        });
        // Routes: [health, domain-2, domain-1]

        await client.insertRoute(positionTestServer, {
          "@id": "domain-3",
          match: [{ host: ["domain3.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test-3:5680" }] }],
          terminal: true,
        });
        // Routes: [health, domain-3, domain-2, domain-1]

        const routes = await client.getRoutes(positionTestServer);
        // after-health-checks inserts immediately after last health check (reverse order)
        expect(routes[0]["@id"]).toBe("health");
        expect(routes[1]["@id"]).toBe("domain-3");
        expect(routes[2]["@id"]).toBe("domain-2");
        expect(routes[3]["@id"]).toBe("domain-1");
      });

      test("verifies end position places route at actual end", async () => {
        // Reset with multiple routes
        await client.patchServer({
          [positionTestServer]: {
            listen: [":8443"],
            routes: [
              {
                "@id": "route-1",
                match: [{ host: ["r1.com"] }],
                handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test:5678" }] }],
                terminal: true,
              },
              {
                "@id": "route-2",
                match: [{ host: ["r2.com"] }],
                handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test-2:5679" }] }],
                terminal: true,
              },
            ],
          },
        });
        await delay(DELAY_LONG); // Wait for server to be ready

        // Insert at end
        await client.insertRoute(
          positionTestServer,
          {
            "@id": "last-route",
            match: [{ host: ["last.com"] }],
            handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "echo-test-3:5680" }] }],
            terminal: true,
          },
          "end"
        );

        const routes = await client.getRoutes(positionTestServer);
        expect(routes[routes.length - 1]["@id"]).toBe("last-route");
      });
    });
  });
});
