/**
 * Unit tests for domain management functions
 * Note: Domain management is an internal module, so we mock the underlying client
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { CaddyClient } from "../caddy/client.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

describe("Domain Management via CaddyClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("patchServer", () => {
    test("updates server configuration for domain", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      const serverConfig = {
        "example.com": {
          listen: [":443"],
          routes: [
            {
              handle: [
                {
                  handler: "reverse_proxy",
                  upstreams: [{ dial: "127.0.0.1:3000" }],
                },
              ],
            },
          ],
        },
      };

      await client.patchServer(serverConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:2019/config/apps/http/servers",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(serverConfig),
        })
      );
    });

    test("adds domain with TLS configuration", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      const tlsConfig = {
        "secure.example.com": {
          listen: [":443"],
          automatic_https: {
            disable: false,
          },
          routes: [
            {
              handle: [
                {
                  handler: "reverse_proxy",
                  upstreams: [{ dial: "127.0.0.1:3000" }],
                },
              ],
            },
          ],
        },
      };

      await client.patchServer(tlsConfig);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("getServers", () => {
    test("retrieves all server configurations", async () => {
      const mockServers = {
        "example.com": {
          listen: [":443"],
        },
        "test.com": {
          listen: [":443"],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockServers,
      } as Response);

      const client = new CaddyClient();
      const servers = await client.getServers();

      expect(servers).toEqual(mockServers);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:2019/config/apps/http/servers",
        expect.any(Object)
      );
    });
  });

  describe("reload", () => {
    test("reloads Caddy configuration", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const client = new CaddyClient();
      await client.reload();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:2019/load",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
  });

  describe("getVersion", () => {
    test("retrieves Caddy version information", async () => {
      const mockVersion = { version: "v2.7.6" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVersion,
      } as Response);

      const client = new CaddyClient();
      const version = await client.getVersion();

      expect(version).toEqual(mockVersion);
      expect(mockFetch).toHaveBeenCalledWith("http://127.0.0.1:2019/", expect.any(Object));
    });
  });
});
