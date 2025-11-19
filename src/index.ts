/**
 * @asd/caddy-api-client
 * TypeScript client for Caddy Admin API with MITMproxy integration
 */

// Core exports
export * from "./errors.js";
export * from "./schemas.js";

// Types - explicit exports to avoid conflicts
export type {
  HttpMethod,
  CaddyClientOptions,
  CaddyRouteMatcher,
  CaddyRouteHandler,
  CaddyRoute,
  TlsConnectionPolicy,
  HealthCheckRouteOptions,
  HostRouteOptions,
  PathRouteOptions,
} from "./types.js";

// Caddy module
export * from "./caddy/index.js";

// MITM module
export * from "./mitm/index.js";

// Certificate utilities
export * from "./utils/certificate.js";

// Version
export const VERSION = "0.1.0";
