/**
 * Caddy Admin API client
 */
import { z } from "zod";
import type { CaddyClientOptions, CaddyRoute, UpstreamStatus } from "../types.js";
import { CaddyApiError, NetworkError, TimeoutError, CaddyApiClientError } from "../errors.js";
import {
  CaddyClientOptionsSchema,
  CaddyRouteSchema,
  UpstreamStatusArraySchema,
} from "../schemas.js";
import {
  configSchema,
  serverSchema,
  routeSchema,
  type Config,
  type Server,
} from "../caddy-types.js";

// Create passthrough versions of schemas to preserve unknown fields from API responses
// This ensures we don't accidentally strip fields that Caddy returns but aren't in our schema
// Important: Caddy routes can have @id fields and other custom properties
const configResponseSchema = configSchema.passthrough();
const serverResponseSchema = serverSchema.passthrough();
const serversResponseSchema = z.record(z.string(), serverResponseSchema);

// Route schema with passthrough to preserve @id and other custom fields
// The base routeListSchema strips unknown fields, so we need to recreate with passthrough
const routeWithPassthroughSchema = routeSchema.passthrough();
const routeResponseListSchema = z.array(routeWithPassthroughSchema);

// Schema for version response
const versionResponseSchema = z
  .object({
    version: z.string().optional(),
  })
  .passthrough();

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
  async request(path: string, options: RequestInit = {}): Promise<Response> {
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
   * @returns Full Caddy configuration as JSON, validated against Caddy schema
   */
  async getConfig(): Promise<Config & Record<string, unknown>> {
    const response = await this.request("/config/");
    const data = await response.json();
    return configResponseSchema.parse(data);
  }

  /**
   * Escape server name for use in Caddy API path
   * Server names with dots need special encoding
   * @param server - Server name
   * @returns Escaped server name for API path
   */
  private escapeServerName(server: string): string {
    // Caddy's Admin API uses dots as path separators in traversal paths
    // To access a server name that contains dots, we need to percent-encode them
    // encodeURIComponent doesn't encode dots since they're unreserved in URIs,
    // so we manually replace them with %2E
    return server.replace(/\./g, "%2E");
  }

  /**
   * Get routes for a specific server
   * @param server - Server name (e.g., "https_server")
   * @returns Array of routes, validated against Caddy route schema
   */
  async getRoutes(server: string): Promise<CaddyRoute[]> {
    const escapedServer = this.escapeServerName(server);
    const response = await this.request(`/config/apps/http/servers/${escapedServer}/routes`);
    const routes = await response.json();

    // Validate routes against schema with passthrough to preserve @id and custom fields
    const validated = routeResponseListSchema.safeParse(routes);
    if (!validated.success) {
      throw new CaddyApiClientError(
        `Invalid routes response from Caddy: ${validated.error.message}`
      );
    }

    // Return as CaddyRoute[] for backwards compatibility
    return validated.data as CaddyRoute[];
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
    const escapedServer = this.escapeServerName(server);
    await this.request(`/config/apps/http/servers/${escapedServer}/routes`, {
      method: "POST",
      body: JSON.stringify(route),
    });

    return true;
  }

  /**
   * Add multiple routes to a server (convenience method to avoid loops)
   * This method adds routes one at a time and handles idempotency for each.
   *
   * @param server - Server name
   * @param routes - Array of routes to add
   * @returns Object with counts of added and skipped routes
   *
   * @example
   * const routes = buildServiceRoutes({ host: "api.localhost", dial: "localhost:3000" });
   * const result = await client.addRoutes("https_server", routes);
   * console.log(`Added ${result.added}, skipped ${result.skipped}`);
   */
  async addRoutes(
    server: string,
    routes: CaddyRoute[]
  ): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;

    for (const route of routes) {
      const wasAdded = await this.addRoute(server, route);
      if (wasAdded) {
        added++;
      } else {
        skipped++;
      }
    }

    return { added, skipped };
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

    const escapedServer = this.escapeServerName(server);
    await this.request(`/config/apps/http/servers/${escapedServer}/routes`, {
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
   * @returns Server configurations, validated against Caddy schema
   */
  async getServers(): Promise<Record<string, Server & Record<string, unknown>>> {
    const response = await this.request("/config/apps/http/servers");
    const data = await response.json();
    return serversResponseSchema.parse(data);
  }

  /**
   * Get configuration for a specific server
   * @param server - Server name
   * @returns Server configuration object, validated against Caddy schema
   */
  async getServerConfig(server: string): Promise<Server & Record<string, unknown>> {
    const escapedServer = this.escapeServerName(server);
    const response = await this.request(`/config/apps/http/servers/${escapedServer}`);
    const config = await response.json();
    return serverResponseSchema.parse(config);
  }

  /**
   * Patch server configuration
   * @param serverConfig - Server configuration object (server name -> server config)
   */
  async patchServer(
    serverConfig: Record<string, Partial<Server> | Record<string, unknown>>
  ): Promise<void> {
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
   * @returns Version information object with version string and additional metadata
   */
  async getVersion(): Promise<{ version?: string } & Record<string, unknown>> {
    const response = await this.request("/");
    const data = await response.json();
    return versionResponseSchema.parse(data);
  }

  /**
   * Insert a route at a specific position in the server's route list
   * @param server - Server name
   * @param route - Route to insert
   * @param position - Where to insert the route
   * @returns void
   */
  async insertRoute(
    server: string,
    route: CaddyRoute,
    position: "beginning" | "end" | "after-health-checks" = "after-health-checks"
  ): Promise<void> {
    const validated = CaddyRouteSchema.parse(route);
    const routes = await this.getRoutes(server);

    let insertIndex = 0;

    if (position === "after-health-checks") {
      // Find position immediately after the last health check/static route
      // Health checks are identified by static_response handler
      let lastHealthCheckIndex = -1;
      for (let i = 0; i < routes.length; i++) {
        const handler = routes[i].handle?.[0];
        if (handler?.handler === "static_response") {
          lastHealthCheckIndex = i;
        }
      }
      // Insert immediately after the last health check
      insertIndex = lastHealthCheckIndex + 1;
    } else if (position === "end") {
      insertIndex = routes.length;
    }
    // "beginning" keeps insertIndex = 0

    // Insert route at the calculated position
    routes.splice(insertIndex, 0, validated);

    // Get full server config to preserve all fields
    const serverConfig = await this.getServerConfig(server);

    // Update server routes while preserving other fields
    await this.patchServer({
      [server]: {
        ...serverConfig,
        routes,
      },
    });
  }

  /**
   * Replace a route by its @id
   * @param server - Server name
   * @param id - Route @id to replace
   * @param newRoute - New route configuration
   * @returns true if route was found and replaced, false otherwise
   */
  async replaceRouteById(server: string, id: string, newRoute: CaddyRoute): Promise<boolean> {
    // Validate route first (will throw if invalid)
    const validated = CaddyRouteSchema.parse(newRoute);

    // Then check if route exists
    const routes = await this.getRoutes(server);
    const index = routes.findIndex((r) => r["@id"] === id);

    if (index === -1) {
      return false; // Route not found
    }

    // Replace route while preserving the @id
    routes[index] = { ...validated, "@id": id };

    // Get full server config to preserve all fields
    const serverConfig = await this.getServerConfig(server);

    // Update server routes while preserving other fields
    await this.patchServer({
      [server]: {
        ...serverConfig,
        routes,
      },
    });

    return true;
  }

  /**
   * Remove a route by its @id
   * @param server - Server name
   * @param id - Route @id to remove
   * @returns true if route was found and removed, false otherwise
   */
  async removeRouteById(server: string, id: string): Promise<boolean> {
    const routes = await this.getRoutes(server);
    const initialLength = routes.length;
    const filtered = routes.filter((r) => r["@id"] !== id);

    if (filtered.length === initialLength) {
      return false; // Route not found
    }

    // Get full server config to preserve all fields
    const serverConfig = await this.getServerConfig(server);

    // Update server routes while preserving other fields
    await this.patchServer({
      [server]: {
        ...serverConfig,
        routes: filtered,
      },
    });

    return true;
  }

  /**
   * Gracefully stop the Caddy server
   * This triggers a graceful shutdown, allowing active connections to complete.
   * @throws CaddyApiError if the stop request fails
   */
  async stop(): Promise<void> {
    await this.request("/stop", {
      method: "POST",
    });
  }

  /**
   * Get reverse proxy upstream status
   * Returns the current state of all configured upstream servers.
   * @returns Array of upstream server status objects, validated
   */
  async getUpstreams(): Promise<UpstreamStatus[]> {
    const response = await this.request("/reverse_proxy/upstreams");
    const upstreams = await response.json();
    return UpstreamStatusArraySchema.parse(upstreams);
  }

  /**
   * Adapt a configuration from one format to another
   * Commonly used to convert Caddyfile to JSON configuration.
   * @param config - The configuration content to adapt
   * @param adapter - The adapter to use (e.g., "caddyfile")
   * @returns The adapted configuration as validated JSON
   */
  async adapt(config: string, adapter = "caddyfile"): Promise<Config & Record<string, unknown>> {
    const response = await this.request(`/adapt`, {
      method: "POST",
      headers: {
        "Content-Type": "text/caddyfile",
      },
      body: JSON.stringify({
        config,
        adapter,
      }),
    });
    const data = await response.json();
    return configResponseSchema.parse(data);
  }
}
