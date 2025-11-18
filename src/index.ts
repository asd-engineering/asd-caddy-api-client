/**
 * @asd/caddy-api-client
 * TypeScript client for Caddy Admin API with MITMproxy integration
 */

// Core exports
export * from "./types.js";
export * from "./errors.js";
export * from "./schemas.js";

// Caddy module
export * from "./caddy/index.js";

// MITM module
export * from "./mitm/index.js";

// Version
export const VERSION = "0.1.0";
