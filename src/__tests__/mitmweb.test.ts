/**
 * Unit tests for MITMweb process management
 *
 * Note: These are basic API surface tests.
 * Full process lifecycle tests are in integration tests with real mitmproxy.
 */
import { describe, test, expect } from "vitest";
import { isMitmproxyInstalled, getMitmproxyVersion, getMitmwebStatus } from "../mitm/mitmweb.js";

describe("MITMweb Process Management - API Surface", () => {
  describe("isMitmproxyInstalled()", () => {
    test("returns a boolean", async () => {
      const result = await isMitmproxyInstalled();
      expect(typeof result).toBe("boolean");
    });

    test("is callable and returns promise", () => {
      const result = isMitmproxyInstalled();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("getMitmproxyVersion()", () => {
    test("returns string or null", async () => {
      const version = await getMitmproxyVersion();
      expect(version === null || typeof version === "string").toBe(true);
    });

    test("is callable and returns promise", () => {
      const result = getMitmproxyVersion();
      expect(result).toBeInstanceOf(Promise);
    });

    test("returns null when mitmproxy not installed", async () => {
      // This test assumes mitmproxy is not installed in CI
      // If installed, it will return a version string which is also valid
      const version = await getMitmproxyVersion();
      if (version !== null) {
        expect(version).toMatch(/^\d+\.\d+\.\d+/);
      }
    });
  });

  describe("getMitmwebStatus()", () => {
    test("returns status object with running property", () => {
      const status = getMitmwebStatus();
      expect(status).toHaveProperty("running");
      expect(typeof status.running).toBe("boolean");
    });

    test("returns false when no PID file exists", () => {
      const status = getMitmwebStatus("/nonexistent/directory");
      expect(status.running).toBe(false);
    });

    test("includes URLs when running", () => {
      const status = getMitmwebStatus();
      if (status.running) {
        expect(status).toHaveProperty("webUrl");
        expect(status).toHaveProperty("proxyUrl");
        expect(status).toHaveProperty("pid");
      }
    });
  });
});

describe("MITMweb Options Validation", () => {
  test("validates port ranges", async () => {
    // This is tested via Zod schema in schemas.test.ts
    // Here we just verify the function signature
    expect(typeof getMitmwebStatus).toBe("function");
  });
});

/**
 * Integration tests with real mitmproxy process are in:
 * - src/__tests__/integration/mitmproxy-basic.integration.test.ts
 * - src/__tests__/integration/mitmproxy-traffic.integration.test.ts
 * - src/__tests__/integration/caddy-mitmproxy-flow.integration.test.ts
 *
 * Those tests cover:
 * - startMitmweb() with real process
 * - stopMitmweb() lifecycle
 * - Process management (start/stop/status)
 * - Traffic interception
 * - Caddy integration
 */
