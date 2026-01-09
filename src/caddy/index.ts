/**
 * Caddy module exports
 */

export { CaddyClient } from "./client.js";
export * from "./routes.js";

// Config loading utilities
export { loadConfig, loadCaddyfile, detectAdapter } from "./config-loader.js";

export type { CaddyAdapter, LoadConfigOptions } from "./config-loader.js";
export {
  addDomainWithAutoTls,
  addDomainWithTls,
  updateDomain,
  deleteDomain,
  getDomainConfig,
  listDomains,
  rotateCertificate,
  removeOldCertificates,
} from "./domains.js";
export * from "./tls.js";

// Export route ordering utilities
export {
  sortRoutes,
  calculateRoutePriority,
  validateRouteOrdering,
  insertRouteRelative,
  ROUTE_PRIORITIES,
} from "./ordering.js";

// Export high-level helper functions
export {
  createHealthRoute,
  createServiceRoute,
  createBasicAuthRoute,
  createLoadBalancerRoute,
  createRewriteRoute,
  createRedirectRoute,
} from "./helpers.js";

export type {
  HealthRouteOptions,
  ServiceRouteOptions,
  BasicAuthRouteOptions,
  LoadBalancerRouteOptions,
  RewriteRouteOptions,
} from "./helpers.js";

// Export certificate management
export { CertificateManager, createCertificateManager } from "./certificates.js";

export type {
  CertificateWithMetadata,
  RotateCertificateOptions,
  RotationResult,
  ExpirationCheckResult,
} from "./certificates.js";

// Export auth utilities
export {
  hashPassword,
  verifyPassword,
  hashPasswordWithCaddy,
  createBasicAuthAccount,
  createBasicAuthAccounts,
} from "../utils/auth.js";

// Re-export types and schemas for convenience
export type {
  CaddyClientOptions,
  CaddyRoute,
  CaddyRouteHandler,
  CaddyRouteMatcher,
  HealthCheckRouteOptions,
  HostRouteOptions,
  PathRouteOptions,
  TlsConnectionPolicy,
} from "../types.js";

export {
  CaddyClientOptionsSchema,
  CaddyRouteSchema,
  ServiceRouteOptionsSchema,
  HealthCheckRouteOptionsSchema,
  HostRouteOptionsSchema,
  PathRouteOptionsSchema,
  LoadBalancerRouteOptionsSchema,
} from "../schemas.js";
