/**
 * Known-valid seed configs for the differential fuzz-testing harness: one
 * per matcher, handler, and caddy-security schema. Mutated by mutate.ts and
 * checked by three-way-check.ts.
 */
import {
  ReverseProxyHandlerSchema,
  RewriteHandlerSchema,
  StaticResponseHandlerSchema,
  SubrouteHandlerSchema,
  CaddyRouteMatcherSchema,
  HeadersHandlerSchema,
  EncodeHandlerSchema,
  FileServerHandlerSchema,
  TemplatesHandlerSchema,
  MapHandlerSchema,
  PushHandlerSchema,
  RequestBodyHandlerSchema,
  VarsHandlerSchema,
  InterceptHandlerSchema,
  InvokeHandlerSchema,
  TracingHandlerSchema,
  LogAppendHandlerSchema,
  ErrorHandlerSchema,
  CopyResponseHandlerSchema,
  CopyResponseHeadersHandlerSchema,
  AuthenticationHandlerSchema,
} from "../../schemas.js";
import {
  LocalIdentityStoreSchema,
  LdapIdentityStoreSchema,
  OAuth2IdentityProviderSchema,
  OidcIdentityProviderSchema,
  AuthenticationPortalSchema,
  AuthorizationPolicySchema,
  SecurityAuthenticatorHandlerSchema,
  SecurityAuthorizationHandlerSchema,
} from "../../plugins/caddy-security/schemas.js";
import { getTemplateById } from "../../plugins/caddy-security/templates.js";
import { wrapAsFullConfig } from "./three-way-check.js";
import { z } from "zod";

/**
 * Individual schemas are non-strict at the Zod level (runtime accepts extra
 * fields; strictness is enforced by the generated JSON schema/ajv instead).
 * Strictify here so seeds compare like-for-like against ajv. Schemas that
 * are deliberately `.passthrough()` (e.g. VarsHandlerSchema) are left alone,
 * since `.strict()` would silently override that intent.
 */
function strictify(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodObject && schema._def.unknownKeys !== "passthrough") {
    return schema.strict();
  }
  return schema;
}

export interface Seed {
  name: string;
  /** Full object to validate, e.g. a match object `{host: [...]}` or a handler `{handler: "...", ...}`. */
  value: Record<string, unknown>;
  /** Top-level keys worth mutating (typo'd/wrong-typed). Usually all keys present in `value`. */
  mutableFields: string[];
  /** Top-level keys that must be present for the seed to be valid (targeted by remove-required). */
  requiredFields: string[];
  zodSchema: z.ZodTypeAny;
  /** Name of the file under src/generated/schemas/ to ajv-validate against. */
  jsonSchemaFile: string;
  /**
   * Wraps `value` into a full Caddy config for the real-`caddy validate`
   * leg. Omit for caddy-security schemas -- `caddy validate` panics
   * provisioning the security app, so those seeds are Zod-vs-ajv only.
   */
  toCaddyConfig?: (value: unknown) => object;
}

// ============================================================================
// Matchers -- one full match object per matcher, verified shapes reused from
// src/schemas.ts's own doc comments / src/__tests__/schemas.test.ts.
// ============================================================================

function matchSeed(name: string, value: Record<string, unknown>): Seed {
  return {
    name: `matcher:${name}`,
    value,
    mutableFields: Object.keys(value),
    requiredFields: Object.keys(value),
    zodSchema: strictify(CaddyRouteMatcherSchema),
    jsonSchemaFile: "caddy-route-matcher.json",
    toCaddyConfig: (v) =>
      wrapAsFullConfig({
        match: [v as Record<string, unknown>],
        handle: [{ handler: "static_response", body: "hi" }],
      }),
  };
}

export const MATCHER_SEEDS: Seed[] = [
  matchSeed("host", { host: ["example.com"] }),
  matchSeed("path", { path: ["/api/*"] }),
  matchSeed("path_regexp", { path_regexp: { pattern: "^/api/.*$" } }),
  matchSeed("method", { method: ["GET", "POST"] }),
  matchSeed("header", { header: { "X-Custom": ["value"] } }),
  matchSeed("header_regexp", { header_regexp: { "X-Custom": { pattern: "^v.*$" } } }),
  matchSeed("query", { query: { debug: ["true"] } }),
  matchSeed("client_ip", { client_ip: { ranges: ["10.0.0.0/8"] } }),
  matchSeed("remote_ip", { remote_ip: { ranges: ["10.0.0.0/8"] } }),
  matchSeed("protocol", { protocol: "https" }),
  matchSeed("tls", { tls: { handshake_complete: true } }),
  matchSeed("file", { file: { try_files: ["{path}", "{path}/index.html"] } }),
  matchSeed("expression", { expression: "{http.request.method} == 'GET'" }),
  matchSeed("not", { not: [{ host: ["excluded.example.com"] }] }),
];

// ============================================================================
// Handlers -- all 20 core Caddy handlers (KnownCaddyHandlerSchema's
// discriminated union minus the caddy-security "authenticator" plugin
// handler, covered separately under Security below). Minimal-valid shapes
// drawn from src/__tests__/handler-validation.test.ts's own "validates
// minimal config" cases and each schema's own @example JSDoc. Wired into
// the full caddy-handler.json (anyOf of all handlers) for the ajv leg,
// since that's the actual editor schema VS Code validates against.
// ============================================================================

function handlerSeed(
  name: string,
  value: Record<string, unknown>,
  zodSchema: z.ZodTypeAny,
  mutableFields: string[]
): Seed {
  return {
    name: `handler:${name}`,
    value,
    mutableFields,
    requiredFields: ["handler"],
    zodSchema: strictify(zodSchema),
    jsonSchemaFile: "caddy-handler.json",
    toCaddyConfig: (v) => wrapAsFullConfig({ handle: [v as Record<string, unknown>] }),
  };
}

export const HANDLER_SEEDS: Seed[] = [
  handlerSeed(
    "reverse_proxy",
    { handler: "reverse_proxy", upstreams: [{ dial: "localhost:3000" }] },
    ReverseProxyHandlerSchema,
    ["upstreams"]
  ),
  handlerSeed("rewrite", { handler: "rewrite", uri: "/new/path" }, RewriteHandlerSchema, ["uri"]),
  handlerSeed(
    "static_response",
    { handler: "static_response", status_code: 200, body: "hello" },
    StaticResponseHandlerSchema,
    ["status_code", "body"]
  ),
  handlerSeed(
    "subroute",
    {
      handler: "subroute",
      routes: [
        { match: [{ path: ["/api/*"] }], handle: [{ handler: "static_response", body: "hi" }] },
      ],
    },
    SubrouteHandlerSchema,
    ["routes"]
  ),
  handlerSeed(
    "headers",
    { handler: "headers", response: { set: { "X-Content-Type-Options": ["nosniff"] } } },
    HeadersHandlerSchema,
    ["response"]
  ),
  handlerSeed(
    "encode",
    { handler: "encode", encodings: { gzip: {}, zstd: {} }, prefer: ["zstd", "gzip"] },
    EncodeHandlerSchema,
    ["encodings", "prefer", "minimum_length"]
  ),
  handlerSeed(
    "file_server",
    { handler: "file_server", root: "/var/www/html", index_names: ["index.html"] },
    FileServerHandlerSchema,
    ["root", "index_names"]
  ),
  handlerSeed(
    "templates",
    { handler: "templates", file_root: "/var/www/templates", mime_types: ["text/html"] },
    TemplatesHandlerSchema,
    ["file_root", "mime_types"]
  ),
  handlerSeed(
    "map",
    {
      handler: "map",
      source: "{http.request.uri.path}",
      destinations: ["{my_var}"],
    },
    MapHandlerSchema,
    ["source", "destinations"]
  ),
  handlerSeed(
    "push",
    { handler: "push", resources: [{ target: "/css/style.css" }] },
    PushHandlerSchema,
    ["resources"]
  ),
  handlerSeed(
    "request_body",
    { handler: "request_body", max_size: 10485760 },
    RequestBodyHandlerSchema,
    ["max_size"]
  ),
  handlerSeed("vars", { handler: "vars", environment: "production" }, VarsHandlerSchema, [
    "environment",
  ]),
  handlerSeed("intercept", { handler: "intercept" }, InterceptHandlerSchema, []),
  handlerSeed("invoke", { handler: "invoke", name: "my-named-route" }, InvokeHandlerSchema, [
    "name",
  ]),
  handlerSeed("tracing", { handler: "tracing", span: "http.request" }, TracingHandlerSchema, [
    "span",
  ]),
  handlerSeed(
    "log_append",
    { handler: "log_append", key: "request_id", value: "{http.request.header.X-Request-ID}" },
    LogAppendHandlerSchema,
    ["key", "value"]
  ),
  handlerSeed(
    "error",
    { handler: "error", error: "Resource not found", status_code: "404" },
    ErrorHandlerSchema,
    ["error", "status_code"]
  ),
  handlerSeed(
    "copy_response",
    { handler: "copy_response", status_code: 200 },
    CopyResponseHandlerSchema,
    ["status_code"]
  ),
  handlerSeed(
    "copy_response_headers",
    { handler: "copy_response_headers", include: ["Content-Type", "X-Custom-*"] },
    CopyResponseHeadersHandlerSchema,
    ["include"]
  ),
  handlerSeed(
    "authentication",
    {
      handler: "authentication",
      providers: {
        http_basic: { accounts: [{ username: "admin", password: "$2a$14$hash" }], realm: "Admin" },
      },
    },
    AuthenticationHandlerSchema,
    ["providers"]
  ),
];

// ============================================================================
// caddy-security schemas -- Zod-vs-ajv only (see toCaddyConfig doc comment
// on the Seed interface for why the real-caddy leg is skipped here). Seeds
// come from the real, `SECURITY_TEMPLATES`-validated builder outputs where
// a template exists.
// ============================================================================

function securitySchemaSeed(
  name: string,
  templateId: string,
  zodSchema: z.ZodTypeAny,
  jsonSchemaFile: string,
  requiredFields: string[]
): Seed {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error(`No SECURITY_TEMPLATES entry for id "${templateId}"`);
  }
  const value = template.build() as Record<string, unknown>;
  return {
    name: `security:${name}`,
    value,
    mutableFields: Object.keys(value),
    requiredFields,
    zodSchema: strictify(zodSchema),
    jsonSchemaFile,
  };
}

export const SECURITY_SEEDS: Seed[] = [
  securitySchemaSeed(
    "local-identity-store",
    "caddy-sec-local-store",
    LocalIdentityStoreSchema,
    "caddy-security-local-store.json",
    ["name", "kind", "params"]
  ),
  securitySchemaSeed(
    "ldap-identity-store",
    "caddy-sec-ldap-store",
    LdapIdentityStoreSchema,
    "caddy-security-ldap-store.json",
    ["name", "kind", "params"]
  ),
  securitySchemaSeed(
    "oauth2-provider",
    "caddy-sec-oauth2-github",
    OAuth2IdentityProviderSchema,
    "caddy-security-oauth2-provider.json",
    ["name", "kind", "params"]
  ),
  securitySchemaSeed(
    "oidc-provider",
    "caddy-sec-oidc-keycloak",
    OidcIdentityProviderSchema,
    "caddy-security-oidc-provider.json",
    ["name", "kind", "params"]
  ),
  securitySchemaSeed(
    "portal",
    "caddy-sec-portal-basic",
    AuthenticationPortalSchema,
    "caddy-security-portal.json",
    ["name", "identity_stores"]
  ),
  securitySchemaSeed(
    "policy",
    "caddy-sec-policy-basic",
    AuthorizationPolicySchema,
    "caddy-security-policy.json",
    ["name"]
  ),
  {
    name: "security:authenticator-handler",
    value: { handler: "authenticator", portal_name: "myportal" },
    mutableFields: ["handler", "portal_name"],
    requiredFields: ["handler"],
    zodSchema: strictify(SecurityAuthenticatorHandlerSchema),
    jsonSchemaFile: "caddy-security-authenticator.json",
  },
  {
    name: "security:authorization-handler",
    value: {
      handler: "authentication",
      providers: { authorizer: { gatekeeper_name: "mygatekeeper" } },
    },
    mutableFields: ["handler", "providers"],
    requiredFields: ["handler", "providers"],
    zodSchema: strictify(SecurityAuthorizationHandlerSchema),
    jsonSchemaFile: "caddy-security-authorization.json",
  },
];

export const ALL_SEEDS: Seed[] = [...MATCHER_SEEDS, ...HANDLER_SEEDS, ...SECURITY_SEEDS];
