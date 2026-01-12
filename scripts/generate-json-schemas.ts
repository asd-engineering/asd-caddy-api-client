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
  KnownCaddyHandlerSchema,
  ReverseProxyHandlerSchema,
  HeadersHandlerSchema,
  StaticResponseHandlerSchema,
  EncodeHandlerSchema,
  RewriteHandlerSchema,
  AuthenticationHandlerSchema,
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
    schema: CaddyRouteSchema,
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
    schema: KnownCaddyHandlerSchema,
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
    fileMatch: ["**/.caddy-security-portal.json", "**/caddy-security-portal.json"],
  },
  {
    name: "caddy-security-policy",
    schema: AuthorizationPolicySchema,
    description: "caddy-security authorization policy (gatekeeper) configuration",
    fileMatch: ["**/.caddy-security-policy.json", "**/caddy-security-policy.json"],
  },
  {
    name: "caddy-security-config",
    schema: SecurityConfigSchema,
    description: "caddy-security configuration (portals, policies, identity stores)",
    fileMatch: ["**/.caddy-security.json", "**/caddy-security.json"],
  },
  {
    name: "caddy-security-app",
    schema: SecurityAppSchema,
    description: "Complete caddy-security app configuration for /config/apps/security",
    fileMatch: ["**/security-app.json"],
  },
];

// ============================================================================
// Generation Logic
// ============================================================================

function generateJsonSchema(definition: SchemaDefinition): object {
  const jsonSchema = zodToJsonSchema(definition.schema as Parameters<typeof zodToJsonSchema>[0], {
    name: definition.name,
    $refStrategy: "none", // Inline all definitions for better VSCode support
    target: "jsonSchema7", // Use JSON Schema draft-07 for broad compatibility
  });

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
