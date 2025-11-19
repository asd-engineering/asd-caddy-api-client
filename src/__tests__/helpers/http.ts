/**
 * HTTP request helpers for integration tests
 * Provides clean abstractions over raw HTTP requests to Caddy
 */

import http from "http";

export interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface HttpRequestOptions {
  host: string;
  path: string;
  port?: number;
  auth?: {
    username: string;
    password: string;
  };
  method?: string;
  headers?: Record<string, string>;
}

/**
 * Make HTTP request to Caddy test server
 * Uses Node.js http module to make real HTTP requests
 *
 * @param options - Request options
 * @returns Promise resolving to response with status, headers, and body
 *
 * @example
 * const response = await callCaddy({
 *   host: "example.localhost",
 *   path: "/api/users",
 *   port: 8080,
 * });
 *
 * @example
 * const response = await callCaddy({
 *   host: "admin.localhost",
 *   path: "/dashboard",
 *   auth: { username: "admin", password: "secret" },
 * });
 */
export async function callCaddy(options: HttpRequestOptions): Promise<HttpResponse> {
  const port = options.port ?? 8080;
  const method = options.method ?? "GET";

  return new Promise((resolve, reject) => {
    const requestOptions: http.RequestOptions = {
      hostname: "localhost",
      port,
      path: options.path,
      method,
      headers: {
        Host: options.host,
        ...options.headers,
      },
    };

    // Add Basic Auth if provided
    if (options.auth) {
      const credentials = `${options.auth.username}:${options.auth.password}`;
      const encodedCredentials = Buffer.from(credentials).toString("base64");
      requestOptions.headers = {
        ...requestOptions.headers,
        Authorization: `Basic ${encodedCredentials}`,
      };
    }

    const req = http.request(requestOptions, (res) => {
      let body = "";

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body,
        });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

/**
 * Call global health endpoint
 * Convenience wrapper for calling /health
 *
 * @param hostHeader - Host header value (e.g., "example.localhost")
 * @param port - Caddy server port (default: 8080)
 * @returns Promise resolving to response
 *
 * @example
 * const health = await callHealth("studio.localhost");
 * expect(health.statusCode).toBe(200);
 * expect(health.headers["x-asd-health"]).toBe("ok");
 */
export async function callHealth(hostHeader: string, port = 8080): Promise<HttpResponse> {
  return callCaddy({
    host: hostHeader,
    path: "/health",
    port,
  });
}

/**
 * Call service endpoint with optional authentication
 * Convenience wrapper for calling service routes
 *
 * @param options - Service call options
 * @returns Promise resolving to response
 *
 * @example
 * // Public endpoint
 * const response = await callService({
 *   host: "api.localhost",
 *   path: "/users",
 * });
 *
 * @example
 * // Protected endpoint
 * const response = await callService({
 *   host: "admin.localhost",
 *   path: "/dashboard",
 *   auth: { username: "admin", password: "secret" },
 * });
 */
export async function callService(
  options: Omit<HttpRequestOptions, "method">
): Promise<HttpResponse> {
  return callCaddy(options);
}

/**
 * Make multiple HTTP requests in parallel
 * Useful for testing concurrent access
 *
 * @param requests - Array of request options
 * @returns Promise resolving to array of responses
 *
 * @example
 * const responses = await callMultiple([
 *   { host: "api.localhost", path: "/users" },
 *   { host: "admin.localhost", path: "/dashboard" },
 *   { host: "db.localhost", path: "/" },
 * ]);
 */
export async function callMultiple(requests: HttpRequestOptions[]): Promise<HttpResponse[]> {
  return Promise.all(requests.map((req) => callCaddy(req)));
}
