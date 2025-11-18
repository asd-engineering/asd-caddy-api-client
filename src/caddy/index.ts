/**
 * Caddy module exports
 */

export { CaddyClient } from "./client.js";
export * from "./routes.js";
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

// Re-export types and schemas for convenience
export type {
  CaddyClientOptions,
  CaddyRoute,
  CaddyRouteHandler,
  CaddyRouteMatcher,
  ServiceRouteOptions,
  HealthCheckRouteOptions,
  HostRouteOptions,
  PathRouteOptions,
  LoadBalancerRouteOptions,
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
