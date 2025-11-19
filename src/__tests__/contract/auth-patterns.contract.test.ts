/**
 * [CONTRACT] Authentication Patterns
 *
 * This test suite defines the contract for HTTP Basic Authentication behavior.
 * These tests specify how authentication must work across different patterns.
 *
 * Authentication patterns tested:
 * - Domain-level auth (entire domain protected)
 * - Path-level auth (specific paths protected)
 * - Multiple accounts per service
 * - Service isolation (credentials scoped per service)
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../caddy/client";
import { createHealthRoute, createBasicAuthRoute, createServiceRoute } from "../../caddy/helpers";
import { sortRoutes } from "../../caddy/ordering";
import { callService, callHealth } from "../helpers/http";
import { expectAuthRequired, expectAuthSuccess, expectServiceHeaders } from "../helpers/assertions";
import { TEST_CREDENTIALS } from "../helpers/fixtures";

describe("[CONTRACT] Authentication Patterns", () => {
  let client: CaddyClient;
  const SERVER = "test-auth-contract";
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

  describe("Domain-level authentication", () => {
    test.skipIf(!process.env.INTEGRATION_TEST)(
      "entire domain requires authentication",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            id: "admin-domain",
            host: "admin.localhost",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test:5678",
            realm: "Admin Area",
            serviceId: "admin-backend",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        // No auth = 401
        const noAuth = await callService({
          host: "admin.localhost",
          path: "/",
          port: PORT,
        });
        expectAuthRequired(noAuth, "Admin Area");

        // Wrong password = 401
        const wrongAuth = await callService({
          host: "admin.localhost",
          path: "/",
          port: PORT,
          auth: { username: "admin", password: "wrong-password" },
        });
        expectAuthRequired(wrongAuth);

        // Correct auth = 200
        const correctAuth = await callService({
          host: "admin.localhost",
          path: "/",
          port: PORT,
          auth: TEST_CREDENTIALS.admin,
        });
        expectAuthSuccess(correctAuth);
        expectServiceHeaders(correctAuth, { serviceId: "admin-backend" });
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "all paths on authenticated domain require credentials",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            host: "admin.localhost",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test:5678",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        const paths = ["/", "/dashboard", "/settings", "/api/users"];

        for (const path of paths) {
          // No auth = 401
          const noAuth = await callService({
            host: "admin.localhost",
            path,
            port: PORT,
          });
          expect(noAuth.statusCode).toBe(401);

          // With auth = 200
          const withAuth = await callService({
            host: "admin.localhost",
            path,
            port: PORT,
            auth: TEST_CREDENTIALS.admin,
          });
          expect(withAuth.statusCode).toBe(200);
        }
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "credentials are scoped to specific service",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            id: "admin-service",
            host: "admin.localhost",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test:5678",
            serviceId: "admin-backend",
          }),
          createBasicAuthRoute({
            id: "api-service",
            host: "api.localhost",
            accounts: [TEST_CREDENTIALS.apiUser],
            upstream: "echo-test-2:5679",
            serviceId: "api-backend",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        // Admin creds don't work on API service
        const adminOnApi = await callService({
          host: "api.localhost",
          path: "/",
          port: PORT,
          auth: TEST_CREDENTIALS.admin,
        });
        expectAuthRequired(adminOnApi);

        // API creds don't work on admin service
        const apiOnAdmin = await callService({
          host: "admin.localhost",
          path: "/",
          port: PORT,
          auth: TEST_CREDENTIALS.apiUser,
        });
        expectAuthRequired(apiOnAdmin);

        // Each service accepts its own credentials
        const adminOnAdmin = await callService({
          host: "admin.localhost",
          path: "/",
          port: PORT,
          auth: TEST_CREDENTIALS.admin,
        });
        expectAuthSuccess(adminOnAdmin);

        const apiOnApi = await callService({
          host: "api.localhost",
          path: "/",
          port: PORT,
          auth: TEST_CREDENTIALS.apiUser,
        });
        expectAuthSuccess(apiOnApi);
      }
    );
  });

  describe("Path-level authentication", () => {
    test.skipIf(!process.env.INTEGRATION_TEST)(
      "specific paths require authentication, others are public",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            id: "admin-path",
            host: "api.localhost",
            path: "/admin/*",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test-2:5679",
            serviceId: "api-admin",
          }),
          createServiceRoute({
            id: "api-public",
            host: "api.localhost",
            path: "/*",
            upstream: "echo-test:5678",
            serviceId: "api-public",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        // Public path = no auth required
        const publicResponse = await callService({
          host: "api.localhost",
          path: "/users",
          port: PORT,
        });
        expect(publicResponse.statusCode).toBe(200);
        expectServiceHeaders(publicResponse, { serviceId: "api-public" });

        // Admin path without auth = 401
        const adminNoAuth = await callService({
          host: "api.localhost",
          path: "/admin/settings",
          port: PORT,
        });
        expectAuthRequired(adminNoAuth);

        // Admin path with auth = 200
        const adminWithAuth = await callService({
          host: "api.localhost",
          path: "/admin/settings",
          port: PORT,
          auth: TEST_CREDENTIALS.admin,
        });
        expectAuthSuccess(adminWithAuth);
        expectServiceHeaders(adminWithAuth, { serviceId: "api-admin" });
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "path-level auth takes precedence over public catch-all",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            host: "app.localhost",
            path: "/private/*",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test-2:5679",
          }),
          createServiceRoute({
            id: "public",
            host: "app.localhost",
            upstream: "echo-test:5678",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        // /private/* requires auth even though /* catch-all exists
        const privateNoAuth = await callService({
          host: "app.localhost",
          path: "/private/data",
          port: PORT,
        });
        expectAuthRequired(privateNoAuth);

        // Other paths are public
        const publicPath = await callService({
          host: "app.localhost",
          path: "/public/data",
          port: PORT,
        });
        expect(publicPath.statusCode).toBe(200);
      }
    );
  });

  describe("Multiple accounts per service", () => {
    test.skipIf(!process.env.INTEGRATION_TEST)("any valid account grants access", async () => {
      const routes = sortRoutes([
        createHealthRoute({ instanceId: "auth-test" }),
        createBasicAuthRoute({
          id: "shared-service",
          host: "shared.localhost",
          accounts: [TEST_CREDENTIALS.admin, TEST_CREDENTIALS.superadmin],
          upstream: "echo-test:5678",
          serviceId: "shared-backend",
        }),
      ]);

      await client.patchServer({
        [SERVER]: {
          listen: [`:${PORT}`],
          routes,
        },
      });

      // Admin creds work
      const adminResponse = await callService({
        host: "shared.localhost",
        path: "/",
        port: PORT,
        auth: TEST_CREDENTIALS.admin,
      });
      expectAuthSuccess(adminResponse);
      expectServiceHeaders(adminResponse, { serviceId: "shared-backend" });

      // Superadmin creds work
      const superadminResponse = await callService({
        host: "shared.localhost",
        path: "/",
        port: PORT,
        auth: TEST_CREDENTIALS.superadmin,
      });
      expectAuthSuccess(superadminResponse);
      expectServiceHeaders(superadminResponse, { serviceId: "shared-backend" });

      // Wrong creds don't work
      const wrongCreds = await callService({
        host: "shared.localhost",
        path: "/",
        port: PORT,
        auth: TEST_CREDENTIALS.apiUser,
      });
      expectAuthRequired(wrongCreds);
    });

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "different accounts can access same service",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            host: "team.localhost",
            accounts: [
              { username: "alice", password: TEST_CREDENTIALS.admin.hash },
              { username: "bob", password: TEST_CREDENTIALS.admin.hash },
              { username: "charlie", password: TEST_CREDENTIALS.admin.hash },
            ],
            upstream: "echo-test:5678",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        const users = ["alice", "bob", "charlie"];

        for (const username of users) {
          const response = await callService({
            host: "team.localhost",
            path: "/",
            port: PORT,
            auth: { username, password: TEST_CREDENTIALS.admin.password },
          });
          expectAuthSuccess(response);
        }
      }
    );
  });

  describe("WWW-Authenticate header contract", () => {
    test.skipIf(!process.env.INTEGRATION_TEST)(
      "401 response includes WWW-Authenticate header with realm",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            host: "auth.localhost",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test:5678",
            realm: "Test Realm",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        const response = await callService({
          host: "auth.localhost",
          path: "/",
          port: PORT,
        });

        expect(response.statusCode).toBe(401);
        expect(response.headers["www-authenticate"]).toBeDefined();
        expect(response.headers["www-authenticate"]).toContain('Basic realm="Test Realm"');
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "default realm is used when not specified",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            host: "auth.localhost",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test:5678",
            // No realm specified
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        const response = await callService({
          host: "auth.localhost",
          path: "/",
          port: PORT,
        });

        expect(response.statusCode).toBe(401);
        expect(response.headers["www-authenticate"]).toContain('realm="Protected Area"');
      }
    );
  });

  describe("Auth type headers contract", () => {
    test.skipIf(!process.env.INTEGRATION_TEST)(
      "domain-level auth includes X-ASD-Auth-Type: domain-level",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            host: "domain-auth.localhost",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test:5678",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        const response = await callService({
          host: "domain-auth.localhost",
          path: "/",
          port: PORT,
          auth: TEST_CREDENTIALS.admin,
        });

        expect(response.headers["x-asd-auth-type"]).toBe("domain-level");
      }
    );

    test.skipIf(!process.env.INTEGRATION_TEST)(
      "path-level auth includes X-ASD-Auth-Type: path-level",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            host: "path-auth.localhost",
            path: "/admin/*",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test:5678",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        const response = await callService({
          host: "path-auth.localhost",
          path: "/admin/settings",
          port: PORT,
          auth: TEST_CREDENTIALS.admin,
        });

        expect(response.headers["x-asd-auth-type"]).toBe("path-level");
      }
    );
  });

  describe("Health endpoint bypass contract", () => {
    test.skipIf(!process.env.INTEGRATION_TEST)(
      "health endpoint is accessible without auth even on authenticated domains",
      async () => {
        const routes = sortRoutes([
          createHealthRoute({ instanceId: "auth-test" }),
          createBasicAuthRoute({
            host: "auth.localhost",
            accounts: [TEST_CREDENTIALS.admin],
            upstream: "echo-test:5678",
          }),
        ]);

        await client.patchServer({
          [SERVER]: {
            listen: [`:${PORT}`],
            routes,
          },
        });

        // Health endpoint should work without auth
        const healthResponse = await callHealth("auth.localhost", PORT);
        expect(healthResponse.statusCode).toBe(200);
        expect(healthResponse.headers["x-asd-health"]).toBe("ok");

        // But other paths require auth
        const otherPath = await callService({
          host: "auth.localhost",
          path: "/dashboard",
          port: PORT,
        });
        expectAuthRequired(otherPath);
      }
    );
  });
});
