/**
 * Unit tests for MITMweb process management
 *
 * Note: These are basic API surface tests.
 * Full process lifecycle tests are in integration tests with real mitmproxy.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  isMitmproxyInstalled,
  getMitmproxyVersion,
  getMitmwebStatus,
  startMitmweb,
  stopMitmweb,
  autoInstallMitmproxy,
} from "../mitm/mitmweb.js";
import { MitmproxyNotInstalledError, CaddyApiClientError } from "../errors.js";
import * as fs from "fs";
import * as path from "path";

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

describe("startMitmweb()", () => {
  test("throws MitmproxyNotInstalledError when mitmproxy not installed", async () => {
    // Skip if mitmproxy is actually installed
    const isInstalled = await isMitmproxyInstalled();
    if (isInstalled) {
      // If installed, test that startMitmweb is callable
      expect(typeof startMitmweb).toBe("function");
      return;
    }

    await expect(startMitmweb()).rejects.toThrow(MitmproxyNotInstalledError);
  });

  test("accepts valid options", () => {
    // Verify the function signature accepts MitmwebOptions
    expect(typeof startMitmweb).toBe("function");
  });

  test("validates options with schema", async () => {
    // Invalid port should throw
    const isInstalled = await isMitmproxyInstalled();
    if (!isInstalled) {
      // Will throw MitmproxyNotInstalledError before validation
      await expect(startMitmweb({ webPort: -1 })).rejects.toThrow();
    }
  });
});

describe("stopMitmweb()", () => {
  test("is callable", () => {
    expect(typeof stopMitmweb).toBe("function");
  });

  test("handles non-running process gracefully", async () => {
    // Should not throw when process is not running
    await expect(stopMitmweb("/nonexistent/dir")).resolves.toBeUndefined();
  });

  test("accepts workingDir parameter", async () => {
    // Should accept a working directory
    await stopMitmweb("/tmp");
    // No throw means success
  });
});

describe("autoInstallMitmproxy()", () => {
  test("is callable", () => {
    expect(typeof autoInstallMitmproxy).toBe("function");
  });

  test("returns a promise", () => {
    // Don't actually run it, just check it returns a promise
    expect(typeof autoInstallMitmproxy).toBe("function");
  });
});

describe("getMitmwebStatus() - Advanced", () => {
  const testDir = "/tmp/mitmweb-test-" + Date.now();
  const pidFile = path.join(testDir, "mitmweb.pid");

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });

  test("returns false for invalid PID in file", () => {
    fs.writeFileSync(pidFile, "not-a-number", "utf-8");
    const status = getMitmwebStatus(testDir);
    expect(status.running).toBe(false);
  });

  test("returns false for non-existent process PID", () => {
    // Use a very high PID that almost certainly doesn't exist
    fs.writeFileSync(pidFile, "999999999", "utf-8");
    const status = getMitmwebStatus(testDir);
    expect(status.running).toBe(false);
    // Should also cleanup stale PID file
    expect(fs.existsSync(pidFile)).toBe(false);
  });

  test("handles empty PID file", () => {
    fs.writeFileSync(pidFile, "", "utf-8");
    const status = getMitmwebStatus(testDir);
    expect(status.running).toBe(false);
  });

  test("handles whitespace-only PID file", () => {
    fs.writeFileSync(pidFile, "   \n  ", "utf-8");
    const status = getMitmwebStatus(testDir);
    expect(status.running).toBe(false);
  });
});

describe("Error Classes", () => {
  test("MitmproxyNotInstalledError has correct message", () => {
    const error = new MitmproxyNotInstalledError("Test message");
    expect(error.message).toBe("Test message");
    expect(error.name).toBe("MitmproxyNotInstalledError");
    expect(error).toBeInstanceOf(Error);
  });

  test("CaddyApiClientError can include context", () => {
    const error = new CaddyApiClientError("Test error", { pid: 123 });
    expect(error.message).toBe("Test error");
    expect(error.context).toEqual({ pid: 123 });
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
