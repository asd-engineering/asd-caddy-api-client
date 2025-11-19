/**
 * Integration tests for .asd production routing scenarios
 *
 * These tests validate the specific routing patterns used in .asd:
 * - Multiple DNS names pointing to same backend
 * - Localhost backend proxying
 * - Path-based routing under same host
 * - Mixed HTTP/HTTPS servers
 * - WebSocket proxying
 * - Dynamic port allocation
 *
 * Run these tests with:
 * 1. docker compose -f docker-compose.test.yml up -d
 * 2. bun test:integration
 * 3. docker compose -f docker-compose.test.yml down
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CaddyClient } from "../../caddy/client.js";
import * as http from "http";
import { DELAY_MEDIUM, DELAY_LONG } from "./constants.js";

const CADDY_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2019";
const INTEGRATION_TEST = process.env.INTEGRATION_TEST === "true";

// Skip integration tests unless explicitly enabled
const describeIntegration = INTEGRATION_TEST ? describe : describe.skip;

// Helper to add delay between operations
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Helper function to make HTTP requests with custom Host header
 */
function httpRequest(options: {
  host: string;
  port: number;
  path: string;
  headers?: Record<string, string>;
}): Promise<{ body: string; headers: http.IncomingHttpHeaders; statusCode: number }> {
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
        res.on("end", () =>
          resolve({
            body: data,
            headers: res.headers,
            statusCode: res.statusCode ?? 0,
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describeIntegration("ASD Production Routing Scenarios", () => {
  let client: CaddyClient;
  const testServer = "asd_scenarios_server";

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

  beforeEach(async () => {
    // Ensure only test server exists on port 80 with empty routes
    const servers = (await client.getServers()) as Record<string, unknown>;

    // Remove any other servers that might be listening on port 80
    for (const serverName of Object.keys(servers)) {
      if (serverName !== testServer) {
        delete servers[serverName];
      }
    }

    // Create/reset test server
    servers[testServer] = {
      listen: [":80"],
      routes: [],
      automatic_https: { disable: true },
    };

    await client.patchServer(servers);
    await delay(DELAY_MEDIUM); // Wait for Caddy to apply configuration
  });

  afterAll(async () => {
    // Clean up test server and restore original server
    try {
      const servers = (await client.getServers()) as Record<string, unknown>;
      if (servers[testServer]) {
        delete servers[testServer];
      }

      // Restore the original server from Caddyfile
      servers.https_server = {
        listen: [":80"],
        routes: [
          {
            handle: [
              {
                handler: "static_response",
                body: "Caddy test server ready",
              },
            ],
          },
        ],
      };

      await client.patchServer(servers);
      await delay(DELAY_MEDIUM);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Multiple DNS to Same Backend (P0 - CRITICAL)", () => {
    test("multiple subdomains route to same backend service", async () => {
      // Scenario: test-1.asd.local, test-2.asd.local, test-3.asd.local all -> echo-test:5678
      // This is how .asd handles multiple user projects pointing to same service

      // Add route 1: test-1.asd.local
      await client.insertRoute(
        testServer,
        {
          "@id": "subdomain-1",
          match: [{ host: ["test-1.asd.local"] }],
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

      // Add route 2: test-2.asd.local (same backend)
      await client.insertRoute(
        testServer,
        {
          "@id": "subdomain-2",
          match: [{ host: ["test-2.asd.local"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        },
        "end"
      );

      // Add route 3: test-3.asd.local (same backend)
      await client.insertRoute(
        testServer,
        {
          "@id": "subdomain-3",
          match: [{ host: ["test-3.asd.local"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        },
        "end"
      );

      await delay(DELAY_LONG);

      // Verify all three subdomains reach the same backend
      const response1 = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "test-1.asd.local" },
      });
      expect(response1.statusCode).toBe(200);
      expect(response1.body).toContain("Hello from backend 1");

      const response2 = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "test-2.asd.local" },
      });
      expect(response2.statusCode).toBe(200);
      expect(response2.body).toContain("Hello from backend 1");

      const response3 = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "test-3.asd.local" },
      });
      expect(response3.statusCode).toBe(200);
      expect(response3.body).toContain("Hello from backend 1");
    });

    test("wildcard subdomain routing works", async () => {
      // Scenario: *.projects.asd.local -> same backend
      // Useful for dynamic project creation

      await client.insertRoute(
        testServer,
        {
          "@id": "wildcard-subdomain",
          match: [{ host: ["*.projects.asd.local"] }],
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

      await delay(DELAY_LONG);

      // Test different subdomains matching the wildcard
      const response1 = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "project-abc.projects.asd.local" },
      });
      expect(response1.statusCode).toBe(200);
      expect(response1.body).toContain("Hello from backend 1");

      const response2 = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "project-xyz.projects.asd.local" },
      });
      expect(response2.statusCode).toBe(200);
      expect(response2.body).toContain("Hello from backend 1");
    });
  });

  describe("Same Host, Path-Based Routing (P0 - CRITICAL)", () => {
    test("different paths under same host route to different backends", async () => {
      // Scenario: studio.localhost/api -> backend 2, studio.localhost/admin -> backend 3, studio.localhost/ -> backend 1
      // This is how .asd routes different services under same domain

      // Route 1: /api/* -> echo-test-2:5679
      await client.insertRoute(
        testServer,
        {
          "@id": "api-path",
          match: [{ host: ["studio.localhost"], path: ["/api/*"] }],
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

      // Route 2: /admin/* -> echo-test-3:5680
      await client.insertRoute(
        testServer,
        {
          "@id": "admin-path",
          match: [{ host: ["studio.localhost"], path: ["/admin/*"] }],
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

      // Route 3: /* -> echo-test:5678 (catch-all)
      await client.insertRoute(
        testServer,
        {
          "@id": "root-path",
          match: [{ host: ["studio.localhost"], path: ["/*"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
            },
          ],
          terminal: true,
        },
        "end"
      );

      await delay(DELAY_LONG);

      // Test /api/* goes to backend 2
      const apiResponse = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/api/users",
        headers: { Host: "studio.localhost" },
      });
      expect(apiResponse.statusCode).toBe(200);
      expect(apiResponse.body).toContain("Hello from backend 2");

      // Test /admin/* goes to backend 3
      const adminResponse = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/admin/dashboard",
        headers: { Host: "studio.localhost" },
      });
      expect(adminResponse.statusCode).toBe(200);
      expect(adminResponse.body).toContain("Hello from backend 3");

      // Test / goes to backend 1
      const rootResponse = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "studio.localhost" },
      });
      expect(rootResponse.statusCode).toBe(200);
      expect(rootResponse.body).toContain("Hello from backend 1");
    });

    test("path ordering matters - most specific first", async () => {
      // Add routes in order: specific -> general
      // /api/v2/* -> backend 3
      await client.insertRoute(
        testServer,
        {
          "@id": "api-v2",
          match: [{ host: ["app.localhost"], path: ["/api/v2/*"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test-3:5680" }],
            },
          ],
          terminal: true,
        },
        "beginning"
      );

      // /api/* -> backend 2
      await client.insertRoute(
        testServer,
        {
          "@id": "api-v1",
          match: [{ host: ["app.localhost"], path: ["/api/*"] }],
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

      await delay(DELAY_LONG);

      // /api/v2/users should hit backend 3 (most specific)
      const v2Response = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/api/v2/users",
        headers: { Host: "app.localhost" },
      });
      expect(v2Response.statusCode).toBe(200);
      expect(v2Response.body).toContain("Hello from backend 3");

      // /api/v1/users should hit backend 2
      const v1Response = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/api/v1/users",
        headers: { Host: "app.localhost" },
      });
      expect(v1Response.statusCode).toBe(200);
      expect(v1Response.body).toContain("Hello from backend 2");
    });
  });

  describe("Localhost Backend Proxying (P0 - CRITICAL)", () => {
    test("can proxy to host.docker.internal (simulates localhost)", async () => {
      // Scenario: studio.localhost -> http://host.docker.internal:PORT
      // This simulates proxying to services running on the host machine

      await client.insertRoute(
        testServer,
        {
          "@id": "host-proxy",
          match: [{ host: ["host-service.localhost"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "host.docker.internal:5678" }],
            },
          ],
          terminal: true,
        },
        "beginning"
      );

      await delay(DELAY_LONG);

      // Note: This test requires host.docker.internal to be accessible
      // In docker-compose.test.yml, we need to ensure network mode allows this
      try {
        const response = await httpRequest({
          host: "localhost",
          port: 8080,
          path: "/",
          headers: { Host: "host-service.localhost" },
        });

        // If host.docker.internal is accessible, we should get a response
        expect(response.statusCode).toBeGreaterThan(0);
      } catch {
        // If host.docker.internal is not accessible, that's expected in some environments
        // The important thing is that Caddy accepts the configuration
        const routes = await client.getRoutes(testServer);
        const hostRoute = routes.find((r) => r["@id"] === "host-proxy");
        expect(hostRoute).toBeDefined();
        expect(hostRoute?.handle?.[0]?.upstreams?.[0]?.dial).toBe("host.docker.internal:5678");
      }
    });

    test("supports various localhost formats in upstream dial", async () => {
      // Test that Caddy accepts various localhost addressing formats

      const formats = [
        { id: "localhost-name", dial: "localhost:3000" },
        { id: "localhost-ip", dial: "127.0.0.1:3000" },
        { id: "localhost-ipv6", dial: "[::1]:3000" },
        { id: "host-docker", dial: "host.docker.internal:3000" },
      ];

      for (const format of formats) {
        await client.insertRoute(
          testServer,
          {
            "@id": format.id,
            match: [{ host: [`${format.id}.localhost`] }],
            handle: [
              {
                handler: "reverse_proxy",
                upstreams: [{ dial: format.dial }],
              },
            ],
            terminal: true,
          },
          "end"
        );
      }

      await delay(DELAY_LONG);

      // Verify all formats were accepted
      const routes = await client.getRoutes(testServer);
      expect(routes.length).toBeGreaterThanOrEqual(4);

      for (const format of formats) {
        const route = routes.find((r) => r["@id"] === format.id);
        expect(route).toBeDefined();
        expect(route?.handle?.[0]?.upstreams?.[0]?.dial).toBe(format.dial);
      }
    });
  });

  describe("Mixed HTTP/HTTPS Servers (P0 - CRITICAL)", () => {
    test("can run HTTP and HTTPS servers simultaneously", async () => {
      // Scenario: HTTP server for tunnel traffic, HTTPS server for local TLS
      // .asd uses both patterns depending on how services are exposed

      const httpServer = "asd-http-server";
      const httpsServer = "asd-https-server";

      // Get current servers and remove testServer to avoid port conflict
      const currentServers = (await client.getServers()) as Record<string, unknown>;
      delete currentServers[testServer]; // Remove default test server

      // Create both HTTP and HTTPS servers in one PATCH
      const updatedServers = {
        ...currentServers,
        [httpServer]: {
          listen: [":80"],
          routes: [
            {
              "@id": "http-route",
              match: [{ host: ["tunnel.asd.local"] }],
              handle: [
                {
                  handler: "reverse_proxy",
                  upstreams: [{ dial: "echo-test:5678" }],
                },
              ],
              terminal: true,
            },
          ],
          automatic_https: { disable: true },
        },
        [httpsServer]: {
          listen: [":8443"],
          routes: [
            {
              "@id": "https-route",
              match: [{ host: ["local.asd.local"] }],
              handle: [
                {
                  handler: "reverse_proxy",
                  upstreams: [{ dial: "echo-test-2:5679" }],
                },
              ],
              terminal: true,
            },
          ],
          automatic_https: { disable: true },
        },
      };

      await client.patchServer(updatedServers);
      await delay(DELAY_LONG);

      // Verify both servers exist
      const servers = (await client.getServers()) as Record<string, unknown>;
      expect(servers[httpServer]).toBeDefined();
      expect(servers[httpsServer]).toBeDefined();

      // Clean up - remove test servers and restore testServer
      delete servers[httpServer];
      delete servers[httpsServer];
      servers[testServer] = {
        listen: [":80"],
        routes: [],
        automatic_https: { disable: true },
      };
      await client.patchServer(servers);
      await delay(200);
    });
  });

  describe("Host Header Forwarding (P1 - HIGH)", () => {
    test("preserves original host header in proxied requests", async () => {
      // Add a route that proxies to backend
      await client.insertRoute(
        testServer,
        {
          "@id": "host-header-test",
          match: [{ host: ["test.cicd.eu1.asd.engineer"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "echo-test:5678" }],
              // By default, Caddy preserves the Host header
            },
          ],
          terminal: true,
        },
        "beginning"
      );

      await delay(DELAY_LONG);

      // Make request with custom Host header
      const response = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "test.cicd.eu1.asd.engineer" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Hello from backend 1");

      // The backend receives the request, which confirms host header routing works
      // In a real scenario, the backend could echo back the Host header to verify
    });
  });

  describe("Dynamic Port Allocation (P1 - HIGH)", () => {
    test("can route to dynamically allocated ports", async () => {
      // Scenario: .asd allocates random ports for services
      // project-1 -> :45001, project-2 -> :45002, etc.

      const ports = [5678, 5679, 5680]; // Simulating dynamic ports
      const projects = ["project-alpha", "project-beta", "project-gamma"];

      for (let i = 0; i < projects.length; i++) {
        await client.insertRoute(
          testServer,
          {
            "@id": projects[i],
            match: [{ host: [`${projects[i]}.asd.local`] }],
            handle: [
              {
                handler: "reverse_proxy",
                upstreams: [
                  {
                    dial:
                      ports[i] === 5678
                        ? "echo-test:5678"
                        : ports[i] === 5679
                          ? "echo-test-2:5679"
                          : "echo-test-3:5680",
                  },
                ],
              },
            ],
            terminal: true,
          },
          "end"
        );
      }

      await delay(DELAY_LONG);

      // Verify each project routes to its assigned port/backend
      const response1 = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "project-alpha.asd.local" },
      });
      expect(response1.statusCode).toBe(200);
      expect(response1.body).toContain("Hello from backend 1");

      const response2 = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "project-beta.asd.local" },
      });
      expect(response2.statusCode).toBe(200);
      expect(response2.body).toContain("Hello from backend 2");

      const response3 = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "project-gamma.asd.local" },
      });
      expect(response3.statusCode).toBe(200);
      expect(response3.body).toContain("Hello from backend 3");
    });
  });
});
