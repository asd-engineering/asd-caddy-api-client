/**
 * ASD Authentication Scenarios Integration Test
 *
 * This test demonstrates complex real-world .asd authentication patterns:
 * - Service 1: Domain-level basic auth (entire domain protected)
 * - Service 2: Path-level basic auth (only /admin/* protected)
 * - Service 3: No authentication (public service)
 * - All services: Health endpoints accessible without auth
 *
 * Run these tests with:
 * 1. docker compose -f docker-compose.test.yml up -d
 * 2. INTEGRATION_TEST=true bun test src/__tests__/integration/asd-auth-scenarios.integration.test.ts
 * 3. docker compose -f docker-compose.test.yml down
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient, buildBasicAuthHandler } from "../../caddy/index.js";
import type { CaddyRoute } from "../../types.js";
import * as http from "http";
import { DELAY_LONG } from "./constants.js";

const CADDY_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2019";
const INTEGRATION_TEST = process.env.INTEGRATION_TEST === "true";

// Skip integration tests unless explicitly enabled
const describeIntegration = INTEGRATION_TEST ? describe : describe.skip;

// Helper to add delay between operations
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Helper function to make HTTP requests with custom Host header and Basic Auth
 */
function httpRequest(options: {
  host: string;
  port: number;
  path: string;
  headers?: Record<string, string>;
  auth?: { username: string; password: string };
}): Promise<{
  body: string;
  headers: http.IncomingHttpHeaders;
  statusCode: number;
}> {
  return new Promise((resolve, reject) => {
    const headers = { ...options.headers };

    // Add Basic Auth header if provided
    if (options.auth) {
      const credentials = Buffer.from(`${options.auth.username}:${options.auth.password}`).toString(
        "base64"
      );
      headers.Authorization = `Basic ${credentials}`;
    }

    const req = http.request(
      {
        hostname: options.host,
        port: options.port,
        path: options.path,
        method: "GET",
        headers,
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

describeIntegration("ASD Authentication Scenarios", () => {
  let client: CaddyClient;
  const authServer = "asd-auth-test";

  // Test credentials - bcrypt hashes generated with Caddy CLI
  // Generated using: docker exec caddy-test caddy hash-password --plaintext <password>
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "admin123";
  const ADMIN_HASH = "$2a$14$lVk5aohGe.EmndSm6H1uJeOI/lOcaTHoJYSk/8dn1DDsW5NbNqVLW";

  const API_USER = "apiuser";
  const API_PASS = "apipass";
  const API_HASH = "$2a$14$6bYQvFSJUbyRLQ3vjnjBWu1ea6Sj3GiJAcp4vaVXF0NtuNhhs7.x.";

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
    // Clean up test server
    try {
      const servers = (await client.getServers()) as Record<string, unknown>;
      delete servers[authServer];
      await client.patchServer(servers);
      await delay(DELAY_LONG);
    } catch {
      // Ignore cleanup errors
    }
  });

  test("complex authentication scenario with 3 services: domain auth, path auth, no auth + health endpoints", async () => {
    /**
     * Complex authentication scenario for .asd production:
     *
     * Service 1: admin.localhost - DOMAIN-LEVEL AUTH
     * - Entire domain requires authentication
     * - /health endpoint is PUBLIC (accessible without auth)
     * - Multiple users supported
     *
     * Service 2: api.localhost - PATH-LEVEL AUTH
     * - /admin/* paths require authentication
     * - Other paths (/public/*, /) are public
     * - /health endpoint is PUBLIC
     *
     * Service 3: public.localhost - NO AUTH
     * - Completely public service
     * - /health endpoint still available
     *
     * This tests the most complex .asd authentication pattern where:
     * - Some services are fully protected
     * - Some services have selective path protection
     * - Some services are fully public
     * - Health checks always work (monitoring requirement)
     */

    const routes: CaddyRoute[] = [];

    // ========================================
    // Service 1: admin.localhost - DOMAIN-LEVEL AUTH
    // ========================================

    // Route 1a: Health endpoint (PUBLIC - highest priority)
    routes.push({
      "@id": "admin-health",
      match: [{ host: ["admin.localhost"], path: ["/health"] }],
      handle: [
        {
          handler: "static_response",
          status_code: 200,
          body: JSON.stringify({ service: "admin", status: "healthy" }),
          headers: { "Content-Type": ["application/json"] },
        },
      ],
      terminal: true,
    });

    // Route 1b: All other paths (PROTECTED - requires auth)
    routes.push({
      "@id": "admin-service",
      match: [{ host: ["admin.localhost"], path: ["/*"] }],
      handle: [
        buildBasicAuthHandler({
          enabled: true,
          accounts: [
            { username: ADMIN_USER, password: ADMIN_HASH },
            { username: "superadmin", password: ADMIN_HASH }, // Multiple users
          ],
          realm: "Admin Dashboard",
        }),
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test:5678" }],
        },
      ],
      terminal: true,
    });

    // ========================================
    // Service 2: api.localhost - PATH-LEVEL AUTH
    // ========================================

    // Route 2a: Health endpoint (PUBLIC)
    routes.push({
      "@id": "api-health",
      match: [{ host: ["api.localhost"], path: ["/health"] }],
      handle: [
        {
          handler: "static_response",
          status_code: 200,
          body: JSON.stringify({ service: "api", status: "healthy" }),
          headers: { "Content-Type": ["application/json"] },
        },
      ],
      terminal: true,
    });

    // Route 2b: /admin/* paths (PROTECTED)
    routes.push({
      "@id": "api-admin-path",
      match: [{ host: ["api.localhost"], path: ["/admin/*"] }],
      handle: [
        buildBasicAuthHandler({
          enabled: true,
          accounts: [{ username: API_USER, password: API_HASH }],
          realm: "API Admin",
        }),
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-2:5679" }],
        },
      ],
      terminal: true,
    });

    // Route 2c: All other paths (PUBLIC)
    routes.push({
      "@id": "api-public",
      match: [{ host: ["api.localhost"], path: ["/*"] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-2:5679" }],
        },
      ],
      terminal: true,
    });

    // ========================================
    // Service 3: public.localhost - NO AUTH
    // ========================================

    // Route 3a: Health endpoint (PUBLIC)
    routes.push({
      "@id": "public-health",
      match: [{ host: ["public.localhost"], path: ["/health"] }],
      handle: [
        {
          handler: "static_response",
          status_code: 200,
          body: JSON.stringify({ service: "public", status: "healthy" }),
          headers: { "Content-Type": ["application/json"] },
        },
      ],
      terminal: true,
    });

    // Route 3b: All paths (PUBLIC)
    routes.push({
      "@id": "public-service",
      match: [{ host: ["public.localhost"], path: ["/*"] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "echo-test-3:5680" }],
        },
      ],
      terminal: true,
    });

    // Create server with all routes
    const servers = (await client.getServers()) as Record<string, unknown>;
    servers[authServer] = {
      listen: [":80"],
      routes,
      automatic_https: { disable: true },
    };

    await client.patchServer(servers);
    await delay(DELAY_LONG);

    // ===== VERIFICATION TESTS =====

    console.log("\n=== Testing Service 1: admin.localhost (Domain-Level Auth) ===");

    // Test 1.1: Health endpoint accessible without auth
    const adminHealth = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/health",
      headers: { Host: "admin.localhost" },
    });
    expect(adminHealth.statusCode).toBe(200);
    expect(adminHealth.body).toContain("admin");
    expect(adminHealth.body).toContain("healthy");

    // Test 1.2: Root path requires auth (401 without credentials)
    const adminNoAuth = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "admin.localhost" },
    });
    expect(adminNoAuth.statusCode).toBe(401);
    expect(adminNoAuth.headers["www-authenticate"]).toBeDefined();
    expect(adminNoAuth.headers["www-authenticate"]).toContain("Basic");
    expect(adminNoAuth.headers["www-authenticate"]).toContain("Admin Dashboard");

    // Test 1.3: Root path accessible with correct credentials
    const adminWithAuth = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "admin.localhost" },
      auth: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    expect(adminWithAuth.statusCode).toBe(200);
    expect(adminWithAuth.body).toContain("Hello from backend 1");

    // Test 1.4: Wrong credentials rejected
    const adminBadAuth = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "admin.localhost" },
      auth: { username: ADMIN_USER, password: "wrongpass" },
    });
    expect(adminBadAuth.statusCode).toBe(401);

    // Test 1.5: Multiple users work (superadmin)
    const adminSuperuser = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/dashboard",
      headers: { Host: "admin.localhost" },
      auth: { username: "superadmin", password: ADMIN_PASS },
    });
    expect(adminSuperuser.statusCode).toBe(200);

    console.log("\n=== Testing Service 2: api.localhost (Path-Level Auth) ===");

    // Test 2.1: Health endpoint accessible without auth
    const apiHealth = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/health",
      headers: { Host: "api.localhost" },
    });
    expect(apiHealth.statusCode).toBe(200);
    expect(apiHealth.body).toContain("api");

    // Test 2.2: Public paths accessible without auth
    const apiPublic = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/public/data",
      headers: { Host: "api.localhost" },
    });
    expect(apiPublic.statusCode).toBe(200);
    expect(apiPublic.body).toContain("Hello from backend 2");

    // Test 2.3: /admin/* requires auth (401 without credentials)
    const apiAdminNoAuth = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/admin/users",
      headers: { Host: "api.localhost" },
    });
    expect(apiAdminNoAuth.statusCode).toBe(401);
    expect(apiAdminNoAuth.headers["www-authenticate"]).toContain("API Admin");

    // Test 2.4: /admin/* accessible with correct credentials
    const apiAdminWithAuth = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/admin/users",
      headers: { Host: "api.localhost" },
      auth: { username: API_USER, password: API_PASS },
    });
    expect(apiAdminWithAuth.statusCode).toBe(200);
    expect(apiAdminWithAuth.body).toContain("Hello from backend 2");

    // Test 2.5: Wrong API credentials rejected
    const apiAdminBadAuth = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/admin/users",
      headers: { Host: "api.localhost" },
      auth: { username: API_USER, password: "wrongpass" },
    });
    expect(apiAdminBadAuth.statusCode).toBe(401);

    // Test 2.6: Admin credentials don't work on API service (isolation)
    const apiAdminWrongUser = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/admin/users",
      headers: { Host: "api.localhost" },
      auth: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    expect(apiAdminWrongUser.statusCode).toBe(401);

    console.log("\n=== Testing Service 3: public.localhost (No Auth) ===");

    // Test 3.1: Health endpoint accessible
    const publicHealth = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/health",
      headers: { Host: "public.localhost" },
    });
    expect(publicHealth.statusCode).toBe(200);
    expect(publicHealth.body).toContain("public");

    // Test 3.2: All paths accessible without auth
    const publicRoot = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/",
      headers: { Host: "public.localhost" },
    });
    expect(publicRoot.statusCode).toBe(200);
    expect(publicRoot.body).toContain("Hello from backend 3");

    const publicData = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/data/items",
      headers: { Host: "public.localhost" },
    });
    expect(publicData.statusCode).toBe(200);

    console.log("\n=== Verifying Route Ordering and Isolation ===");

    // Test 4.1: Health endpoints take priority over auth routes
    // (Already verified above - health always returns 200 without auth)

    // Test 4.2: Services are isolated (credentials don't cross)
    const adminCredsOnApi = await httpRequest({
      host: "localhost",
      port: 8080,
      path: "/admin/test",
      headers: { Host: "api.localhost" },
      auth: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    expect(adminCredsOnApi.statusCode).toBe(401); // Admin creds don't work on API

    // Test 4.3: Each service has different WWW-Authenticate realm
    expect(adminNoAuth.headers["www-authenticate"]).toContain("Admin Dashboard");
    expect(apiAdminNoAuth.headers["www-authenticate"]).toContain("API Admin");

    console.log("\n=== Exporting Complex Configuration State ===");

    // Export final configuration for inspection
    const finalConfig = (await client.getServers()) as Record<string, unknown>;
    const authServerConfig = finalConfig[authServer];

    // Save configuration snapshot
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

      const snapshotPath = path.join(fixtureDir, "asd-auth-scenarios-config.json");
      await fs.writeFile(snapshotPath, JSON.stringify(authServerConfig, null, 2), "utf-8");
      console.log(`\n✅ Configuration exported to: ${snapshotPath}`);
    }

    // Verify configuration structure
    expect(authServerConfig).toBeDefined();
    expect((authServerConfig as any).routes).toHaveLength(7); // 3 health + 4 service routes

    console.log("\n=== Summary ===");
    console.log("✅ Domain-level auth works (admin.localhost)");
    console.log("✅ Path-level auth works (api.localhost/admin/*)");
    console.log("✅ No auth works (public.localhost)");
    console.log("✅ Health endpoints always accessible");
    console.log("✅ Multiple users per service works");
    console.log("✅ Service isolation (credentials don't cross)");
    console.log("✅ Route ordering correct (health > auth > public)");
    console.log(`✅ Total routes configured: ${routes.length}`);
  });
});
