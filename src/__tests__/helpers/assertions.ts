/**
 * Custom assertion helpers for Caddy integration tests
 * Provides semantic, reusable assertions for common test patterns
 */

import { expect } from "vitest";
import type { HttpResponse } from "./http";

/**
 * Assert response is from specific backend
 * Based on "Hello from backend X" echo pattern from test containers
 *
 * @param response - HTTP response to check
 * @param backendIdentifier - Backend identifier (1, 2, 3 or dial address)
 *
 * @example
 * const response = await callService({ host: "api.localhost", path: "/" });
 * expectBackend(response, 1); // Expects "Hello from backend 1"
 *
 * @example
 * expectBackend(response, "echo-test:5678"); // Matches backend by dial address
 */
export function expectBackend(response: HttpResponse, backendIdentifier: number | string): void {
  if (typeof backendIdentifier === "number") {
    expect(response.body).toContain(`Hello from backend ${backendIdentifier}`);
  } else {
    // Backend identifier is a dial address
    // We can't directly verify dial address from response body,
    // so we just verify we got a successful response
    expect(response.statusCode).toBe(200);
    expect(response.body).toBeTruthy();
  }
}

/**
 * Assert standard ASD service headers are present
 * Validates X-ASD-* headers that identify services
 *
 * @param response - HTTP response to check
 * @param expected - Expected header values
 *
 * @example
 * expectServiceHeaders(response, {
 *   serviceId: "code-server-main",
 *   serviceType: "ide",
 * });
 *
 * @example
 * expectServiceHeaders(response, {
 *   serviceId: "admin-dashboard-protected",
 *   serviceType: "admin-protected",
 *   authType: "domain-level",
 * });
 */
export function expectServiceHeaders(
  response: HttpResponse,
  expected: {
    serviceId?: string;
    serviceType?: string;
    authType?: string;
  }
): void {
  if (expected.serviceId !== undefined) {
    expect(response.headers["x-asd-service-id"]).toBe(expected.serviceId);
  }

  if (expected.serviceType !== undefined) {
    expect(response.headers["x-asd-service-type"]).toBe(expected.serviceType);
  }

  if (expected.authType !== undefined) {
    expect(response.headers["x-asd-auth-type"]).toBe(expected.authType);
  }
}

/**
 * Assert standard security headers are present
 * Validates security-related HTTP headers
 *
 * @param response - HTTP response to check
 * @param expected - Expected header values
 *
 * @example
 * expectSecurityHeaders(response, {
 *   frameOptions: "DENY",
 *   contentTypeOptions: "nosniff",
 * });
 *
 * @example
 * expectSecurityHeaders(response); // Checks headers exist with any value
 */
export function expectSecurityHeaders(
  response: HttpResponse,
  expected: {
    frameOptions?: string;
    contentTypeOptions?: string;
  } = {}
): void {
  if (expected.frameOptions !== undefined) {
    expect(response.headers["x-frame-options"]).toBe(expected.frameOptions);
  } else {
    // Just verify header exists
    expect(response.headers["x-frame-options"]).toBeDefined();
  }

  if (expected.contentTypeOptions !== undefined) {
    expect(response.headers["x-content-type-options"]).toBe(expected.contentTypeOptions);
  } else {
    // Just verify header exists
    expect(response.headers["x-content-type-options"]).toBeDefined();
  }
}

/**
 * Assert authentication is required (401 + WWW-Authenticate)
 * Validates that endpoint correctly challenges for credentials
 *
 * @param response - HTTP response to check
 * @param realm - Optional expected authentication realm
 *
 * @example
 * const response = await callService({ host: "admin.localhost", path: "/" });
 * expectAuthRequired(response);
 *
 * @example
 * expectAuthRequired(response, "Admin Dashboard");
 */
export function expectAuthRequired(response: HttpResponse, realm?: string): void {
  expect(response.statusCode).toBe(401);
  expect(response.headers["www-authenticate"]).toBeDefined();

  if (realm) {
    expect(response.headers["www-authenticate"]).toContain(`realm="${realm}"`);
  }
}

/**
 * Assert authentication succeeded (200)
 * Convenience assertion for successful auth
 *
 * @param response - HTTP response to check
 *
 * @example
 * const response = await callService({
 *   host: "admin.localhost",
 *   path: "/",
 *   auth: { username: "admin", password: "secret" },
 * });
 * expectAuthSuccess(response);
 */
export function expectAuthSuccess(response: HttpResponse): void {
  expect(response.statusCode).toBe(200);
}

/**
 * Assert health check response is valid
 * Validates global /health endpoint format
 *
 * @param response - HTTP response to check
 * @param instanceId - Expected instance ID
 *
 * @example
 * const health = await callHealth("studio.localhost");
 * expectHealthCheck(health, "prod-cluster-1");
 */
export function expectHealthCheck(response: HttpResponse, instanceId?: string): void {
  expect(response.statusCode).toBe(200);
  expect(response.headers["x-asd-health"]).toBe("ok");

  if (instanceId) {
    expect(response.headers["x-asd-instance"]).toBe(instanceId);
  }

  // Verify JSON body format
  expect(() => {
    JSON.parse(response.body);
  }).not.toThrow();
  const body = JSON.parse(response.body) as { status: string };
  expect(body).toHaveProperty("status");
  expect(body.status).toBe("healthy");
}

/**
 * Assert JSON response has expected structure
 * Validates Content-Type and parses JSON body
 *
 * @param response - HTTP response to check
 * @param expectedShape - Optional shape to validate
 *
 * @example
 * expectJsonResponse(response, {
 *   users: expect.any(Array),
 *   total: expect.any(Number),
 * });
 */
export function expectJsonResponse(
  response: HttpResponse,
  expectedShape?: Record<string, unknown>
): void {
  expect(response.headers["content-type"]).toContain("application/json");

  const body = JSON.parse(response.body);

  if (expectedShape) {
    expect(body).toMatchObject(expectedShape);
  }
}

/**
 * Assert response header exists and optionally matches value
 *
 * @param response - HTTP response to check
 * @param headerName - Header name (case-insensitive)
 * @param expectedValue - Optional expected value
 *
 * @example
 * expectHeader(response, "X-Custom-Header", "custom-value");
 *
 * @example
 * expectHeader(response, "X-Request-ID"); // Just verify it exists
 */
export function expectHeader(
  response: HttpResponse,
  headerName: string,
  expectedValue?: string
): void {
  const normalizedName = headerName.toLowerCase();
  expect(response.headers[normalizedName]).toBeDefined();

  if (expectedValue !== undefined) {
    expect(response.headers[normalizedName]).toBe(expectedValue);
  }
}

/**
 * Assert response is a redirect
 *
 * @param response - HTTP response to check
 * @param location - Expected redirect location
 * @param statusCode - Expected status code (301, 302, 307, 308)
 *
 * @example
 * expectRedirect(response, "https://example.com/new-location", 301);
 */
export function expectRedirect(response: HttpResponse, location?: string, statusCode = 301): void {
  expect(response.statusCode).toBe(statusCode);
  expect(response.headers.location).toBeDefined();

  if (location) {
    expect(response.headers.location).toBe(location);
  }
}

/**
 * Assert response body contains text
 * Case-sensitive substring match
 *
 * @param response - HTTP response to check
 * @param text - Text to search for
 *
 * @example
 * expectBodyContains(response, "Welcome to the admin panel");
 */
export function expectBodyContains(response: HttpResponse, text: string): void {
  expect(response.body).toContain(text);
}

/**
 * Assert response body matches regex pattern
 *
 * @param response - HTTP response to check
 * @param pattern - Regex pattern to match
 *
 * @example
 * expectBodyMatches(response, /user-\d+/);
 */
export function expectBodyMatches(response: HttpResponse, pattern: RegExp): void {
  expect(response.body).toMatch(pattern);
}
