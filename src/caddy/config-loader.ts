/**
 * Config file loading utilities
 *
 * Provides helpers for loading Caddy configuration files from disk
 * and applying them to a running Caddy server.
 *
 * @example
 * ```typescript
 * import { loadConfig, loadCaddyfile, CaddyClient } from "@accelerated-software-development/caddy-api-client";
 *
 * // Load and apply a Caddyfile
 * const config = await loadCaddyfile("./Caddyfile");
 * const client = new CaddyClient();
 * await client.applyConfig(config);
 *
 * // Or load with auto-detection
 * const jsonConfig = await loadConfig("./config.json");
 * ```
 */
import { readFile } from "fs/promises";
import { CaddyClient } from "./client.js";
import type { Config } from "../caddy-types.js";

/**
 * Valid Caddy configuration adapters
 */
export type CaddyAdapter = "caddyfile" | "json" | "yaml" | "nginx" | "apache";

/**
 * Options for loading configuration files
 */
export interface LoadConfigOptions {
  /** Caddy Admin API URL (default: http://127.0.0.1:2019) */
  adminUrl?: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
}

/**
 * Detect the appropriate adapter based on file extension
 *
 * @param path - Path to the configuration file
 * @returns The detected adapter type
 *
 * @example
 * ```typescript
 * detectAdapter("./config.json");     // "json"
 * detectAdapter("./config.yaml");     // "yaml"
 * detectAdapter("./Caddyfile");       // "caddyfile"
 * detectAdapter("./unknown.txt");     // "caddyfile" (default)
 * ```
 */
export function detectAdapter(path: string): CaddyAdapter {
  const lowerPath = path.toLowerCase();

  if (lowerPath.endsWith(".json")) {
    return "json";
  }
  if (lowerPath.endsWith(".yaml") || lowerPath.endsWith(".yml")) {
    return "yaml";
  }
  if (lowerPath.endsWith(".nginx") || lowerPath.includes("nginx.conf")) {
    return "nginx";
  }
  if (lowerPath.endsWith(".apache") || lowerPath.includes("httpd.conf")) {
    return "apache";
  }

  // Default to caddyfile for Caddyfile, unknown extensions, or no extension
  return "caddyfile";
}

/**
 * Load a configuration file and convert it to Caddy JSON format
 *
 * Reads the file from disk, auto-detects the format (or uses the provided adapter),
 * and uses Caddy's /adapt endpoint to convert it to JSON configuration.
 *
 * @param path - Path to the configuration file
 * @param adapter - Adapter to use (auto-detected from extension if not provided)
 * @param options - Loading options (adminUrl, timeout)
 * @returns The parsed Caddy configuration object
 *
 * @throws {ValidationError} If the file content is empty or invalid
 * @throws {CaddyApiError} If Caddy cannot parse the configuration
 * @throws {NetworkError} If unable to connect to Caddy Admin API
 * @throws {TimeoutError} If the request times out
 *
 * @example
 * ```typescript
 * // Auto-detect format from extension
 * const config = await loadConfig("./config.json");
 *
 * // Explicitly specify adapter
 * const config = await loadConfig("./my-config", "caddyfile");
 *
 * // With custom Caddy URL
 * const config = await loadConfig("./Caddyfile", undefined, {
 *   adminUrl: "http://caddy:2019"
 * });
 * ```
 */
export async function loadConfig(
  path: string,
  adapter?: CaddyAdapter,
  options?: LoadConfigOptions
): Promise<Config & Record<string, unknown>> {
  const content = await readFile(path, "utf-8");
  const detectedAdapter = adapter ?? detectAdapter(path);
  const client = new CaddyClient(options);
  return client.adapt(content, detectedAdapter);
}

/**
 * Load a Caddyfile and convert it to Caddy JSON format
 *
 * Convenience function for loading Caddyfile-formatted configuration.
 * Equivalent to `loadConfig(path, "caddyfile", options)`.
 *
 * @param path - Path to the Caddyfile
 * @param options - Loading options (adminUrl, timeout)
 * @returns The parsed Caddy configuration object
 *
 * @throws {ValidationError} If the file content is empty or invalid
 * @throws {CaddyApiError} If Caddy cannot parse the Caddyfile
 * @throws {NetworkError} If unable to connect to Caddy Admin API
 * @throws {TimeoutError} If the request times out
 *
 * @example
 * ```typescript
 * const config = await loadCaddyfile("./Caddyfile");
 *
 * // Modify the config
 * config.apps.http.servers.srv0.routes.push(myNewRoute);
 *
 * // Apply to running Caddy
 * await client.applyConfig(config);
 * ```
 */
export async function loadCaddyfile(
  path: string,
  options?: LoadConfigOptions
): Promise<Config & Record<string, unknown>> {
  return loadConfig(path, "caddyfile", options);
}
