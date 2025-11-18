/**
 * Caddy Admin API client
 */
import type { CaddyClientOptions, CaddyRoute } from "../types.js";
import { CaddyApiError, NetworkError, TimeoutError, CaddyApiClientError } from "../errors.js";
import { CaddyClientOptionsSchema, CaddyRouteSchema } from "../schemas.js";

/**
 * Client for interacting with Caddy Admin API
 */
export class CaddyClient {
  private readonly adminUrl: string;
  private readonly timeout: number;

  /**
   * Create a new Caddy API client
   * @param options - Client configuration options
   */
  constructor(options: CaddyClientOptions = {}) {
    const validated = CaddyClientOptionsSchema.parse(options);
    this.adminUrl = validated.adminUrl;
    this.timeout = validated.timeout;
  }

  /**
   * Make an HTTP request to Caddy Admin API with timeout
   * @param path - API endpoint path
   * @param options - Fetch options
   * @returns Response object
   * @throws NetworkError, TimeoutError, CaddyApiError
   */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.adminUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new CaddyApiError(
          `Caddy API request failed: ${response.status} ${response.statusText}`,
          response.status,
          body
        );
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof CaddyApiError) {
        throw error;
      }

      if ((error as Error).name === "AbortError") {
        throw new TimeoutError(
          `Request to ${path} timed out after ${this.timeout}ms`,
          this.timeout
        );
      }

      throw new NetworkError(
        `Network request to ${path} failed: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Get current Caddy configuration
   * @returns Full Caddy configuration as JSON
   */
  async getConfig(): Promise<unknown> {
    const response = await this.request("/config/");
    return response.json();
  }

  /**
   * Get routes for a specific server
   * @param server - Server name (e.g., "https_server")
   * @returns Array of routes
   */
  async getRoutes(server: string): Promise<CaddyRoute[]> {
    const response = await this.request(`/config/apps/http/servers/${server}/routes`);
    const routes = await response.json();

    if (!Array.isArray(routes)) {
      throw new CaddyApiClientError("Invalid routes response from Caddy");
    }

    return routes as CaddyRoute[];
  }

  /**
   * Add a route to a server
   * @param server - Server name
   * @param route - Route configuration
   * @returns True if route was added, false if already exists
   */
  async addRoute(server: string, route: CaddyRoute): Promise<boolean> {
    // Validate route
    CaddyRouteSchema.parse(route);

    // Check if route already exists (idempotency)
    try {
      const existingRoutes = await this.getRoutes(server);
      const routeMatch = route.match?.[0];

      if (routeMatch && this.routeExists(existingRoutes, routeMatch)) {
        return false; // Route already exists, skip
      }
    } catch {
      // If we can't get routes, continue with POST
      // (server might not exist yet)
    }

    // Add route
    await this.request(`/config/apps/http/servers/${server}/routes`, {
      method: "POST",
      body: JSON.stringify(route),
    });

    return true;
  }

  /**
   * Check if a route already exists in the routes array
   * @param routes - Existing routes
   * @param matcher - Route matcher to check
   * @returns True if route exists
   */
  private routeExists(
    routes: CaddyRoute[],
    matcher: { host?: string[]; path?: string[] }
  ): boolean {
    return routes.some((existingRoute) => {
      const existingMatch = existingRoute.match?.[0];
      if (!existingMatch) return false;

      const hostMatches = JSON.stringify(existingMatch.host) === JSON.stringify(matcher.host);
      const pathMatches = JSON.stringify(existingMatch.path) === JSON.stringify(matcher.path);

      return hostMatches && pathMatches;
    });
  }

  /**
   * Replace all routes for a server (PATCH)
   * @param server - Server name
   * @param routes - Array of routes
   */
  async patchRoutes(server: string, routes: CaddyRoute[]): Promise<void> {
    // Validate all routes
    routes.forEach((route) => CaddyRouteSchema.parse(route));

    await this.request(`/config/apps/http/servers/${server}/routes`, {
      method: "PATCH",
      body: JSON.stringify(routes),
    });
  }

  /**
   * Remove routes matching a hostname
   * @param hostname - Hostname to match
   * @param server - Server name
   * @returns Number of routes removed
   */
  async removeRoutesByHost(hostname: string, server = "https_server"): Promise<number> {
    if (!hostname || typeof hostname !== "string") {
      throw new CaddyApiClientError("hostname is required and must be a string");
    }

    let existingRoutes: CaddyRoute[];
    try {
      existingRoutes = await this.getRoutes(server);
    } catch {
      // Caddy not running or unreachable
      return 0;
    }

    // Filter out routes matching the hostname
    const filtered = existingRoutes.filter((route) => {
      const routeHost = route.match?.[0]?.host?.[0];
      return routeHost !== hostname;
    });

    const removedCount = existingRoutes.length - filtered.length;

    // Update Caddy if any routes were removed
    if (removedCount > 0) {
      try {
        await this.patchRoutes(server, filtered);
      } catch {
        // Routes can't be updated
        return 0;
      }
    }

    return removedCount;
  }

  /**
   * Get information about all servers
   * @returns Server configurations
   */
  async getServers(): Promise<unknown> {
    const response = await this.request("/config/apps/http/servers");
    return response.json();
  }

  /**
   * Patch server configuration
   * @param serverConfig - Server configuration object
   */
  async patchServer(serverConfig: Record<string, unknown>): Promise<void> {
    await this.request("/config/apps/http/servers", {
      method: "PATCH",
      body: JSON.stringify(serverConfig),
    });
  }

  /**
   * Reload Caddy configuration
   */
  async reload(): Promise<void> {
    await this.request("/load", {
      method: "POST",
    });
  }

  /**
   * Get Caddy version information
   * @returns Version information
   */
  async getVersion(): Promise<unknown> {
    const response = await this.request("/");
    return response.json();
  }
}
