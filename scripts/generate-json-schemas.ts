/**
 * Generate JSON Schemas from Zod schemas for VSCode extension validation
 *
 * This script converts existing Zod schemas to JSON Schema format for use in:
 * - VSCode JSON language service (autocomplete, validation)
 * - Schema validation in external tools
 * - Documentation generation
 *
 * Generated output: src/generated/schemas/
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const SCHEMAS_DIR = join(ROOT_DIR, "src/generated/schemas");

// ============================================================================
// Import Zod Schemas
// ============================================================================

// Core schemas from src/schemas.ts
import {
  CaddyRouteMatcherSchema,
  CaddyRouteSchema,
  ReverseProxyHandlerSchema,
  HeadersHandlerSchema,
  StaticResponseHandlerSchema,
  EncodeHandlerSchema,
  RewriteHandlerSchema,
  AuthenticationHandlerSchema,
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
} from "../src/schemas.js";

// Security plugin schemas
import {
  SecurityAuthenticatorHandlerSchema,
  SecurityAuthorizationHandlerSchema,
  LocalIdentityStoreSchema,
  LdapIdentityStoreSchema,
  OAuth2IdentityProviderSchema,
  OidcIdentityProviderSchema,
  AuthenticationPortalSchema,
  AuthorizationPolicySchema,
  SecurityConfigSchema,
  SecurityAppSchema,
  IdentityStoreSchema,
} from "../src/plugins/caddy-security/schemas.js";

// Generated core/app schemas (tygo -> zod, always in sync with real Go
// source) — composed below into "caddy-full-config" instead of hand-writing
// a separate, driftable copy of admin/logging/http/tls shapes.
import { adminConfigSchema, loggingSchema } from "../src/generated/caddy-core.zod.js";
import { appSchema as HttpAppSchema, serverSchema } from "../src/generated/caddy-http.zod.js";
import { tlsSchema as TlsAppSchema } from "../src/generated/caddy-tls.zod.js";

// `@id` is a Caddy-wide JSON convention (admin API object addressing,
// stripped before Go struct decoding) -- it isn't a real Go struct field,
// so tygo/zod-to-json-schema generated schemas never allow it, and
// zod-to-json-schema's default `additionalProperties: false` then rejects
// it outright. CaddyRouteSchema (src/schemas.ts) already declares it
// explicitly; the raw generated server/app schemas below don't. Compose a
// route-aware server/http-app schema for the full-config file so nested
// routes in a server config get both "@id" support and the same
// hand-composed matcher fields (tls/protocol/etc, see
// CaddyRouteMatcherSchema's doc comment) that a standalone
// route.caddy.json already gets -- instead of falling back to the raw
// tygo-generated Route type, which has neither.
// CaddyRouteSchema.handle intentionally keeps CaddyRouteHandlerSchema's
// `.passthrough()` shape (see its doc comment in src/schemas.ts): the
// *runtime* npm client must accept legitimate third-party/custom Caddy
// handler modules it hasn't modeled, so it only requires `handler` to be a
// string. For the editor-time schema below, that tradeoff is backwards --
// the whole point of editor validation is catching typos (e.g. reverse_proxy's
// "upstream" vs "upstreams"), so `handle` items are swapped for the strict
// per-handler discriminated union (StrictKnownCaddyHandlerSchema) instead.
// This does mean a genuinely valid but unmodeled handler module gets
// flagged in the editor -- an acceptable, standard trade-off for typed
// editor tooling (same as e.g. a Kubernetes CRD schema rejecting fields it
// doesn't know).
//
// StrictKnownCaddyHandlerSchema/StrictSubrouteHandlerSchema/StrictRouteSchema
// are mutually self-referential (subroute.routes contains more routes,
// which contain more handlers, ...) so a typo inside a nested subroute
// handler gets the exact same strictness the top level does, at any
// nesting depth. This only works because $refStrategy is "root" below: with
// "none" (the previous setting, chosen 2026-01-12 as an unverified cautious
// default -- see 0.9.0's CHANGELOG "Known limitations" entry, now removed),
// zod-to-json-schema hit "Recursive reference detected... Defaulting to
// any" the moment this self-reference was introduced, silently discarding
// all strictness one level below the top. Switching to "root" instead
// emits real `$ref`s into the shared `definitions` block, which both `ajv`
// (see src/__tests__/generated-schemas.test.ts) and VS Code's built-in JSON
// language service (verified live via Playwright/code-server) resolve
// correctly -- confirming the original "none" choice was never actually
// necessary.
const StrictSubrouteHandlerSchema = z.object({
  handler: z.literal("subroute"),
  routes: z.array(z.lazy((): z.ZodTypeAny => StrictRouteSchema)).optional(),
  errors: z.any().optional(),
});

const StrictKnownCaddyHandlerSchema: z.ZodTypeAny = z.discriminatedUnion("handler", [
  ReverseProxyHandlerSchema,
  HeadersHandlerSchema,
  StaticResponseHandlerSchema,
  AuthenticationHandlerSchema,
  RewriteHandlerSchema,
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
  StrictSubrouteHandlerSchema,
  SecurityAuthenticatorHandlerSchema,
]);

const StrictRouteSchema: z.ZodTypeAny = CaddyRouteSchema.extend({
  handle: z.array(StrictKnownCaddyHandlerSchema).min(1, "Route must have at least one handler"),
});

const FullConfigServerSchema = serverSchema.omit({ routes: true, named_routes: true }).extend({
  routes: z.array(StrictRouteSchema).optional(),
  named_routes: z.record(z.string(), StrictRouteSchema).optional(),
});
const FullConfigHttpAppSchema = HttpAppSchema.omit({ servers: true }).extend({
  servers: z.record(z.string(), FullConfigServerSchema).optional(),
});

// ============================================================================
// Schema Definitions
// ============================================================================

interface SchemaDefinition {
  name: string;
  schema: unknown; // Zod schema
  description: string;
  fileMatch?: string[];
}

const schemas: SchemaDefinition[] = [
  // Core Caddy schemas
  {
    name: "caddy-route",
    schema: StrictRouteSchema,
    description: "Caddy HTTP route configuration",
    fileMatch: ["**/caddy-route.json", "**/*.caddy-route.json"],
  },
  {
    name: "caddy-route-matcher",
    schema: CaddyRouteMatcherSchema,
    description: "Caddy route matcher (host, path, method, etc.)",
  },
  {
    name: "caddy-handler",
    schema: StrictKnownCaddyHandlerSchema,
    description: "Caddy HTTP handler (reverse_proxy, headers, etc.)",
  },

  // Individual handler schemas for fine-grained validation
  {
    name: "caddy-handler-reverse-proxy",
    schema: ReverseProxyHandlerSchema,
    description: "Caddy reverse proxy handler configuration",
  },
  {
    name: "caddy-handler-headers",
    schema: HeadersHandlerSchema,
    description: "Caddy headers handler configuration",
  },
  {
    name: "caddy-handler-static-response",
    schema: StaticResponseHandlerSchema,
    description: "Caddy static response handler configuration",
  },
  {
    name: "caddy-handler-encode",
    schema: EncodeHandlerSchema,
    description: "Caddy encode/compression handler configuration",
  },
  {
    name: "caddy-handler-rewrite",
    schema: RewriteHandlerSchema,
    description: "Caddy rewrite handler configuration",
  },
  {
    name: "caddy-handler-authentication",
    schema: AuthenticationHandlerSchema,
    description: "Caddy authentication handler configuration",
  },

  // Security plugin schemas
  {
    name: "caddy-security-authenticator",
    schema: SecurityAuthenticatorHandlerSchema,
    description: "caddy-security authenticator portal handler",
  },
  {
    name: "caddy-security-authorization",
    schema: SecurityAuthorizationHandlerSchema,
    description: "caddy-security authorization handler",
  },
  {
    name: "caddy-security-local-store",
    schema: LocalIdentityStoreSchema,
    description: "caddy-security local identity store configuration",
  },
  {
    name: "caddy-security-ldap-store",
    schema: LdapIdentityStoreSchema,
    description: "caddy-security LDAP identity store configuration",
  },
  {
    name: "caddy-security-oauth2-provider",
    schema: OAuth2IdentityProviderSchema,
    description: "caddy-security OAuth2 identity provider configuration",
  },
  {
    name: "caddy-security-oidc-provider",
    schema: OidcIdentityProviderSchema,
    description: "caddy-security OIDC identity provider configuration",
  },
  {
    name: "caddy-security-identity-store",
    schema: IdentityStoreSchema,
    description: "caddy-security identity store (local, LDAP, OAuth2, OIDC)",
  },
  {
    name: "caddy-security-portal",
    schema: AuthenticationPortalSchema,
    description: "caddy-security authentication portal configuration",
    fileMatch: [
      "**/.caddy-security-portal.json",
      "**/caddy-security-portal.json",
      "**/*.caddy-security-portal.json",
    ],
  },
  {
    name: "caddy-security-policy",
    schema: AuthorizationPolicySchema,
    description: "caddy-security authorization policy (gatekeeper) configuration",
    fileMatch: [
      "**/.caddy-security-policy.json",
      "**/caddy-security-policy.json",
      "**/*.caddy-security-policy.json",
    ],
  },
  {
    name: "caddy-security-config",
    schema: SecurityConfigSchema,
    description: "caddy-security configuration (portals, policies, identity stores)",
    fileMatch: [
      "**/.caddy-security.json",
      "**/caddy-security.json",
      "**/security-config.json",
      "**/*.caddy-security.json",
    ],
  },
  {
    name: "caddy-security-app",
    schema: SecurityAppSchema,
    description: "Complete caddy-security app configuration for /config/apps/security",
    fileMatch: ["**/security-app.json"],
  },
  {
    name: "caddy-full-config",
    // Composed entirely from already-generated/already-correct schemas —
    // admin/logging from the tygo-generated Caddy core types, http/tls from
    // their respective generated app schemas, security from the
    // caddy-security plugin's own (Go-source-verified) schema. Previously
    // this file was hand-written once and never regenerated, drifting
    // stale relative to real Caddy (e.g. admin was missing `config`,
    // `identity`, `remote`; the security portion used the pre-0.6.0
    // `access_lists`/flat-identity-store format).
    schema: z.object({
      admin: adminConfigSchema.optional(),
      logging: loggingSchema.optional(),
      apps: z
        .object({
          http: FullConfigHttpAppSchema.optional(),
          tls: TlsAppSchema.optional(),
          security: SecurityAppSchema.optional(),
        })
        .optional(),
    }),
    description: "Complete Caddy server configuration (admin, logging, apps: http/tls/security)",
    fileMatch: ["**/caddy-server.json", "**/caddy-full.json", "**/*.caddy-server.json"],
  },
];

// ============================================================================
// Generation Logic
// ============================================================================

/**
 * "@id" is a Caddy-wide admin-API object-addressing convention (stripped
 * before Go struct decoding) that's valid on virtually ANY JSON object in a
 * Caddy config -- not just module containers, but matcher objects, upstream
 * entries, anywhere -- verified against real `caddy validate` (an object
 * with "@id" on a matcher, a handler, and an upstream entry all validated
 * successfully). It's therefore not a real Go struct field, so no
 * tygo/zod-to-json-schema-generated schema ever includes it on its own.
 *
 * Hand-adding "@id" wherever we happen to notice it's missing is exactly
 * how it went missing in the first place (see the 0.9.0 changelog entry
 * for caddy-server.json). Instead, walk every generated schema after the
 * fact and add it to every strict (additionalProperties:false) object node
 * -- new schemas get this automatically, with nothing to remember.
 */
function injectUniversalId(node: unknown): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      injectUniversalId(item);
    }
    return;
  }

  const obj = node as Record<string, unknown>;

  if (
    obj.type === "object" &&
    obj.additionalProperties === false &&
    typeof obj.properties === "object" &&
    obj.properties !== null
  ) {
    const properties = obj.properties as Record<string, unknown>;
    if (!("@id" in properties)) {
      properties["@id"] = { type: "string" };
    }
  }

  // Recurse into every place a subschema can live: object properties,
  // array items, additionalProperties-as-schema (z.record()'s value type),
  // and union branches (anyOf/oneOf/allOf, e.g. discriminated unions).
  for (const key of ["properties", "definitions", "patternProperties"]) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      for (const value of Object.values(obj[key] as Record<string, unknown>)) {
        injectUniversalId(value);
      }
    }
  }
  if (typeof obj.additionalProperties === "object") {
    injectUniversalId(obj.additionalProperties);
  }
  injectUniversalId(obj.items);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(obj[key])) {
      injectUniversalId(obj[key]);
    }
  }
}

function generateJsonSchema(definition: SchemaDefinition): object {
  const jsonSchema = zodToJsonSchema(definition.schema as Parameters<typeof zodToJsonSchema>[0], {
    name: definition.name,
    // "root" (not the previous "none"): emits real `$ref`s into a shared
    // `definitions` block instead of inlining everything, which is what
    // makes the self-referential Strict*Schema definitions above express
    // true recursion (subroute -> routes -> handlers -> subroute -> ...)
    // instead of bottoming out at a permissive `{}` -- verified against
    // both `ajv` and VS Code's built-in JSON language service (see this
    // file's comment above StrictSubrouteHandlerSchema). Also shrinks the
    // generated files substantially (caddy-full-config.json: 223KB -> 121KB).
    $refStrategy: "root",
    target: "jsonSchema7", // Use JSON Schema draft-07 for broad compatibility
  });

  injectUniversalId(jsonSchema);

  // Enrich with metadata
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: `https://asd-engineering.github.io/asd-caddy-api-client/schemas/${definition.name}.json`,
    title: definition.name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
    description: definition.description,
    ...jsonSchema,
  };
}

function generateCatalog(schemas: SchemaDefinition[]): {
  schemas: { name: string; description: string; url: string; fileMatch?: string[] }[];
} {
  return {
    schemas: schemas.map((s) => ({
      name: s.name,
      description: s.description,
      url: `./${s.name}.json`,
      ...(s.fileMatch && { fileMatch: s.fileMatch }),
    })),
  };
}

function generateVSCodeSettings(schemas: SchemaDefinition[]): object {
  const associations: Record<string, string> = {};

  for (const schema of schemas) {
    if (schema.fileMatch) {
      for (const pattern of schema.fileMatch) {
        associations[pattern] = `./src/generated/schemas/${schema.name}.json`;
      }
    }
  }

  return {
    "json.schemas": Object.entries(associations).map(([fileMatch, url]) => ({
      fileMatch: [fileMatch],
      url,
    })),
  };
}

// ============================================================================
// Main
// ============================================================================

console.log("Generating JSON Schemas from Zod schemas...\n");

// Ensure output directory exists
if (!existsSync(SCHEMAS_DIR)) {
  mkdirSync(SCHEMAS_DIR, { recursive: true });
}

let successCount = 0;
let failCount = 0;

for (const definition of schemas) {
  try {
    const jsonSchema = generateJsonSchema(definition);
    const outputPath = join(SCHEMAS_DIR, `${definition.name}.json`);
    writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2));
    console.log(`  ✓ ${definition.name}.json`);
    successCount++;
  } catch (error) {
    console.error(`  ✗ ${definition.name}.json - ${error}`);
    failCount++;
  }
}

// Generate catalog file
const catalog = generateCatalog(schemas);
writeFileSync(join(SCHEMAS_DIR, "catalog.json"), JSON.stringify(catalog, null, 2));
console.log(`  ✓ catalog.json`);

// Generate VSCode settings example
const vscodeSettings = generateVSCodeSettings(schemas);
writeFileSync(
  join(SCHEMAS_DIR, "vscode-settings.example.json"),
  JSON.stringify(vscodeSettings, null, 2)
);
console.log(`  ✓ vscode-settings.example.json`);

console.log(`\nGenerated ${successCount} schemas (${failCount} failed)`);
console.log(`Output directory: ${SCHEMAS_DIR}`);
