/**
 * @accelerated-software-development/caddy-api-client
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
  RedirectStatusCode,
  UpstreamStatus,
  // Handler types (all 20 discriminated union members + generic fallback)
  ReverseProxyHandler,
  HeadersHandler,
  StaticResponseHandler,
  AuthenticationHandler,
  RewriteHandler,
  EncodeHandler,
  SubrouteHandler,
  FileServerHandler,
  TemplatesHandler,
  MapHandler,
  PushHandler,
  RequestBodyHandler,
  VarsHandler,
  InterceptHandler,
  InvokeHandler,
  TracingHandler,
  LogAppendHandler,
  ErrorHandler,
  CopyResponseHandler,
  CopyResponseHeadersHandler,
  GenericHandler,
  // Plugin handler types
  SecurityAuthenticationHandler,
  SecurityAuthorizationHandler,
} from "./types.js";

// Caddy module
export * from "./caddy/index.js";

// MITM module
export * from "./mitm/index.js";

// Plugins module
export * from "./plugins/index.js";

// Certificate utilities
export * from "./utils/certificate.js";

// Version - auto-synced from package.json
import pkg from "../package.json" with { type: "json" };
export const VERSION = pkg.version;
