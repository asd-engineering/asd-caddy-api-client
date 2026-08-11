/**
 * Automated drift guard for CaddyRouteMatcherSchema.
 *
 * Born from a real bug (see the doc comment on `CaddyRouteMatcherSchema` in
 * `../schemas.ts` and its commit message): the schema silently dropped
 * `protocol`/`remote_ip`/etc. because it was hand-written once and never
 * updated as real Caddy matchers were discovered. This test reads the
 * *live* tygo-generated source (`src/generated/caddy-http.ts`) at test
 * time — not a hardcoded snapshot — so a future `local/caddy` version bump
 * that adds a brand-new `http.matchers.*` module fails this test loudly,
 * instead of silently shipping a schema that drops it.
 *
 * This can't be fully automatic: Caddy's JSON matcher key (e.g.
 * `path_regexp`) isn't mechanically derivable from its Go type name (e.g.
 * `MatchPathRE`) — `RE` doesn't expand to `regexp` by any naming
 * convention. So the mapping below is hand-verified (see each entry's
 * comment) and the test's job is to *notice when the generated source adds
 * a Go type this mapping doesn't know about yet*, forcing a human to go
 * verify + add it, rather than silently missing it.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { CaddyRouteMatcherSchema } from "../schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_HTTP_TYPES_PATH = join(__dirname, "../generated/caddy-http.ts");
// `http.matchers.file` is generated here rather than caddy-http.ts (see
// CaddyRouteMatcherSchema's doc comment in ../schemas.ts) -- scanned
// separately so this test's drift-detection covers it too.
const GENERATED_FILESERVER_TYPES_PATH = join(__dirname, "../generated/caddy-fileserver.ts");

/**
 * Go type names that are declared `export interface Match*`/`export type
 * Match*` in the generated source but are NOT themselves a
 * `http.matchers.*` module — shared helper types used by real matchers.
 */
const NON_MATCHER_HELPER_TYPES = new Set(["MatchRegexp", "MatcherSet", "MatcherSets"]);

/**
 * Go matcher type name -> real Caddy JSON matcher key, hand-verified
 * against real Caddy source/docs (not mechanically derived — see file
 * doc comment). Update this whenever the canary test below fails.
 */
const GO_TYPE_TO_JSON_KEY: Record<string, string> = {
  MatchHost: "host",
  MatchPath: "path",
  MatchPathRE: "path_regexp",
  MatchMethod: "method",
  MatchHeader: "header",
  MatchHeaderRE: "header_regexp",
  MatchQuery: "query",
  MatchClientIP: "client_ip",
  MatchRemoteIP: "remote_ip",
  MatchProtocol: "protocol",
  MatchNot: "not",
  MatchExpression: "expression",
  MatchTLS: "tls",
  MatchFile: "file",
  // Acknowledged gap: real Caddy matcher not yet supported by
  // CaddyRouteMatcherSchema (internal Caddy variable matching, lower
  // priority, not offered by the vscode extension's completion provider
  // either) — tracked here so it can't be silently forgotten. Move to the
  // "supported" list above once added to the schema, with the same
  // caddy-validate verification rigor.
  MatchVarsRE: "vars_regexp",
};

function extractMatcherTypeNamesFrom(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const matches = source.matchAll(/^export (?:interface|type) (Match[A-Z][a-zA-Z]*)\b/gm);
  return [...matches].map((m) => m[1]).filter((name) => !NON_MATCHER_HELPER_TYPES.has(name));
}

function extractRealMatcherTypeNames(): string[] {
  return [
    ...extractMatcherTypeNamesFrom(GENERATED_HTTP_TYPES_PATH),
    ...extractMatcherTypeNamesFrom(GENERATED_FILESERVER_TYPES_PATH),
  ];
}

describe("CaddyRouteMatcherSchema stays in sync with real Caddy matchers", () => {
  test("every Match* type in the generated Caddy source has a known JSON-key mapping", () => {
    const realMatcherTypes = extractRealMatcherTypeNames();
    const unmapped = realMatcherTypes.filter((name) => !(name in GO_TYPE_TO_JSON_KEY));

    expect(
      unmapped,
      `Found new Caddy matcher type(s) in src/generated/caddy-http.ts with no entry in ` +
        `GO_TYPE_TO_JSON_KEY: ${unmapped.join(", ")}. This means a local/caddy version bump ` +
        `added a matcher this test doesn't know about yet. Verify its real JSON key against ` +
        `real Caddy (caddy validate, not just the generated struct shape — several matchers ` +
        `have custom JSON marshaling tygo can't see), then add it to GO_TYPE_TO_JSON_KEY above ` +
        `(and to CaddyRouteMatcherSchema in ../schemas.ts if it should be supported now).`
    ).toEqual([]);
  });

  test("every currently-supported matcher key is actually present in CaddyRouteMatcherSchema", () => {
    const schemaKeys = Object.keys(CaddyRouteMatcherSchema.shape);
    const acknowledgedGaps = new Set(["vars_regexp"]);
    const supportedJsonKeys = Object.values(GO_TYPE_TO_JSON_KEY).filter(
      (key) => !acknowledgedGaps.has(key)
    );

    const missing = supportedJsonKeys.filter((key) => !schemaKeys.includes(key));

    expect(
      missing,
      `CaddyRouteMatcherSchema is missing matcher key(s) that GO_TYPE_TO_JSON_KEY says should ` +
        `be supported: ${missing.join(", ")}. Either add them to CaddyRouteMatcherSchema (verified ` +
        `against real Caddy), or move them to the "acknowledged gaps" comment block in ` +
        `GO_TYPE_TO_JSON_KEY if they're being deliberately deferred.`
    ).toEqual([]);
  });

  test("CaddyRouteMatcherSchema doesn't have keys that don't correspond to any real matcher", () => {
    // Catches the opposite drift direction: a hand-added field that isn't
    // (or is no longer) a real Caddy matcher.
    const schemaKeys = Object.keys(CaddyRouteMatcherSchema.shape);
    const realJsonKeys = new Set(Object.values(GO_TYPE_TO_JSON_KEY));

    const unknown = schemaKeys.filter((key) => !realJsonKeys.has(key));

    expect(unknown).toEqual([]);
  });
});
