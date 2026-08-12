/**
 * Known-valid seed configs for the differential fuzz-testing harness (0.10
 * priority 6) -- one per matcher, one per representative handler, one per
 * caddy-security schema. Each is mutated by mutate.ts and checked by
 * three-way-check.ts. Shapes are drawn from already-verified examples
 * elsewhere in this repo rather than invented fresh (see each seed's
 * comment for its source).
 */
import {
  ReverseProxyHandlerSchema,
  RewriteHandlerSchema,
  StaticResponseHandlerSchema,
  SubrouteHandlerSchema,
  CaddyRouteMatcherSchema,
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
 * The individual handler/matcher/security schemas (ReverseProxyHandlerSchema,
 * CaddyRouteMatcherSchema, LocalIdentityStoreSchema, ...) are deliberately
 * NOT `.strict()` at the Zod level -- that's an intentional, documented
 * tradeoff (see e.g. CaddyRouteHandlerSchema's doc comment in schemas.ts):
 * the *runtime* npm client accepts unmodeled extra fields, and strictness is
 * enforced only at the generated-JSON-schema/editor layer instead. Zod's
 * default (non-strict) `.safeParse()` therefore silently strips unknown
 * keys and reports success -- the well-known Zod-vs-ajv gap this whole
 * project has run into repeatedly. For this harness to compare like-for-like
 * against `ajv` (which always has `additionalProperties: false` from the
 * generator), every seed's Zod schema is strictified here so an
 * "add-unknown-key"/"typo-field" mutation is judged by the same standard
 * both validators actually apply at the editor layer.
 */
function strictify(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema instanceof z.ZodObject ? schema.strict() : schema;
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
   * leg. Omit for caddy-security schemas -- `caddy validate` itself panics
   * provisioning the security app (confirmed by hand this session against
   * androw/caddy-security:2.11.2_1.1.59), so those seeds are Zod-vs-ajv only.
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
// Handlers -- representative slice (0.10 priority 6 rollout step 1):
// reverse_proxy, rewrite, static_response, subroute. Wired into the full
// caddy-handler.json (all 21 handlers, anyOf) for the ajv leg, since that's
// the actual editor schema VS Code validates against.
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
