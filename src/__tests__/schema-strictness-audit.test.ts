/**
 * Audits every generated JSON schema for object nodes that don't reject
 * unknown properties (additionalProperties: true, or simply unset).
 *
 * Born from a real bug: caddy-route.json's `handle` items were fully
 * permissive (any extra/misspelled field silently accepted), which meant
 * a typo like "upstream" instead of "upstreams" produced no warning at
 * all in the editor (see the 0.9.0 changelog entry). That was found by a
 * human manually testing the extension, not by any automated check.
 *
 * This test can't tell us whether a *new* permissive spot is a real gap
 * or a considered design choice -- but it can make sure every permissive
 * spot is a *known, named* one, by requiring it to appear in the
 * PERMISSIVE_FIELDS allowlist below with a reason. A field that becomes
 * permissive without anyone adding it here fails the test immediately,
 * instead of silently shipping (which is exactly what happened before).
 *
 * Each entry's `verified` flag distinguishes two different situations:
 * - true: cross-checked against the Zod source's own doc comment/intent
 *   (e.g. "ensure nested fields like groups are preserved").
 * - false: passthrough exists in the source but with no explanation for
 *   why -- kept permissive rather than guessed-and-locked-down, but
 *   flagged here as an honest "not yet audited" gap rather than silently
 *   treated as equivalent to a verified one.
 */
import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const schemasDir = join(__dirname, "../generated/schemas");
const schemaFiles = readdirSync(schemasDir)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => !f.includes("catalog") && !f.includes("example"));

type JsonSchemaNode = Record<string, unknown>;

/**
 * Canonical, schema-file-independent label for a permissive node -- e.g.
 * "handler:reverse_proxy.transport" identifies the same underlying Zod
 * field regardless of whether it's reached via caddy-route.json,
 * caddy-handler.json, or caddy-full-config.json's nested copy of it.
 * Union branches are labeled by their own discriminator const (handler/
 * kind/driver/policy) when present, falling back to their index.
 */
const DISCRIMINATOR_KEYS = ["handler", "kind", "driver", "policy"];

/** Reads a discriminator const (e.g. `handler: "reverse_proxy"`) off an object's own properties, if any. */
function discriminatorOf(obj: JsonSchemaNode): string | null {
  const properties = obj.properties;
  if (typeof properties !== "object" || properties === null) {
    return null;
  }
  for (const discKey of DISCRIMINATOR_KEYS) {
    const p = (properties as Record<string, unknown>)[discKey] as JsonSchemaNode | undefined;
    if (p && typeof p === "object" && "const" in p) {
      return `${discKey}:${String(p.const)}`;
    }
  }
  return null;
}

function walk(
  node: unknown,
  trail: string[],
  schemaFile: string,
  results: Map<string, { schemaFile: string; additionalProperties: unknown }>
): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, trail, schemaFile, results);
    }
    return;
  }

  const obj = node as JsonSchemaNode;

  // Reset the trail at every discriminated object (one that carries its
  // own handler/kind/driver/policy const), regardless of how deeply it's
  // nested in whichever composed schema reached it -- this is what makes
  // labels comparable across caddy-route.json / caddy-handler.json /
  // caddy-full-config.json's copies of the exact same underlying field.
  const discriminator = discriminatorOf(obj);
  const localTrail = discriminator ? [discriminator] : trail;

  if (obj.type === "object" && typeof obj.properties === "object" && obj.properties !== null) {
    const ap = obj.additionalProperties;
    if (ap === true || ap === undefined) {
      const label = localTrail.join(".") || "(root)";
      if (!results.has(label)) {
        results.set(label, { schemaFile, additionalProperties: ap });
      }
    }
  }

  if (typeof obj.properties === "object" && obj.properties !== null) {
    for (const [key, value] of Object.entries(obj.properties as Record<string, unknown>)) {
      walk(value, [...localTrail, key], schemaFile, results);
    }
  }
  if (typeof obj.definitions === "object" && obj.definitions !== null) {
    for (const value of Object.values(obj.definitions as Record<string, unknown>)) {
      walk(value, localTrail, schemaFile, results); // wrapper only, not a real path segment
    }
  }
  if (typeof obj.additionalProperties === "object" && obj.additionalProperties !== null) {
    walk(obj.additionalProperties, [...localTrail, "*"], schemaFile, results);
  }
  if (obj.items !== undefined) {
    walk(obj.items, [...localTrail, "[]"], schemaFile, results);
  }

  for (const unionKey of ["anyOf", "oneOf", "allOf"]) {
    const branches = obj[unionKey];
    if (!Array.isArray(branches)) continue;
    branches.forEach((branch, index) => {
      const branchDiscriminator =
        branch && typeof branch === "object" ? discriminatorOf(branch as JsonSchemaNode) : null;
      walk(
        branch,
        [...localTrail, branchDiscriminator ?? `${unionKey}[${index}]`],
        schemaFile,
        results
      );
    });
  }
}

function findPermissiveFields(): Map<
  string,
  { schemaFile: string; additionalProperties: unknown }
> {
  const results = new Map<string, { schemaFile: string; additionalProperties: unknown }>();
  for (const file of schemaFiles) {
    const schema = JSON.parse(readFileSync(join(schemasDir, file), "utf-8"));
    walk(schema, [], file, results);
  }
  return results;
}

/**
 * Every currently-permissive field, with a reason. Update this when you
 * intentionally add a new passthrough field -- if the test fails on an
 * unlisted label, that's the point: go verify whether it's deliberate.
 */
const PERMISSIVE_FIELDS: Record<string, { reason: string; verified: boolean }> = {
  "handler:reverse_proxy.load_balancing.selection_policy": {
    reason:
      "Some policies need extra fields beyond `policy` (e.g. cookie needs name/secret/fallback, header needs a field name) -- passthrough avoids a full per-policy discriminated union here. Cross-referenced against the real cookieHashSelectionSchema fields this session.",
    verified: true,
  },
  "handler:reverse_proxy.transport": {
    reason:
      "Transport modules (http, fastcgi, ...) have very different field sets; only `protocol` is validated, the rest passes through.",
    verified: true,
  },
  "handler:reverse_proxy.circuit_breaker": {
    reason: "Only `type` is validated; circuit breaker module fields vary by type.",
    verified: true,
  },
  "handler:reverse_proxy.dynamic_upstreams": {
    reason: "Only `source` is validated; dynamic upstream source module fields vary by source.",
    verified: true,
  },
  "handler:reverse_proxy.rewrite": {
    reason: "Only the common uri/strip_path_* fields are validated; passthrough for the rest.",
    verified: true,
  },
  "handler:reverse_proxy.handle_response.[]": {
    reason: "Response-handler entries carry arbitrary nested handler config beyond match/routes.",
    verified: true,
  },
  "handler:reverse_proxy.handle_response.[].match": {
    reason: "Only `status_code` is validated; response matchers may carry other match fields.",
    verified: true,
  },
  "handler:encode.encodings": {
    reason:
      "Encoding names beyond gzip/zstd/br (any registered encode module) are allowed through.",
    verified: true,
  },
  "handler:encode.encodings.gzip": {
    reason: "Per-encoding options (e.g. compression level) aren't individually modeled.",
    verified: true,
  },
  "handler:encode.encodings.zstd": {
    reason: "Per-encoding options (e.g. compression level) aren't individually modeled.",
    verified: true,
  },
  "handler:encode.encodings.br": {
    reason: "Per-encoding options (e.g. compression level) aren't individually modeled.",
    verified: true,
  },
  "handler:vars": {
    reason:
      "The vars handler's entire purpose is setting arbitrary caller-defined key/value pairs -- there is no fixed field set to validate against.",
    verified: true,
  },
  "kind:ldap.params": {
    reason:
      "LdapIdentityStoreParamsSchema is a real typed schema; passthrough only preserves extra fields like nested `groups` config beyond what's explicitly modeled.",
    verified: true,
  },
  "kind:oauth.params.anyOf[0]": {
    reason:
      "IdentityProviderSchema's generic `kind: \"oauth\"` covers both OAuth2 and OIDC providers (both literally use kind:oauth per authcrunch's own convention) with params: z.union([OAuth2IdentityProviderParamsSchema, OidcIdentityProviderParamsSchema]) -- this is the OAuth2 branch. See IdentityProviderSchema's doc comment for why params stays permissive.",
    verified: true,
  },
  "kind:oauth.params.anyOf[1]": {
    reason:
      "Same field as kind:oauth.params.anyOf[0] above -- this is the OIDC branch of the same params union.",
    verified: true,
  },
  "apps.security.secrets_managers.[]": {
    reason:
      "SecretsManagerSchema only validates `driver` (a plain string, not a literal/const, so it doesn't get its own discriminator-reset label, and its wrapping prefix isn't reset either since 'apps.security' has no discriminator itself); per-driver secret manager config isn't individually modeled yet.",
    verified: false,
  },
  "secrets_managers.[]": {
    reason:
      "Same field as apps.security.secrets_managers.[] above -- this is the label when reached via caddy-security-app.json, whose root already IS the security app object (so there's no 'apps.security' prefix to reset from).",
    verified: false,
  },
};

describe("Editor schema strictness audit", () => {
  test("every permissive (non-strict) object field is a known, justified one", () => {
    const found = findPermissiveFields();
    const unknown = [...found.keys()].filter((label) => !(label in PERMISSIVE_FIELDS));

    expect(
      unknown,
      `Found new permissive field(s) not in PERMISSIVE_FIELDS: ${unknown.join(", ")}. ` +
        `This means a schema change made a field accept unknown/misspelled properties ` +
        `without anyone deciding that on purpose -- exactly how the "upstream" vs ` +
        `"upstreams" typo silently passed validation before. Either add strict ` +
        `properties/additionalProperties:false to the Zod schema, or -- if the ` +
        `permissiveness is genuinely intentional -- add an entry here explaining why.`
    ).toEqual([]);
  });

  test("PERMISSIVE_FIELDS doesn't list fields that are no longer permissive", () => {
    // Catches the opposite drift: a field we once had to leave open got
    // properly typed later, but nobody removed its allowlist entry --
    // letting it silently regress back to permissive without this test
    // noticing, since a *listed* entry never fails the test above.
    const found = findPermissiveFields();
    const stale = Object.keys(PERMISSIVE_FIELDS).filter((label) => !found.has(label));

    expect(
      stale,
      `PERMISSIVE_FIELDS lists field(s) that are no longer permissive in the generated ` +
        `schemas: ${stale.join(", ")}. Remove them from the allowlist.`
    ).toEqual([]);
  });

  test("logs unverified permissive fields for visibility", () => {
    const unverified = Object.entries(PERMISSIVE_FIELDS).filter(([, v]) => !v.verified);
    if (unverified.length > 0) {
      console.log(
        `\n${unverified.length} permissive field(s) are allowlisted but NOT verified as intentional:\n` +
          unverified.map(([label, v]) => `  - ${label}: ${v.reason}`).join("\n")
      );
    }
    // Informational only -- doesn't fail. Move entries to verified:true
    // once their Zod schema is either tightened or given a real
    // "this is intentional because..." doc comment.
    expect(true).toBe(true);
  });
});
