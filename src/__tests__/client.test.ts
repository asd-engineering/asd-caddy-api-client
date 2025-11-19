/**
 * Unit tests for CaddyClient
 */
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { CaddyClient } from "../caddy/client.js";
import { CaddyApiError, NetworkError, TimeoutError, CaddyApiClientError } from "../errors.js";
import type { CaddyRoute } from "../types.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

describe("CaddyClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe("constructor", () => {
    test("creates client with default options", () => {
      const client = new CaddyClient();
      expect(client).toBeInstanceOf(CaddyClient);
    });

    test("creates client with custom options", () => {
      const client = new CaddyClient({
        adminUrl: "http://localhost:2020",
        timeout: 10000,
      });
      expect(client).toBeInstanceOf(CaddyClient);
    });

    test("validates options with schema", () => {
      expect(
        () =>
          new CaddyClient({
            adminUrl: "invalid-url",
          })
      ).toThrow();
    });
  });

  describe("getConfig", () => {
    test("fetches full Caddy configuration", async () => {
      const mockConfig = { apps: { http: { servers: {} } } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig,
      } as Response);

      const client = new CaddyClient();
      const config = await client.getConfig();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:2019/config/",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
      expect(config).toEqual(mockConfig);
    });

    test("throws CaddyApiError on API error", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => "Server error",
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => "Server error",
        } as Response);

      const client = new CaddyClient();
      await expect(client.getConfig()).rejects.toThrow(CaddyApiError);
      await expect(client.getConfig()).rejects.toThrow("Caddy API request failed");
    });

    test("throws TimeoutError on timeout", async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 100);
          })
      );

      const client = new CaddyClient({ timeout: 50 });
      await expect(client.getConfig()).rejects.toThrow(TimeoutError);
    });

    test("throws NetworkError on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const client = new CaddyClient();
      await expect(client.getConfig()).rejects.toThrow(NetworkError);
    });
  });

  describe("getRoutes", () => {
    test("fetches routes for a server", async () => {
      const mockRoutes: CaddyRoute[] = [
        {
          match: [{ host: ["example.com"] }],
          handle: [{ handler: "reverse_proxy" }],
          terminal: true,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRoutes,
      } as Response);

      const client = new CaddyClient();
      const routes = await client.getRoutes("https_server");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:2019/config/apps/http/servers/https_server/routes",
        expect.any(Object)
      );
      expect(routes).toEqual(mockRoutes);
    });

    test("throws error when routes response is not an array", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invalid: "response" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invalid: "response" }),
        } as Response);

      const client = new CaddyClient();
      await expect(client.getRoutes("https_server")).rejects.toThrow(CaddyApiClientError);
      await expect(client.getRoutes("https_server")).rejects.toThrow(
        "Invalid routes response from Caddy"
      );
    });
  });

  describe("addRoute", () => {
    test("adds a new route", async () => {
      const route: CaddyRoute = {
        match: [{ host: ["test.com"] }],
        handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
        terminal: true,
      };

      // Mock getRoutes to return empty array (no existing routes)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      // Mock POST route
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      const result = await client.addRoute("https_server", route);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "http://127.0.0.1:2019/config/apps/http/servers/https_server/routes",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(route),
        })
      );
    });

    test("skips adding duplicate route", async () => {
      const route: CaddyRoute = {
        match: [{ host: ["test.com"] }],
        handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
        terminal: true,
      };

      // Mock getRoutes to return existing route
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [route],
      } as Response);

      const client = new CaddyClient();
      const result = await client.addRoute("https_server", route);

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only GET, no POST
    });

    test("adds route when getRoutes fails", async () => {
      const route: CaddyRoute = {
        match: [{ host: ["test.com"] }],
        handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
        terminal: true,
      };

      // Mock getRoutes to fail
      mockFetch.mockRejectedValueOnce(new Error("Server not found"));

      // Mock POST route
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      const result = await client.addRoute("https_server", route);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("removeRoutesByHost", () => {
    test("removes all routes matching host", async () => {
      const mockRoutes: CaddyRoute[] = [
        {
          match: [{ host: ["example.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
          terminal: true,
        },
        {
          match: [{ host: ["test.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:4000" }] }],
          terminal: true,
        },
        {
          match: [{ host: ["example.com"] }],
          handle: [{ handler: "static_response", status_code: 200 }],
          terminal: true,
        },
      ];

      // Mock getRoutes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRoutes,
      } as Response);

      // Mock PATCH routes (update with filtered list)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      const count = await client.removeRoutesByHost("example.com", "https_server");

      expect(count).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2); // 1 GET + 1 PATCH
    });

    test("returns 0 when no matching routes found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      const client = new CaddyClient();
      const count = await client.removeRoutesByHost("example.com", "https_server");

      expect(count).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only GET
    });
  });

  describe("patchRoutes", () => {
    test("replaces all routes for a server", async () => {
      const routes: CaddyRoute[] = [
        {
          match: [{ host: ["example.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
          terminal: true,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      await client.patchRoutes("https_server", routes);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:2019/config/apps/http/servers/https_server/routes",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(routes),
        })
      );
    });
  });

  describe("routeExists", () => {
    test("identifies duplicate routes by host match", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          match: [{ host: ["example.com"] }],
          handle: [{ handler: "reverse_proxy" }],
          terminal: true,
        },
      ];

      const newRoute: CaddyRoute = {
        match: [{ host: ["example.com"] }],
        handle: [{ handler: "static_response" }],
        terminal: false,
      };

      const client = new CaddyClient();
      const exists = (
        client as unknown as { routeExists: typeof CaddyClient.prototype.routeExists }
      ).routeExists(existingRoutes, newRoute.match![0]);

      expect(exists).toBe(true);
    });

    test("returns false for non-duplicate routes", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          match: [{ host: ["example.com"] }],
          handle: [{ handler: "reverse_proxy" }],
          terminal: true,
        },
      ];

      const newRoute: CaddyRoute = {
        match: [{ host: ["different.com"] }],
        handle: [{ handler: "reverse_proxy" }],
        terminal: true,
      };

      const client = new CaddyClient();
      const exists = (
        client as unknown as { routeExists: typeof CaddyClient.prototype.routeExists }
      ).routeExists(existingRoutes, newRoute.match![0]);

      expect(exists).toBe(false);
    });
  });

  describe("request timeout handling", () => {
    test("respects custom timeout", async () => {
      // Mock AbortController to trigger timeout
      const mockAbort = vi.fn();
      const originalAbortController = global.AbortController;

      global.AbortController = vi.fn().mockImplementation(() => ({
        signal: {},
        abort: mockAbort,
      })) as unknown as typeof AbortController;

      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 10);
          })
      );

      const client = new CaddyClient({ timeout: 50 });
      await expect(client.getConfig()).rejects.toThrow(TimeoutError);

      global.AbortController = originalAbortController;
    });

    test("clears timeout on successful request", async () => {
      const mockConfig = { test: "data" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig,
      } as Response);

      const client = new CaddyClient({ timeout: 5000 });
      const config = await client.getConfig();

      expect(config).toEqual(mockConfig);
    });
  });

  describe("error response handling", () => {
    test("handles empty error response body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: vi.fn().mockRejectedValue(new Error("Cannot read body")),
      } as unknown as Response);

      const client = new CaddyClient();
      await expect(client.getConfig()).rejects.toThrow(CaddyApiError);
    });

    test("preserves original CaddyApiError", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Resource not found",
      } as Response);

      const client = new CaddyClient();

      try {
        await client.getConfig();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CaddyApiError);
        expect((error as CaddyApiError).statusCode).toBe(404);
        expect((error as CaddyApiError).responseBody).toBe("Resource not found");
      }
    });
  });

  describe("insertRoute", () => {
    const mockRoute: CaddyRoute = {
      "@id": "test-route",
      match: [{ host: ["test.com"] }],
      handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
      terminal: true,
    };

    test("inserts route at beginning", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          "@id": "route1",
          match: [{ host: ["existing.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:4000" }] }],
          terminal: true,
        },
      ];

      const serverConfig = {
        listen: [":443"],
        routes: existingRoutes,
      };

      // Mock getRoutes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      // Mock getServerConfig
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverConfig,
      } as Response);

      // Mock patchServer
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      await client.insertRoute("https_server", mockRoute, "beginning");

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        "http://127.0.0.1:2019/config/apps/http/servers",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("test-route"),
        })
      );

      // Verify route was inserted at beginning (index 0)
      const patchCall = mockFetch.mock.calls[2][1];
      const patchedConfig = JSON.parse(patchCall?.body as string);
      expect(patchedConfig.https_server.routes[0]["@id"]).toBe("test-route");
    });

    test("inserts route at end", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          "@id": "route1",
          match: [{ host: ["existing.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:4000" }] }],
          terminal: true,
        },
      ];

      const serverConfig = { listen: [":443"], routes: existingRoutes };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverConfig,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      await client.insertRoute("https_server", mockRoute, "end");

      const patchCall = mockFetch.mock.calls[2][1];
      const patchedConfig = JSON.parse(patchCall?.body as string);
      expect(patchedConfig.https_server.routes[1]["@id"]).toBe("test-route");
    });

    test("inserts route after health checks", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          "@id": "healthcheck",
          match: [{ path: ["/health"] }],
          handle: [{ handler: "static_response", status_code: 200 }],
          terminal: true,
        },
        {
          "@id": "route1",
          match: [{ host: ["existing.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:4000" }] }],
          terminal: true,
        },
      ];

      const serverConfig = { listen: [":443"], routes: existingRoutes };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverConfig,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      await client.insertRoute("https_server", mockRoute, "after-health-checks");

      const patchCall = mockFetch.mock.calls[2][1];
      const patchedConfig = JSON.parse(patchCall?.body as string);
      // Should be inserted after health check (index 1)
      expect(patchedConfig.https_server.routes[1]["@id"]).toBe("test-route");
    });

    test("defaults to after-health-checks position", async () => {
      const existingRoutes: CaddyRoute[] = [];

      const serverConfig = { listen: [":443"], routes: existingRoutes };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverConfig,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      await client.insertRoute("https_server", mockRoute);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test("validates route before inserting", async () => {
      const invalidRoute = {
        handle: [],
      } as CaddyRoute;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      const client = new CaddyClient();
      await expect(client.insertRoute("https_server", invalidRoute)).rejects.toThrow();
    });
  });

  describe("replaceRouteById", () => {
    const newRoute: CaddyRoute = {
      match: [{ host: ["updated.com"] }],
      handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:5000" }] }],
      terminal: true,
    };

    test("replaces existing route by id", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          "@id": "route1",
          match: [{ host: ["old.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
          terminal: true,
        },
        {
          "@id": "route2",
          match: [{ host: ["another.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:4000" }] }],
          terminal: true,
        },
      ];

      const serverConfig = { listen: [":443"], routes: existingRoutes };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverConfig,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      const result = await client.replaceRouteById("https_server", "route1", newRoute);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const patchCall = mockFetch.mock.calls[2][1];
      const patchedConfig = JSON.parse(patchCall?.body as string);
      expect(patchedConfig.https_server.routes[0]["@id"]).toBe("route1");
      expect(patchedConfig.https_server.routes[0].match[0].host[0]).toBe("updated.com");
    });

    test("preserves @id when replacing route", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          "@id": "preserve-me",
          match: [{ host: ["old.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
          terminal: true,
        },
      ];

      const serverConfig = { listen: [":443"], routes: existingRoutes };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverConfig,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      await client.replaceRouteById("https_server", "preserve-me", newRoute);

      const patchCall = mockFetch.mock.calls[2][1];
      const patchedConfig = JSON.parse(patchCall?.body as string);
      expect(patchedConfig.https_server.routes[0]["@id"]).toBe("preserve-me");
    });

    test("returns false when route id not found", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          "@id": "route1",
          match: [{ host: ["existing.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
          terminal: true,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      const client = new CaddyClient();
      const result = await client.replaceRouteById("https_server", "non-existent", newRoute);

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only GET, no PATCH
    });

    test("validates route before replacing", async () => {
      const invalidRoute = {
        handle: [],
      } as CaddyRoute;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            "@id": "route1",
            match: [{ host: ["test.com"] }],
            handle: [{ handler: "reverse_proxy" }],
            terminal: true,
          },
        ],
      } as Response);

      const client = new CaddyClient();
      await expect(
        client.replaceRouteById("https_server", "route1", invalidRoute)
      ).rejects.toThrow();
    });
  });

  describe("removeRouteById", () => {
    test("removes route by id", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          "@id": "route1",
          match: [{ host: ["keep.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
          terminal: true,
        },
        {
          "@id": "route2",
          match: [{ host: ["remove.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:4000" }] }],
          terminal: true,
        },
        {
          "@id": "route3",
          match: [{ host: ["keep-also.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:5000" }] }],
          terminal: true,
        },
      ];

      const serverConfig = { listen: [":443"], routes: existingRoutes };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverConfig,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      const result = await client.removeRouteById("https_server", "route2");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const patchCall = mockFetch.mock.calls[2][1];
      const patchedConfig = JSON.parse(patchCall?.body as string);
      expect(patchedConfig.https_server.routes).toHaveLength(2);
      expect(
        patchedConfig.https_server.routes.find((r: CaddyRoute) => r["@id"] === "route2")
      ).toBeUndefined();
    });

    test("returns false when route id not found", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          "@id": "route1",
          match: [{ host: ["existing.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
          terminal: true,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      const client = new CaddyClient();
      const result = await client.removeRouteById("https_server", "non-existent");

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only GET, no PATCH
    });

    test("removes multiple routes with same id", async () => {
      const existingRoutes: CaddyRoute[] = [
        {
          "@id": "route1",
          match: [{ host: ["test.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:3000" }] }],
          terminal: true,
        },
        {
          "@id": "duplicate",
          match: [{ host: ["dup1.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:4000" }] }],
          terminal: true,
        },
        {
          "@id": "duplicate",
          match: [{ host: ["dup2.com"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:5000" }] }],
          terminal: true,
        },
      ];

      const serverConfig = { listen: [":443"], routes: existingRoutes };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingRoutes,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => serverConfig,
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      const result = await client.removeRouteById("https_server", "duplicate");

      expect(result).toBe(true);
      const patchCall = mockFetch.mock.calls[2][1];
      const patchedConfig = JSON.parse(patchCall?.body as string);
      expect(patchedConfig.https_server.routes).toHaveLength(1);
      expect(patchedConfig.https_server.routes[0]["@id"]).toBe("route1");
    });
  });
});
