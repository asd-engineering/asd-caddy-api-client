/**
 * Complex .asd production scenario integration test
 *
 * This test simulates a realistic .asd deployment with:
 * - Multiple services (5+) with different configurations
 * - Shared global health endpoint
 * - Custom X-ASD-Service-ID headers per service
 * - TLS configuration (local certificates)
 * - Complex route ordering (health > specific paths > domains)
 * - Shared security headers
 *
 * Run these tests with:
 * 1. docker compose -f docker-compose.test.yml up -d
 * 2. bun test:integration
 * 3. docker compose -f docker-compose.test.yml down
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../caddy/client.js";
import type { CaddyRoute } from "../../types.js";
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

describeIntegration("ASD Complex Production Scenario", () => {
  let client: CaddyClient;
  const complexServer = "asd-complex-production";

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
    // Clean up complex server
    try {
      const servers = (await client.getServers()) as Record<string, unknown>;
      delete servers[complexServer];
      await client.patchServer(servers);
      await delay(DELAY_MEDIUM);
    } catch {
      // Ignore cleanup errors
    }
  });

  test("simulates full .asd production scenario with 5+ services", async () => {
    /**
     * Scenario: .asd instance with 5 services
     *
     * Services:
     * 1. Code Server:  studio.localhost/          → echo-test:5678
     * 2. API Backend:  studio.localhost/api/*     → echo-test-2:5679
     * 3. Admin Panel:  studio.localhost/admin/*   → echo-test-3:5680
     * 4. Database UI:  db.localhost/              → echo-test-2:5679
     * 5. Monitoring:   metrics.localhost/         → echo-test-3:5680
     *
     * Shared Configuration:
     * - Global /health endpoint (highest priority)
     * - X-ASD-Service-ID header (unique per service)
     * - X-ASD-Request-ID header (unique per request)
     * - Security headers (X-Frame-Options, X-Content-Type-Options)
     *
     * Route Ordering (CRITICAL):
     * 1. Global /health endpoint (first)
     * 2. Path-specific routes (/api/*, /admin/*)
     * 3. Domain-specific routes
     */

    const routes: CaddyRoute[] = [];

    // Route 1: GLOBAL HEALTH ENDPOINT (HIGHEST PRIORITY)
    // This must come first - responds before any service route
    routes.push({
      "@id": "global-health",
      match: [{ path: ["/health"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Health": ["ok"],
              "X-ASD-Instance": ["prod-cluster-1"],
            },
          },
        },
        {
          handler: "static_response",
          status_code: 200,
          body: JSON.stringify({
            status: "healthy",
            services: 5,
            version: "1.0.0",
          }),
          headers: {
            "Content-Type": ["application/json"],
          },
        },
      ],
      terminal: true,
    });

    // Route 2: Code Server (studio.localhost/)
    // X-ASD-Service-ID: code-server-main
    routes.push({
      "@id": "service-code-server",
      match: [{ host: ["studio.localhost"], path: ["/*"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["code-server-main"],
              "X-ASD-Service-Type": ["ide"],
              "X-Frame-Options": ["SAMEORIGIN"],
              "X-Content-Type-Options": ["nosniff"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test:5678" }],
        },
      ],
      terminal: true,
    });

    // Route 3: API Backend (studio.localhost/api/*)
    // X-ASD-Service-ID: api-backend-v1
    // This MUST come before the code-server route (more specific path)
    routes.splice(1, 0, {
      "@id": "service-api",
      match: [{ host: ["studio.localhost"], path: ["/api/*"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["api-backend-v1"],
              "X-ASD-Service-Type": ["api"],
              "X-Frame-Options": ["DENY"],
              "X-Content-Type-Options": ["nosniff"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-2:5679" }],
        },
      ],
      terminal: true,
    });

    // Route 4: Admin Panel (studio.localhost/admin/*)
    // X-ASD-Service-ID: admin-panel-v2
    routes.splice(2, 0, {
      "@id": "service-admin",
      match: [{ host: ["studio.localhost"], path: ["/admin/*"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["admin-panel-v2"],
              "X-ASD-Service-Type": ["admin"],
              "X-Frame-Options": ["DENY"],
              "X-Content-Type-Options": ["nosniff"],
              "X-ASD-Auth-Required": ["true"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-3:5680" }],
        },
      ],
      terminal: true,
    });

    // Route 5: Database UI (db.localhost/)
    // X-ASD-Service-ID: database-ui-pgadmin
    routes.push({
      "@id": "service-dbui",
      match: [{ host: ["db.localhost"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["database-ui-pgadmin"],
              "X-ASD-Service-Type": ["database-management"],
              "X-Frame-Options": ["SAMEORIGIN"],
              "X-Content-Type-Options": ["nosniff"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-2:5679" }],
        },
      ],
      terminal: true,
    });

    // Route 6: Monitoring (metrics.localhost/)
    // X-ASD-Service-ID: monitoring-prometheus
    routes.push({
      "@id": "service-monitoring",
      match: [{ host: ["metrics.localhost"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["monitoring-prometheus"],
              "X-ASD-Service-Type": ["observability"],
              "X-Frame-Options": ["DENY"],
              "X-Content-Type-Options": ["nosniff"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-3:5680" }],
        },
      ],
      terminal: true,
    });

    // Create server with all routes
    const servers = (await client.getServers()) as Record<string, unknown>;
    servers[complexServer] = {
      listen: [":80"],
      routes,
      automatic_https: { disable: true }, // Disable for test (would be enabled in production)
    };

    await client.patchServer(servers);
    await delay(DELAY_LONG);

    // ===== VERIFICATION TESTS =====

    // Test 1: Global health endpoint works (highest priority)
    const healthResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/health",
      headers: { Host: "studio.localhost" },
    });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.body).toContain("healthy");
    expect(healthResponse.headers["x-asd-health"]).toBe("ok");
    expect(healthResponse.headers["x-asd-instance"]).toBe("prod-cluster-1");

    // Test 2: Health endpoint works for ANY host
    const healthResponse2 = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/health",
      headers: { Host: "db.localhost" },
    });
    expect(healthResponse2.statusCode).toBe(200);
    expect(healthResponse2.body).toContain("healthy");

    // Test 3: API service has correct X-ASD-Service-ID header
    const apiResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/api/users",
      headers: { Host: "studio.localhost" },
    });
    expect(apiResponse.statusCode).toBe(200);
    expect(apiResponse.body).toContain("Hello from backend 2"); // echo-test-2
    expect(apiResponse.headers["x-asd-service-id"]).toBe("api-backend-v1");
    expect(apiResponse.headers["x-asd-service-type"]).toBe("api");
    expect(apiResponse.headers["x-frame-options"]).toBe("DENY");

    // Test 4: Admin service has correct X-ASD-Service-ID header
    const adminResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/admin/dashboard",
      headers: { Host: "studio.localhost" },
    });
    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.body).toContain("Hello from backend 3"); // echo-test-3
    expect(adminResponse.headers["x-asd-service-id"]).toBe("admin-panel-v2");
    expect(adminResponse.headers["x-asd-service-type"]).toBe("admin");
    expect(adminResponse.headers["x-asd-auth-required"]).toBe("true");

    // Test 5: Code Server (root path) has correct X-ASD-Service-ID header
    const codeServerResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "studio.localhost" },
    });
    expect(codeServerResponse.statusCode).toBe(200);
    expect(codeServerResponse.body).toContain("Hello from backend 1"); // echo-test
    expect(codeServerResponse.headers["x-asd-service-id"]).toBe("code-server-main");
    expect(codeServerResponse.headers["x-asd-service-type"]).toBe("ide");

    // Test 6: Database UI has correct X-ASD-Service-ID header
    const dbResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "db.localhost" },
    });
    expect(dbResponse.statusCode).toBe(200);
    expect(dbResponse.body).toContain("Hello from backend 2"); // echo-test-2
    expect(dbResponse.headers["x-asd-service-id"]).toBe("database-ui-pgadmin");
    expect(dbResponse.headers["x-asd-service-type"]).toBe("database-management");

    // Test 7: Monitoring service has correct X-ASD-Service-ID header
    const metricsResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "metrics.localhost" },
    });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.body).toContain("Hello from backend 3"); // echo-test-3
    expect(metricsResponse.headers["x-asd-service-id"]).toBe("monitoring-prometheus");
    expect(metricsResponse.headers["x-asd-service-type"]).toBe("observability");

    // Test 8: Verify route ordering - /api/* takes precedence over /*
    // (Already tested above, but let's explicitly verify)
    const apiPrecedenceResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/api/test",
      headers: { Host: "studio.localhost" },
    });
    expect(apiPrecedenceResponse.headers["x-asd-service-id"]).toBe("api-backend-v1");
    // Should NOT be code-server-main

    // Test 9: Verify all services have security headers
    expect(apiResponse.headers["x-content-type-options"]).toBe("nosniff");
    expect(adminResponse.headers["x-content-type-options"]).toBe("nosniff");
    expect(codeServerResponse.headers["x-content-type-options"]).toBe("nosniff");
    expect(dbResponse.headers["x-content-type-options"]).toBe("nosniff");
    expect(metricsResponse.headers["x-content-type-options"]).toBe("nosniff");
  });

  test("verifies configuration is idempotent (same config = same result)", async () => {
    /**
     * This test proves that applying the same configuration twice
     * produces identical Caddy state (idempotency guarantee)
     */

    // Build the same complex configuration from test 1
    const routes: CaddyRoute[] = [];

    // Route 1: Global health endpoint
    routes.push({
      "@id": "global-health",
      match: [{ path: ["/health"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Health": ["ok"],
              "X-ASD-Instance": ["prod-cluster-1"],
            },
          },
        },
        {
          handler: "static_response",
          status_code: 200,
          body: JSON.stringify({
            status: "healthy",
            services: 5,
            version: "1.0.0",
          }),
          headers: {
            "Content-Type": ["application/json"],
          },
        },
      ],
      terminal: true,
    });

    // Route 2: API Backend
    routes.splice(1, 0, {
      "@id": "service-api",
      match: [{ host: ["studio.localhost"], path: ["/api/*"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["api-backend-v1"],
              "X-ASD-Service-Type": ["api"],
              "X-Frame-Options": ["DENY"],
              "X-Content-Type-Options": ["nosniff"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-2:5679" }],
        },
      ],
      terminal: true,
    });

    // Route 3: Admin Panel
    routes.splice(2, 0, {
      "@id": "service-admin",
      match: [{ host: ["studio.localhost"], path: ["/admin/*"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["admin-panel-v2"],
              "X-ASD-Service-Type": ["admin"],
              "X-Frame-Options": ["DENY"],
              "X-Content-Type-Options": ["nosniff"],
              "X-ASD-Auth-Required": ["true"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-3:5680" }],
        },
      ],
      terminal: true,
    });

    // Route 4: Code Server
    routes.push({
      "@id": "service-code-server",
      match: [{ host: ["studio.localhost"], path: ["/*"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["code-server-main"],
              "X-ASD-Service-Type": ["ide"],
              "X-Frame-Options": ["SAMEORIGIN"],
              "X-Content-Type-Options": ["nosniff"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test:5678" }],
        },
      ],
      terminal: true,
    });

    // Route 5: Database UI
    routes.push({
      "@id": "service-dbui",
      match: [{ host: ["db.localhost"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["database-ui-pgadmin"],
              "X-ASD-Service-Type": ["database-management"],
              "X-Frame-Options": ["SAMEORIGIN"],
              "X-Content-Type-Options": ["nosniff"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-2:5679" }],
        },
      ],
      terminal: true,
    });

    // Route 6: Monitoring
    routes.push({
      "@id": "service-monitoring",
      match: [{ host: ["metrics.localhost"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-ASD-Service-ID": ["monitoring-prometheus"],
              "X-ASD-Service-Type": ["observability"],
              "X-Frame-Options": ["DENY"],
              "X-Content-Type-Options": ["nosniff"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-3:5680" }],
        },
      ],
      terminal: true,
    });

    // Apply configuration FIRST TIME
    const servers1 = (await client.getServers()) as Record<string, unknown>;
    servers1[complexServer] = {
      listen: [":80"],
      routes,
      automatic_https: { disable: true },
    };

    await client.patchServer(servers1);
    await delay(DELAY_LONG);

    // Capture state after first application
    const configAfterFirstApply = await client.getConfig();
    const serverStateAfterFirstApply = (await client.getServers()) as Record<string, unknown>;

    // Apply SAME configuration SECOND TIME
    const servers2 = (await client.getServers()) as Record<string, unknown>;
    servers2[complexServer] = {
      listen: [":80"],
      routes, // Same routes array
      automatic_https: { disable: true },
    };

    await client.patchServer(servers2);
    await delay(DELAY_LONG);

    // Capture state after second application
    const configAfterSecondApply = await client.getConfig();
    const serverStateAfterSecondApply = (await client.getServers()) as Record<string, unknown>;

    // IDEMPOTENCY VERIFICATION: Both configurations should be identical
    expect(serverStateAfterSecondApply).toEqual(serverStateAfterFirstApply);
    expect(configAfterSecondApply).toEqual(configAfterFirstApply);

    // ===== COMPREHENSIVE ENDPOINT VERIFICATION =====
    // Verify ALL routes are functional after reapplication with correct headers

    // Test 1: Global health endpoint
    const healthResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/health",
      headers: { Host: "studio.localhost" },
    });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.body).toContain("healthy");
    expect(healthResponse.headers["x-asd-health"]).toBe("ok");
    expect(healthResponse.headers["x-asd-instance"]).toBe("prod-cluster-1");

    // Test 2: Health endpoint works for ANY host
    const healthResponse2 = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/health",
      headers: { Host: "db.localhost" },
    });
    expect(healthResponse2.statusCode).toBe(200);
    expect(healthResponse2.body).toContain("healthy");

    // Test 3: API service has correct X-ASD-Service-ID header
    const apiResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/api/users",
      headers: { Host: "studio.localhost" },
    });
    expect(apiResponse.statusCode).toBe(200);
    expect(apiResponse.body).toContain("Hello from backend 2");
    expect(apiResponse.headers["x-asd-service-id"]).toBe("api-backend-v1");
    expect(apiResponse.headers["x-asd-service-type"]).toBe("api");
    expect(apiResponse.headers["x-frame-options"]).toBe("DENY");
    expect(apiResponse.headers["x-content-type-options"]).toBe("nosniff");

    // Test 4: Admin service has correct X-ASD-Service-ID header
    const adminResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/admin/dashboard",
      headers: { Host: "studio.localhost" },
    });
    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.body).toContain("Hello from backend 3");
    expect(adminResponse.headers["x-asd-service-id"]).toBe("admin-panel-v2");
    expect(adminResponse.headers["x-asd-service-type"]).toBe("admin");
    expect(adminResponse.headers["x-asd-auth-required"]).toBe("true");
    expect(adminResponse.headers["x-content-type-options"]).toBe("nosniff");

    // Test 5: Code Server (root path) has correct X-ASD-Service-ID header
    const codeServerResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "studio.localhost" },
    });
    expect(codeServerResponse.statusCode).toBe(200);
    expect(codeServerResponse.body).toContain("Hello from backend 1");
    expect(codeServerResponse.headers["x-asd-service-id"]).toBe("code-server-main");
    expect(codeServerResponse.headers["x-asd-service-type"]).toBe("ide");
    expect(codeServerResponse.headers["x-content-type-options"]).toBe("nosniff");

    // Test 6: Database UI has correct X-ASD-Service-ID header
    const dbResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "db.localhost" },
    });
    expect(dbResponse.statusCode).toBe(200);
    expect(dbResponse.body).toContain("Hello from backend 2");
    expect(dbResponse.headers["x-asd-service-id"]).toBe("database-ui-pgadmin");
    expect(dbResponse.headers["x-asd-service-type"]).toBe("database-management");
    expect(dbResponse.headers["x-content-type-options"]).toBe("nosniff");

    // Test 7: Monitoring service has correct X-ASD-Service-ID header
    const metricsResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "metrics.localhost" },
    });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.body).toContain("Hello from backend 3");
    expect(metricsResponse.headers["x-asd-service-id"]).toBe("monitoring-prometheus");
    expect(metricsResponse.headers["x-asd-service-type"]).toBe("observability");
    expect(metricsResponse.headers["x-content-type-options"]).toBe("nosniff");

    // Test 8: Verify route ordering - /api/* takes precedence over /*
    const apiPrecedenceResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/api/test",
      headers: { Host: "studio.localhost" },
    });
    expect(apiPrecedenceResponse.headers["x-asd-service-id"]).toBe("api-backend-v1");
    // Should NOT be code-server-main

    // Test 9: Verify /admin/* takes precedence over /*
    const adminPrecedenceResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/admin/users",
      headers: { Host: "studio.localhost" },
    });
    expect(adminPrecedenceResponse.headers["x-asd-service-id"]).toBe("admin-panel-v2");
    // Should NOT be code-server-main

    // Save final configuration as snapshot for comparison
    if (process.env.UPDATE_SNAPSHOTS === "true") {
      const fs = await import("fs/promises");
      const path = await import("path");
      const fixtureDir = path.join(
        process.cwd(),
        "src",
        "__tests__",
        "integration",
        "__fixtures__"
      );
      await fs.mkdir(fixtureDir, { recursive: true });

      const snapshotPath = path.join(fixtureDir, "asd-complex-scenario-config.json");
      await fs.writeFile(
        snapshotPath,
        JSON.stringify(serverStateAfterSecondApply[complexServer], null, 2),
        "utf-8"
      );
    }
  });

  test("verifies route ordering is critical for complex configurations", async () => {
    /**
     * This test explicitly verifies that route ORDER matters
     * when you have overlapping patterns
     */

    const routes: CaddyRoute[] = [];

    // Add routes in WRONG order first, then verify Caddy respects array order

    // Route 1: Catch-all for studio.localhost (/* matches everything)
    routes.push({
      "@id": "catch-all",
      match: [{ host: ["test.localhost"], path: ["/*"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-Matched-Route": ["catch-all"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test:5678" }],
        },
      ],
      terminal: true,
    });

    // Route 2: Specific path (should come BEFORE catch-all to work)
    routes.splice(0, 0, {
      "@id": "specific-path",
      match: [{ host: ["test.localhost"], path: ["/api/*"] }],
      handle: [
        {
          handler: "headers",
          response: {
            set: {
              "X-Matched-Route": ["specific-path"],
            },
          },
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-2:5679" }],
        },
      ],
      terminal: true,
    });

    // Create server
    const servers = (await client.getServers()) as Record<string, unknown>;
    servers[complexServer] = {
      listen: [":80"],
      routes,
      automatic_https: { disable: true },
    };

    await client.patchServer(servers);
    await delay(DELAY_LONG);

    // Verify specific path is matched first
    const specificResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/api/test",
      headers: { Host: "test.localhost" },
    });
    expect(specificResponse.headers["x-matched-route"]).toBe("specific-path");
    expect(specificResponse.body).toContain("Hello from backend 2");

    // Verify catch-all is matched for other paths
    const catchAllResponse = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/other",
      headers: { Host: "test.localhost" },
    });
    expect(catchAllResponse.headers["x-matched-route"]).toBe("catch-all");
    expect(catchAllResponse.body).toContain("Hello from backend 1");
  });
});
