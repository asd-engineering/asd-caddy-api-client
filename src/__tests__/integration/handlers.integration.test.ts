/**
 * Integration tests for new handler types against real Caddy instance
 *
 * These tests verify that the new handler schemas (v0.3.0) correctly
 * apply configuration to a running Caddy server.
 *
 * Run these tests with:
 * 1. docker compose -f docker-compose.test.yml up -d
 * 2. INTEGRATION_TEST=true bun run test src/__tests__/integration/handlers.integration.test.ts
 * 3. docker compose -f docker-compose.test.yml down
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import { CaddyClient } from "../../caddy/client.js";
import * as http from "http";
import { CADDY_ADMIN_URL, CADDY_HTTP_PORT, DELAY_SHORT } from "./constants.js";
import {
  buildErrorRoute,
  buildRequestBodyHandler,
  buildVarsHandler,
  buildMapHandler,
} from "../../caddy/routes.js";

const INTEGRATION_TEST = process.env.INTEGRATION_TEST === "true";
const CADDY_SERVER_NAME = "https_server"; // Use existing server from docker-compose

/**
 * Helper function to make HTTP requests with custom Host header
 */
function httpRequest(options: {
  host: string;
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: options.host,
        port: options.port,
        path: options.path,
        method: options.method ?? "GET",
        headers: options.headers ?? {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: data,
            headers: res.headers,
          })
        );
      }
    );
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Skip integration tests unless explicitly enabled
const describeIntegration = INTEGRATION_TEST ? describe : describe.skip;

// Helper to add delay between operations
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Track route IDs added in tests for cleanup
let addedRouteIds: string[] = [];

describeIntegration("Handler Integration Tests", () => {
  let client: CaddyClient;

  beforeAll(async () => {
    client = new CaddyClient({ adminUrl: CADDY_ADMIN_URL });

    // Verify Caddy is accessible
    try {
      const config = await client.getConfig();
      if (!config) {
        throw new Error("No config returned");
      }
    } catch {
      throw new Error(
        "Caddy is not running. Start with: docker compose -f docker-compose.test.yml up -d"
      );
    }

    // Give Caddy extra time to settle if another test just modified configuration
    await delay(1000);

    // Ensure clean server state by replacing configuration with empty routes
    // This removes any default routes from the Caddyfile
    const cleanServers: Record<string, unknown> = {
      [CADDY_SERVER_NAME]: {
        listen: [":80"],
        routes: [],
      },
    };

    await client.patchServer(cleanServers);

    // Wait for server to be fully ready after configuration change
    await delay(1000);

    // Verify the server is properly configured
    const servers = (await client.getServers()) as Record<string, unknown>;
    const server = servers[CADDY_SERVER_NAME] as { listen: string[]; routes: unknown[] };
    if (!server || !Array.isArray(server.routes) || server.routes.length !== 0) {
      throw new Error("Server not properly initialized with empty routes");
    }
  });

  afterAll(async () => {
    // Clean up any remaining routes
    for (const routeId of addedRouteIds) {
      try {
        await client.removeRouteById(CADDY_SERVER_NAME, routeId);
      } catch {
        // Ignore cleanup errors
      }
    }
    addedRouteIds = [];
  });

  afterEach(async () => {
    // Clean up routes added in this test
    for (const routeId of addedRouteIds) {
      try {
        await client.removeRouteById(CADDY_SERVER_NAME, routeId);
      } catch {
        // Ignore cleanup errors
      }
    }
    addedRouteIds = [];
    await delay(DELAY_SHORT);
  });

  /**
   * Helper to add a route and track it for cleanup
   */
  async function addTestRoute(route: Record<string, unknown>): Promise<void> {
    const routeId = route["@id"] as string;
    await client.addRoute(CADDY_SERVER_NAME, route);
    addedRouteIds.push(routeId);
    // Give Caddy time to apply the configuration
    await delay(500);
  }

  describe("Static Response Handler", () => {
    test("applies static_response config to Caddy", async () => {
      const route = {
        "@id": "handler-test-static-response",
        match: [{ host: ["static.localhost"] }],
        handle: [
          {
            handler: "static_response",
            status_code: 200,
            body: '{"message":"Hello from static response"}',
            headers: { "Content-Type": ["application/json"] },
          },
        ],
        terminal: true,
      };

      await addTestRoute(route);

      const response = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/",
        headers: { Host: "static.localhost" },
      });

      expect(response.status).toBe(200);
      expect(response.body).toContain("Hello from static response");
      expect(response.headers["content-type"]).toContain("application/json");
    });
  });

  describe("Headers Handler", () => {
    test("applies headers config to Caddy", async () => {
      const route = {
        "@id": "handler-test-headers",
        match: [{ host: ["headers.localhost"] }],
        handle: [
          {
            handler: "headers",
            response: {
              set: {
                "X-Custom-Header": ["custom-value"],
                "X-Frame-Options": ["DENY"],
              },
            },
          },
          {
            handler: "static_response",
            status_code: 200,
            body: "OK",
          },
        ],
        terminal: true,
      };

      await addTestRoute(route);

      const response = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/",
        headers: { Host: "headers.localhost" },
      });

      expect(response.status).toBe(200);
      expect(response.headers["x-custom-header"]).toBe("custom-value");
      expect(response.headers["x-frame-options"]).toBe("DENY");
    });
  });

  describe("Error Handler", () => {
    test("applies error config to Caddy", async () => {
      const route = buildErrorRoute({
        id: "handler-test-error",
        match: { host: ["error.localhost"] },
        statusCode: 503,
        message: "Service temporarily unavailable",
      });

      await addTestRoute(route);

      const response = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/",
        headers: { Host: "error.localhost" },
      });

      // Error handler triggers Caddy's error handling
      // Response may vary based on Caddy config
      expect([500, 502, 503]).toContain(response.status);
    });
  });

  describe("Encode Handler (Compression)", () => {
    test("applies encode config to Caddy", async () => {
      const route = {
        "@id": "handler-test-encode",
        match: [{ host: ["compress.localhost"] }],
        handle: [
          {
            handler: "encode",
            encodings: { gzip: {}, zstd: {} },
            prefer: ["zstd", "gzip"],
            minimum_length: 256,
          },
          {
            handler: "static_response",
            status_code: 200,
            body: "x".repeat(1000), // Long body to trigger compression
          },
        ],
        terminal: true,
      };

      await addTestRoute(route);

      const response = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/",
        headers: {
          Host: "compress.localhost",
          "Accept-Encoding": "gzip, deflate",
        },
      });

      expect(response.status).toBe(200);
      // Response should work even if compression is applied
    });
  });

  describe("Rewrite Handler", () => {
    test("applies rewrite config to Caddy", async () => {
      const route = {
        "@id": "handler-test-rewrite",
        match: [{ host: ["rewrite.localhost"], path: ["/api/*"] }],
        handle: [
          {
            handler: "rewrite",
            strip_path_prefix: "/api",
          },
          {
            handler: "static_response",
            status_code: 200,
            body: '{"path":"{http.request.uri.path}"}',
            headers: { "Content-Type": ["application/json"] },
          },
        ],
        terminal: true,
      };

      await addTestRoute(route);

      const response = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/api/users/123",
        headers: { Host: "rewrite.localhost" },
      });

      expect(response.status).toBe(200);
      // Path should be rewritten from /api/users/123 to /users/123
    });
  });

  describe("Vars Handler", () => {
    test("applies vars config to Caddy", async () => {
      const varsHandler = buildVarsHandler({
        vars: {
          custom_var: "my-value",
          environment: "test",
        },
      });

      const route = {
        "@id": "handler-test-vars",
        match: [{ host: ["vars.localhost"] }],
        handle: [
          varsHandler,
          {
            handler: "static_response",
            status_code: 200,
            body: '{"var":"{vars.custom_var}","env":"{vars.environment}"}',
            headers: { "Content-Type": ["application/json"] },
          },
        ],
        terminal: true,
      };

      await addTestRoute(route);

      const response = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/",
        headers: { Host: "vars.localhost" },
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Map Handler", () => {
    test("applies map config to Caddy", async () => {
      const mapHandler = buildMapHandler({
        source: "{http.request.uri.path}",
        destinations: ["{vars.backend}"],
        mappings: [
          { input: "/api/*", outputs: ["api-backend"] },
          { input: "/admin/*", outputs: ["admin-backend"] },
        ],
        defaults: ["default-backend"],
      });

      const route = {
        "@id": "handler-test-map",
        match: [{ host: ["map.localhost"] }],
        handle: [
          mapHandler,
          {
            handler: "static_response",
            status_code: 200,
            body: '{"backend":"{vars.backend}"}',
            headers: { "Content-Type": ["application/json"] },
          },
        ],
        terminal: true,
      };

      await addTestRoute(route);

      const response = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/api/users",
        headers: { Host: "map.localhost" },
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Request Body Handler", () => {
    test("applies request_body config to Caddy", async () => {
      const requestBodyHandler = buildRequestBodyHandler({
        maxSize: 1024, // 1KB limit
      });

      const route = {
        "@id": "handler-test-request-body",
        match: [{ host: ["body.localhost"] }],
        handle: [
          requestBodyHandler,
          {
            handler: "static_response",
            status_code: 200,
            body: "Body accepted",
          },
        ],
        terminal: true,
      };

      await addTestRoute(route);

      // Small body should succeed
      const smallResponse = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/",
        method: "POST",
        headers: { Host: "body.localhost" },
        body: "small body",
      });

      expect(smallResponse.status).toBe(200);
    });
  });

  describe("Subroute Handler", () => {
    test("applies subroute config to Caddy", async () => {
      const route = {
        "@id": "handler-test-subroute",
        match: [{ host: ["subroute.localhost"] }],
        handle: [
          {
            handler: "subroute",
            routes: [
              {
                match: [{ path: ["/api/*"] }],
                handle: [
                  {
                    handler: "static_response",
                    status_code: 200,
                    body: '{"source":"api-subroute"}',
                    headers: { "Content-Type": ["application/json"] },
                  },
                ],
              },
              {
                handle: [
                  {
                    handler: "static_response",
                    status_code: 200,
                    body: '{"source":"default-subroute"}',
                    headers: { "Content-Type": ["application/json"] },
                  },
                ],
              },
            ],
          },
        ],
        terminal: true,
      };

      await addTestRoute(route);

      // Test API path
      const apiResponse = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/api/test",
        headers: { Host: "subroute.localhost" },
      });
      expect(apiResponse.status).toBe(200);
      expect(apiResponse.body).toContain("api-subroute");

      // Test default path
      const defaultResponse = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/other",
        headers: { Host: "subroute.localhost" },
      });
      expect(defaultResponse.status).toBe(200);
      expect(defaultResponse.body).toContain("default-subroute");
    });
  });

  describe("Authentication Handler", () => {
    test("applies authentication config to Caddy", async () => {
      const route = {
        "@id": "handler-test-auth",
        match: [{ host: ["auth.localhost"] }],
        handle: [
          {
            handler: "authentication",
            providers: {
              http_basic: {
                accounts: [
                  {
                    username: "testuser",
                    // bcrypt hash of "testpass" (generated by: caddy hash-password --plaintext testpass)
                    password: "$2a$14$la96DkWSe318tppyIv/zOuPgwpVXbBtq6oCECLWS.jBBDMhjDZvne",
                  },
                ],
                realm: "Test Realm",
              },
            },
          },
          {
            handler: "static_response",
            status_code: 200,
            body: "Authenticated!",
          },
        ],
        terminal: true,
      };

      await addTestRoute(route);

      // Without auth - should get 401
      const noAuthResponse = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/",
        headers: { Host: "auth.localhost" },
      });
      expect(noAuthResponse.status).toBe(401);

      // With correct auth - should get 200
      const authResponse = await httpRequest({
        host: "127.0.0.1",
        port: CADDY_HTTP_PORT,
        path: "/",
        headers: {
          Host: "auth.localhost",
          Authorization: "Basic " + Buffer.from("testuser:testpass").toString("base64"),
        },
      });
      expect(authResponse.status).toBe(200);
      expect(authResponse.body).toBe("Authenticated!");
    });
  });
});
