/**
 * Tests for MitmproxyManager
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  MitmproxyManager,
  type MitmproxyInstance,
  type ServiceRegistration,
} from "../mitm/manager.js";
import type { CaddyClient } from "../caddy/client.js";

// Mock CaddyClient
function createMockCaddyClient(): CaddyClient {
  return {
    addRoute: vi.fn().mockResolvedValue(undefined),
    removeRouteById: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockResolvedValue({}),
    getServers: vi.fn().mockResolvedValue({}),
    patchServer: vi.fn().mockResolvedValue(undefined),
  } as unknown as CaddyClient;
}

describe("MitmproxyManager", () => {
  let mockClient: CaddyClient;
  const defaultProxies: Record<string, MitmproxyInstance> = {
    default: { host: "mitmproxy", port: 8080, webPort: 8081 },
    debug: { host: "mitmproxy-debug", port: 8082, webPort: 8083 },
  };

  beforeEach(() => {
    mockClient = createMockCaddyClient();
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    test("creates manager with valid proxies", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      expect(manager).toBeInstanceOf(MitmproxyManager);
    });

    test("throws error with empty proxies", () => {
      expect(() => new MitmproxyManager(mockClient, {})).toThrow(
        "At least one MITMproxy instance must be configured"
      );
    });

    test("uses first proxy as default when no default key", () => {
      const proxies = {
        primary: { host: "proxy1", port: 8080 },
        secondary: { host: "proxy2", port: 8082 },
      };
      const manager = new MitmproxyManager(mockClient, proxies);
      expect(manager.getAvailableProxies()).toContain("default");
    });

    test("preserves explicit default proxy", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      const config = manager.getProxyConfig("default");
      expect(config?.host).toBe("mitmproxy");
      expect(config?.port).toBe(8080);
    });
  });

  describe("register", () => {
    test("registers a service with path-based routing", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      const service: ServiceRegistration = {
        id: "elasticsearch",
        serverId: "srv0",
        pathPrefix: "/es",
        backend: { host: "elasticsearch", port: 9200 },
      };

      manager.register(service);

      expect(manager.getRegisteredServices()).toContain("elasticsearch");
    });

    test("registers a service with host-based routing", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      const service: ServiceRegistration = {
        id: "api",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "api-service", port: 8080 },
        host: "api.example.com",
      };

      manager.register(service);

      const status = manager.getServiceStatus("api");
      expect(status?.service.host).toBe("api.example.com");
    });

    test("overwrites existing service with same id", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);

      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/v1",
        backend: { host: "host1", port: 8080 },
      });

      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/v2",
        backend: { host: "host2", port: 9090 },
      });

      const status = manager.getServiceStatus("service1");
      expect(status?.service.pathPrefix).toBe("/v2");
      expect(status?.service.backend.host).toBe("host2");
    });
  });

  describe("unregister", () => {
    test("removes registered service", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/test",
        backend: { host: "localhost", port: 8080 },
      });

      expect(manager.unregister("service1")).toBe(true);
      expect(manager.getRegisteredServices()).not.toContain("service1");
    });

    test("returns false for non-existent service", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      expect(manager.unregister("nonexistent")).toBe(false);
    });
  });

  describe("enable", () => {
    test("enables interception for registered service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "elasticsearch",
        serverId: "srv0",
        pathPrefix: "/es",
        backend: { host: "elasticsearch", port: 9200 },
      });

      await manager.enable("elasticsearch");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.removeRouteById).toHaveBeenCalledWith("srv0", "mitm_elasticsearch");
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.addRoute).toHaveBeenCalledWith(
        "srv0",
        expect.objectContaining({
          "@id": "mitm_elasticsearch",
          terminal: true,
        })
      );
      expect(manager.isEnabled("elasticsearch")).toBe(true);
    });

    test("enables with specific proxy", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "backend", port: 8080 },
      });

      await manager.enable("service1", { proxy: "debug" });

      const status = manager.getServiceStatus("service1");
      expect(status?.proxy).toBe("debug");
    });

    test("throws error for unregistered service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);

      await expect(manager.enable("unknown")).rejects.toThrow("Service not registered: unknown");
    });

    test("throws error for unknown proxy", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "backend", port: 8080 },
      });

      await expect(manager.enable("service1", { proxy: "nonexistent" })).rejects.toThrow(
        "Unknown proxy: nonexistent"
      );
    });

    test("handles removeRouteById failure gracefully", async () => {
      const mockClientWithError = createMockCaddyClient();
      (mockClientWithError.removeRouteById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Route not found")
      );

      const manager = new MitmproxyManager(mockClientWithError, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "backend", port: 8080 },
      });

      // Should not throw, as the error is caught
      await expect(manager.enable("service1")).resolves.toBeUndefined();
    });

    test("builds correct route for host-based service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "api",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "api-service", port: 8080 },
        host: "api.example.com",
      });

      await manager.enable("api");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.addRoute).toHaveBeenCalledWith(
        "srv0",
        expect.objectContaining({
          match: [{ host: ["api.example.com"] }],
        })
      );
    });

    test("builds correct route for path-based service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "backend", port: 8080 },
      });

      await manager.enable("service1");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.addRoute).toHaveBeenCalledWith(
        "srv0",
        expect.objectContaining({
          match: [{ path: ["/api/*"] }],
        })
      );
    });
  });

  describe("disable", () => {
    test("disables interception for registered service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "elasticsearch",
        serverId: "srv0",
        pathPrefix: "/es",
        backend: { host: "elasticsearch", port: 9200 },
      });

      await manager.enable("elasticsearch");
      await manager.disable("elasticsearch");

      expect(manager.isEnabled("elasticsearch")).toBe(false);
      const status = manager.getServiceStatus("elasticsearch");
      expect(status?.proxy).toBeNull();
    });

    test("throws error for unregistered service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);

      await expect(manager.disable("unknown")).rejects.toThrow("Service not registered: unknown");
    });

    test("builds direct route for path-based service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "backend", port: 8080 },
      });

      await manager.disable("service1");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.addRoute).toHaveBeenCalledWith(
        "srv0",
        expect.objectContaining({
          match: [{ path: ["/api/*"] }],
          handle: expect.arrayContaining([
            expect.objectContaining({ handler: "rewrite" }),
            expect.objectContaining({ handler: "reverse_proxy" }),
          ]),
        })
      );
    });

    test("builds direct route for host-based service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "api",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "api-service", port: 8080 },
        host: "api.example.com",
      });

      await manager.disable("api");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.addRoute).toHaveBeenCalledWith(
        "srv0",
        expect.objectContaining({
          match: [{ host: ["api.example.com"] }],
        })
      );
    });

    test("handles removeRouteById failure gracefully", async () => {
      const mockClientWithError = createMockCaddyClient();
      (mockClientWithError.removeRouteById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Route not found")
      );

      const manager = new MitmproxyManager(mockClientWithError, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "backend", port: 8080 },
      });

      // Should not throw
      await expect(manager.disable("service1")).resolves.toBeUndefined();
    });
  });

  describe("enableAll", () => {
    test("enables all registered services", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api1",
        backend: { host: "backend1", port: 8080 },
      });
      manager.register({
        id: "service2",
        serverId: "srv0",
        pathPrefix: "/api2",
        backend: { host: "backend2", port: 8081 },
      });

      await manager.enableAll();

      expect(manager.isEnabled("service1")).toBe(true);
      expect(manager.isEnabled("service2")).toBe(true);
    });

    test("enables all with specific proxy", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api1",
        backend: { host: "backend1", port: 8080 },
      });

      await manager.enableAll({ proxy: "debug" });

      const status = manager.getServiceStatus("service1");
      expect(status?.proxy).toBe("debug");
    });
  });

  describe("disableAll", () => {
    test("disables all registered services", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api1",
        backend: { host: "backend1", port: 8080 },
      });
      manager.register({
        id: "service2",
        serverId: "srv0",
        pathPrefix: "/api2",
        backend: { host: "backend2", port: 8081 },
      });

      await manager.enableAll();
      await manager.disableAll();

      expect(manager.isEnabled("service1")).toBe(false);
      expect(manager.isEnabled("service2")).toBe(false);
    });
  });

  describe("isEnabled", () => {
    test("returns false for unregistered service", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      expect(manager.isEnabled("unknown")).toBe(false);
    });

    test("returns false for disabled service", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "backend", port: 8080 },
      });

      expect(manager.isEnabled("service1")).toBe(false);
    });

    test("returns true for enabled service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "backend", port: 8080 },
      });

      await manager.enable("service1");
      expect(manager.isEnabled("service1")).toBe(true);
    });
  });

  describe("getStatus", () => {
    test("returns empty object when no services registered", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      expect(manager.getStatus()).toEqual({});
    });

    test("returns status for all registered services", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api1",
        backend: { host: "backend1", port: 8080 },
      });
      manager.register({
        id: "service2",
        serverId: "srv0",
        pathPrefix: "/api2",
        backend: { host: "backend2", port: 8081 },
      });

      await manager.enable("service1");

      const status = manager.getStatus();
      expect(status.service1.enabled).toBe(true);
      expect(status.service1.proxy).toBe("default");
      expect(status.service2.enabled).toBe(false);
      expect(status.service2.proxy).toBeNull();
    });
  });

  describe("getServiceStatus", () => {
    test("returns undefined for unregistered service", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      expect(manager.getServiceStatus("unknown")).toBeUndefined();
    });

    test("returns status for registered service", async () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api",
        backend: { host: "backend", port: 8080 },
      });

      await manager.enable("service1", { proxy: "debug" });

      const status = manager.getServiceStatus("service1");
      expect(status).toBeDefined();
      expect(status?.enabled).toBe(true);
      expect(status?.proxy).toBe("debug");
      expect(status?.service.id).toBe("service1");
    });
  });

  describe("getRegisteredServices", () => {
    test("returns empty array when no services registered", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      expect(manager.getRegisteredServices()).toEqual([]);
    });

    test("returns all registered service ids", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      manager.register({
        id: "service1",
        serverId: "srv0",
        pathPrefix: "/api1",
        backend: { host: "backend1", port: 8080 },
      });
      manager.register({
        id: "service2",
        serverId: "srv0",
        pathPrefix: "/api2",
        backend: { host: "backend2", port: 8081 },
      });

      const services = manager.getRegisteredServices();
      expect(services).toContain("service1");
      expect(services).toContain("service2");
      expect(services).toHaveLength(2);
    });
  });

  describe("getAvailableProxies", () => {
    test("returns all proxy names", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      const proxies = manager.getAvailableProxies();

      expect(proxies).toContain("default");
      expect(proxies).toContain("debug");
    });
  });

  describe("getProxyConfig", () => {
    test("returns undefined for unknown proxy", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      expect(manager.getProxyConfig("unknown")).toBeUndefined();
    });

    test("returns config for known proxy", () => {
      const manager = new MitmproxyManager(mockClient, defaultProxies);
      const config = manager.getProxyConfig("debug");

      expect(config?.host).toBe("mitmproxy-debug");
      expect(config?.port).toBe(8082);
      expect(config?.webPort).toBe(8083);
    });
  });
});
