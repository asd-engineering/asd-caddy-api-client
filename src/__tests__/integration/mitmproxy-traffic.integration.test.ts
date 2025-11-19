/**
 * MITMproxy traffic interception integration tests
 *
 * Tests end-to-end HTTP traffic flow through MITMproxy with full inspection:
 * - Client makes request → MITMproxy captures → Backend receives → Response captured
 * - Validates request/response data integrity through proxy
 * - Tests different HTTP methods, headers, and body content
 *
 * Note: Uses unique timestamps to identify flows without clearing (CSRF protection)
 */
import { describe, test, expect } from "vitest";
import { MITMPROXY_WEB_URL, MITMPROXY_PROXY_URL, BACKEND_URL } from "./constants.js";

describe("MITMproxy Traffic Interception", () => {
  describe("HTTP Method Support", () => {
    test("proxies GET requests with query parameters", async () => {
      const timestamp = Date.now();
      const testPath = `/api/users?id=${timestamp}&filter=active`;

      // Make request through proxy
      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      // Note: Backend echo server strips query params from path field
      expect(json.path).toBe("/api/users");
      expect(json.method).toBe("GET");

      // Verify flow captured WITH query parameters
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);

      expect(flow).toBeDefined();
      expect(flow.request.method).toBe("GET");
      expect(flow.request.path).toBe(testPath); // Flow preserves full path with query
    });

    test("proxies POST requests with JSON body", async () => {
      const timestamp = Date.now();
      const testPath = `/api/create-${timestamp}`;
      const requestBody = {
        name: "Test User",
        email: `test-${timestamp}@example.com`,
        timestamp,
      };

      // Make POST request through proxy
      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.method).toBe("POST");
      expect(json.path).toBe(testPath);

      // Verify flow captured with body
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);

      expect(flow).toBeDefined();
      expect(flow.request.method).toBe("POST");
      expect(flow.request.headers).toBeDefined();
    });

    test("proxies PUT requests", async () => {
      const timestamp = Date.now();
      const testPath = `/api/update-${timestamp}`;

      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "updated" }),
      });

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.method).toBe("PUT");

      // Verify flow captured
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);
      expect(flow.request.method).toBe("PUT");
    });

    test("proxies DELETE requests", async () => {
      const timestamp = Date.now();
      const testPath = `/api/delete-${timestamp}`;

      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`, {
        method: "DELETE",
      });

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.method).toBe("DELETE");

      // Verify flow captured
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);
      expect(flow.request.method).toBe("DELETE");
    });
  });

  describe("Header Preservation", () => {
    test("forwards custom request headers to backend", async () => {
      const timestamp = Date.now();
      const testPath = `/headers-${timestamp}`;
      const customHeaders = {
        "X-Request-ID": `req-${timestamp}`,
        "X-Client-Version": "1.0.0",
        "X-Custom-Header": `test-value-${timestamp}`,
      };

      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`, {
        headers: customHeaders,
      });

      const json = await res.json();

      // Backend should receive custom headers (lowercase)
      expect(json.headers["x-request-id"]).toBe(customHeaders["X-Request-ID"]);
      expect(json.headers["x-client-version"]).toBe(customHeaders["X-Client-Version"]);
      expect(json.headers["x-custom-header"]).toBe(customHeaders["X-Custom-Header"]);

      // Verify headers in captured flow
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);

      expect(flow).toBeDefined();
      const flowHeaders = Object.fromEntries(
        (flow.request.headers as [string, string][]).map((h: [string, string]) => [
          h[0].toLowerCase(),
          h[1],
        ])
      );
      expect(flowHeaders["x-request-id"]).toBe(customHeaders["X-Request-ID"]);
    });

    test("preserves response headers from backend", async () => {
      const timestamp = Date.now();
      const testPath = `/response-headers-${timestamp}`;

      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`);

      // Check response headers
      expect(res.headers.get("content-type")).toContain("application/json");

      // Verify response headers in captured flow
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);

      expect(flow.response).toBeDefined();
      expect(flow.response.headers).toBeDefined();
      expect(Array.isArray(flow.response.headers)).toBe(true);
    });
  });

  describe("Request/Response Body Handling", () => {
    test("forwards request body to backend", async () => {
      const timestamp = Date.now();
      const testPath = `/body-test-${timestamp}`;
      const requestData = {
        message: "Hello from test",
        timestamp,
        nested: {
          value: 123,
          array: [1, 2, 3],
        },
      };

      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      const json = await res.json();
      expect(json.method).toBe("POST");

      // Verify flow captured request with body metadata
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);

      expect(flow).toBeDefined();
      expect(flow.request).toHaveProperty("contentLength");
      expect(flow.request.contentLength).toBeGreaterThan(0); // Body was sent
    });

    test("returns backend response body to client", async () => {
      const timestamp = Date.now();
      const testPath = `/echo-${timestamp}`;

      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`);
      expect(res.ok).toBe(true);

      const json = await res.json();

      // Backend returns request details
      expect(json).toHaveProperty("path");
      expect(json).toHaveProperty("method");
      expect(json).toHaveProperty("headers");
      expect(json.path).toBe(testPath);

      // Verify response captured in flow
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);

      expect(flow.response).toBeDefined();
      expect(flow.response.status_code).toBe(200);
    });
  });

  describe("Response Status Code Handling", () => {
    test("proxies 200 OK responses", async () => {
      const timestamp = Date.now();
      const testPath = `/status-200-${timestamp}`;

      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`);
      expect(res.status).toBe(200);
      expect(res.ok).toBe(true);

      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);
      expect(flow.response.status_code).toBe(200);
    });

    test("proxies 404 Not Found responses", async () => {
      const timestamp = Date.now();
      const testPath = `/nonexistent-${timestamp}`;

      // Backend (http-echo) returns 200 for all paths, but we can verify proxy works
      await fetch(`${MITMPROXY_PROXY_URL}${testPath}`);

      // Verify request was proxied (even if backend returns 200)
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);

      expect(flow).toBeDefined();
      expect(flow.response).toBeDefined();
    });
  });

  describe("Direct vs Proxied Comparison", () => {
    test("backend receives same request data via proxy vs direct", async () => {
      const timestamp = Date.now();
      const testPath = `/compare-${timestamp}`;
      const headers = {
        "X-Test-Header": `value-${timestamp}`,
        "Content-Type": "application/json",
      };
      const body = { test: "data", timestamp };

      // Request through proxy
      const proxiedRes = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const proxiedJson = await proxiedRes.json();

      // Direct request to backend
      const directRes = await fetch(`${BACKEND_URL}${testPath}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const directJson = await directRes.json();

      // Both should have same path and method
      expect(proxiedJson.path).toBe(directJson.path);
      expect(proxiedJson.method).toBe(directJson.method);

      // Verify flow captured
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);
      expect(flow).toBeDefined();
    });

    test("client receives same response data via proxy vs direct", async () => {
      const timestamp = Date.now();
      const testPath = `/response-compare-${timestamp}`;

      // Request through proxy
      const proxiedRes = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`);
      const proxiedJson = await proxiedRes.json();

      // Direct request to backend
      const directRes = await fetch(`${BACKEND_URL}${testPath}`);
      const directJson = await directRes.json();

      // Response structure should be identical
      expect(proxiedJson.path).toBe(directJson.path);
      expect(proxiedJson.method).toBe(directJson.method);
      expect(typeof proxiedJson.headers).toBe(typeof directJson.headers);
    });
  });

  describe("Traffic Flow Validation", () => {
    test("complete request/response cycle is captured", async () => {
      const timestamp = Date.now();
      const testPath = `/complete-cycle-${timestamp}`;
      const requestBody = { action: "test", timestamp };

      // Make request
      const startTime = Date.now();
      const res = await fetch(`${MITMPROXY_PROXY_URL}${testPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-ID": `corr-${timestamp}`,
        },
        body: JSON.stringify(requestBody),
      });
      const endTime = Date.now();

      expect(res.ok).toBe(true);
      await res.json();

      // Get captured flow
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const flow = flows.find((f: any) => f.request.path === testPath);

      // Validate complete flow
      expect(flow).toBeDefined();

      // Request validation
      expect(flow.request).toBeDefined();
      expect(flow.request.method).toBe("POST");
      expect(flow.request.path).toBe(testPath);
      expect(flow.request.headers).toBeDefined();

      // Response validation
      expect(flow.response).toBeDefined();
      expect(flow.response.status_code).toBe(200);
      expect(flow.response.headers).toBeDefined();

      // Timing validation
      expect(flow.timestamp_created).toBeDefined();
      const flowTimestamp = flow.timestamp_created * 1000; // Convert to ms
      expect(flowTimestamp).toBeGreaterThanOrEqual(startTime - 1000);
      expect(flowTimestamp).toBeLessThanOrEqual(endTime + 1000);
    });

    test("concurrent requests are all captured", async () => {
      const timestamp = Date.now();
      const requests = 5;

      // Make concurrent requests
      const promises = Array.from({ length: requests }, (_, i) =>
        fetch(`${MITMPROXY_PROXY_URL}/concurrent-${timestamp}-${i}`)
      );

      const responses = await Promise.all(promises);

      // All should succeed
      expect(responses.every((r) => r.ok)).toBe(true);

      // All should be captured
      const flows = await fetch(`${MITMPROXY_WEB_URL}/flows`).then((r) => r.json());
      const capturedPaths = (flows as any[]).map((f: any) => f.request.path as string);

      for (let i = 0; i < requests; i++) {
        const path = `/concurrent-${timestamp}-${i}`;
        expect(capturedPaths).toContain(path);
      }
    });
  });
});
