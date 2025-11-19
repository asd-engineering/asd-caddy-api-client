/**
 * Basic MITMproxy integration tests
 *
 * Tests that mitmproxy is running and accessible in docker-compose
 *
 * Note: MITMproxy 10.4.2+ has CSRF protection on write endpoints (POST/DELETE).
 * Tests use unique timestamps to avoid conflicts with accumulated flows.
 */
import { describe, test, expect } from "vitest";
import { MITMPROXY_WEB_URL, MITMPROXY_PROXY_URL, BACKEND_URL } from "./constants.js";

describe("MITMproxy Basic Integration", () => {
  describe("Service Health", () => {
    test("mitmproxy web UI is accessible", async () => {
      const res = await fetch(MITMPROXY_WEB_URL);
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("mitmproxy");
    });

    test("backend service is accessible", async () => {
      const res = await fetch(BACKEND_URL);
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty("path");
      expect(json).toHaveProperty("method");
    });

    test("mitmproxy proxy port is listening", async () => {
      // Make request through proxy (will forward to backend)
      const res = await fetch(`${MITMPROXY_PROXY_URL}/health`);
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
    });
  });

  describe("Web UI API", () => {
    test("can query flows endpoint", async () => {
      const res = await fetch(`${MITMPROXY_WEB_URL}/flows`);
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);

      const flows = await res.json();
      expect(Array.isArray(flows)).toBe(true);
    });

    test("clear endpoint requires CSRF protection", async () => {
      // Note: MITMproxy 10.4.2+ has CSRF protection on write endpoints
      // The /clear endpoint returns 403 without proper CSRF token
      const clearRes = await fetch(`${MITMPROXY_WEB_URL}/clear`, { method: "POST" });
      expect(clearRes.status).toBe(403);
      expect(clearRes.ok).toBe(false);

      // This is expected behavior - CSRF protection is working
      // For test cleanup, we rely on clearing flows before test suite starts
    });

    test("can get state endpoint", async () => {
      const res = await fetch(`${MITMPROXY_WEB_URL}/state`);
      expect(res.ok).toBe(true);

      const state = await res.json();
      expect(state).toHaveProperty("contentViews");
      expect(state).toHaveProperty("servers");
    });
  });

  describe("Reverse Proxy Mode", () => {
    test("forwards requests to backend", async () => {
      const testPath = `/test-${Date.now()}`;
      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      expect(json.path).toBe(testPath);
      expect(json.method).toBe("GET");
    });

    test("preserves request headers", async () => {
      const customHeader = `test-${Date.now()}`;
      const res = await fetch(`${MITMPROXY_PROXY_URL}/header-test`, {
        headers: {
          "X-Custom-Header": customHeader,
        },
      });

      const json = await res.json();
      expect(json.headers).toHaveProperty("x-custom-header");
      expect(json.headers["x-custom-header"]).toBe(customHeader);
    });

    test("forwards response from backend", async () => {
      const res = await fetch(`${MITMPROXY_PROXY_URL}/status-test`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty("method");
      expect(json.method).toBe("GET");
    });

    test("supports POST requests", async () => {
      const testData = { test: "data", timestamp: Date.now() };
      const res = await fetch(`${MITMPROXY_PROXY_URL}/post-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testData),
      });

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.method).toBe("POST");
    });
  });

  describe("Traffic Capture", () => {
    test("captures request details", async () => {
      // Make a request with unique path
      const testPath = `/capture-test-${Date.now()}`;
      await fetch(`${MITMPROXY_PROXY_URL}${testPath}`);

      // Get flows and find our request
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      expect(flows.length).toBeGreaterThan(0);

      const flow = flows.find((f: any) => f.request.path === testPath);
      expect(flow).toBeDefined();
      expect(flow.request.method).toBe("GET");
      expect(flow.request.path).toBe(testPath);
    });

    test("captures response details", async () => {
      // Make a request with unique path
      const testPath = `/response-test-${Date.now()}`;
      await fetch(`${MITMPROXY_PROXY_URL}${testPath}`);

      // Get flows and find our request
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);

      expect(flow).toBeDefined();
      expect(flow.response).toHaveProperty("status_code");
      expect(flow.response.status_code).toBe(200);
      expect(flow.response).toHaveProperty("headers");
    });

    test("increments flow count", async () => {
      // Get initial count
      const initialFlows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const initialCount = initialFlows.length;

      // Make multiple requests with unique paths
      const timestamp = Date.now();
      await fetch(`${MITMPROXY_PROXY_URL}/count-${timestamp}-1`);
      await fetch(`${MITMPROXY_PROXY_URL}/count-${timestamp}-2`);
      await fetch(`${MITMPROXY_PROXY_URL}/count-${timestamp}-3`);

      // Verify flow count increased by 3
      const finalFlows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      expect(finalFlows.length).toBe(initialCount + 3);

      // Verify our specific paths are in the flows
      const paths = (finalFlows as any[]).map((f: any) => f.request.path as string);
      expect(paths).toContain(`/count-${timestamp}-1`);
      expect(paths).toContain(`/count-${timestamp}-2`);
      expect(paths).toContain(`/count-${timestamp}-3`);
    });
  });
});
