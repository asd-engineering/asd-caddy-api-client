/**
 * Caddy JSON type definitions generated from Caddy Go source.
 *
 * These types are auto-generated from the local Caddy source code in `local/caddy`
 * using tygo. They provide TypeScript interfaces for Caddy's JSON configuration format.
 *
 * Features:
 * - Core configuration types (Config, AdminConfig, Logging)
 * - HTTP module types (App, Server, Route, matchers, handlers)
 * - TLS module types (TLS, AutomationConfig, ConnectionPolicy)
 * - Full JSDoc documentation from Go comments
 * - Duration type: `number | string` for Go duration formats
 *
 * @example
 * ```typescript
 * import type { Config, Server, Route } from "@accelerated-software-development/caddy-api-client/caddy-types";
 *
 * const config: Config = {
 *   apps: {
 *     http: {
 *       servers: {
 *         srv0: {
 *           listen: [":443"],
 *           routes: []
 *         }
 *       }
 *     }
 *   }
 * };
 * ```
 *
 * @packageDocumentation
 * @module caddy-types
 */

// Core types (caddy package)
export type * from "./generated/caddy-core";

// HTTP types (caddyhttp package)
// Note: Export with HttpApp alias to avoid conflict with core App type
export type { App as HttpApp } from "./generated/caddy-http";
export type {
  Server,
  Route,
  RouteList,
  MatcherSet,
  RawMatcherSets,
  MatcherSets,
  AutoHTTPSConfig,
  RequestMatcher,
  RequestMatcherWithError,
  Handler,
  HandlerError,
  MiddlewareHandler,
  Invoke,
  ResponseHandler,
  MatchExpression,
  MatchPath,
  MatchPathRE,
  MatchMethod,
  MatchQuery,
  MatchHeader,
  MatchHeaderRE,
  MatchProtocol,
  MatchNot,
  MatchRemoteIP as HttpMatchRemoteIP,
  MatchClientIP,
  MatchHost,
  ServerLogConfig,
  StaticError,
  StaticResponse,
} from "./generated/caddy-http";

// TLS types (caddytls package)
export type {
  TLS,
  AutomationConfig,
  AutomationPolicy,
  ConnectionPolicy,
  ClientAuthentication,
  CertCacheOptions,
  CertificateLoader,
  CustomCertSelectionPolicy,
  ACMEIssuer,
  ChainPreference,
  HTTPChallengeConfig,
  TLSALPNChallengeConfig,
  DNSChallengeConfig,
  InternalIssuer,
  MatchRemoteIP as TlsMatchRemoteIP,
  MatchServerName,
  SessionTicketService,
  StorageLoader,
  FolderLoader,
  ZeroSSLIssuer,
} from "./generated/caddy-tls";

// Zod schemas - Core
export * from "./generated/caddy-core.zod";

// Zod schemas - HTTP (with aliases for conflicts)
export { appSchema as httpAppSchema } from "./generated/caddy-http.zod";
export {
  serverSchema,
  routeSchema,
  routeListSchema,
  autoHttpsConfigSchema,
  invokeSchema,
  responseHandlerSchema,
  matchExpressionSchema,
  matchPathSchema,
  matchPathReSchema,
  matchMethodSchema,
  matchQuerySchema,
  matchHeaderSchema,
  matchHeaderReSchema,
  matchProtocolSchema,
  matchNotSchema,
  matchRemoteIpSchema as httpMatchRemoteIpSchema,
  matchClientIpSchema,
  matchHostSchema,
  serverLogConfigSchema,
  staticErrorSchema,
  staticResponseSchema,
} from "./generated/caddy-http.zod";

// Zod schemas - TLS (with aliases for conflicts)
export {
  tlsSchema,
  automationConfigSchema,
  automationPolicySchema,
  connectionPolicySchema,
  clientAuthenticationSchema,
  certCacheOptionsSchema,
  certificateLoaderSchema,
  customCertSelectionPolicySchema,
  acmeIssuerSchema,
  chainPreferenceSchema,
  httpChallengeConfigSchema,
  tlsalpnChallengeConfigSchema,
  dnsChallengeConfigSchema,
  internalIssuerSchema,
  matchRemoteIpSchema as tlsMatchRemoteIpSchema,
  matchServerNameSchema,
  sessionTicketServiceSchema,
  storageLoaderSchema,
  folderLoaderSchema,
  zeroSslIssuerSchema,
} from "./generated/caddy-tls.zod";
