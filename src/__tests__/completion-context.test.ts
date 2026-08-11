/**
 * Direct unit tests for vscode-extension/src/providers/completion-context.ts
 * -- the JSON-path-based completion context detector extracted from
 * completion.ts (0.10). Every case here traces back to a real bug the 0.9.0
 * xhigh code review found in the first version of this logic: nested "not"
 * matchers losing completions, the "protocol" enum leaking into an
 * unrelated field, selection_policy/encodings keyed by the wrong JSON
 * field, and route-property completions firing on any JSON file's root.
 * Uses jsonc-parser's real getLocation() against literal text fixtures --
 * no vscode/Playwright needed, unlike before this extraction.
 */
import { describe, test, expect } from "vitest";
import {
  detectContext,
  isCaddyConfigFile,
  pathEndsWith,
  isMatchObjectPath,
  fieldNameAtValuePosition,
  ANY,
} from "../../vscode-extension/src/providers/completion-context.js";

/** Detects context at the offset right after `text` ends (simulating the cursor there). */
function ctx(text: string, overrides: Partial<Parameters<typeof detectContext>[0]> = {}) {
  return detectContext({
    text,
    offset: text.length,
    languageId: "json",
    isUntitled: false,
    fileName: "route.caddy.json",
    ...overrides,
  });
}

describe("detectContext -- file gating", () => {
  test("non-json/jsonc languageId is always unknown", () => {
    expect(ctx('{"', { languageId: "plaintext" })).toEqual({ type: "unknown" });
  });

  test("a saved file with a non-Caddy name gets no Caddy completions", () => {
    expect(ctx('{"', { fileName: "package.json" })).toEqual({ type: "unknown" });
  });

  test("a saved file with a recognized Caddy filename gets completions", () => {
    expect(ctx('{"', { fileName: "route.caddy.json" })).toEqual({ type: "route-property" });
  });

  test("an untitled buffer gets Caddy completions regardless of its (non-matching) name", () => {
    expect(ctx('{"', { isUntitled: true, fileName: "Untitled-1" })).toEqual({
      type: "route-property",
    });
  });
});

describe("isCaddyConfigFile", () => {
  test.each([
    ["caddy-server.json", true],
    ["my-app.caddy-server.json", true],
    ["caddy.json", true],
    ["route.caddy.json", true],
    ["caddy-security.json", true],
    ["auth.caddy-security-portal.json", true],
    ["auth.caddy-security-policy.json", true],
    ["package.json", false],
    ["tsconfig.json", false],
    ["settings.json", false],
  ])("%s -> %s", (fileName, expected) => {
    expect(isCaddyConfigFile(fileName)).toBe(expected);
  });
});

describe("detectContext -- value positions", () => {
  test('"handler": "|" inside a handle array element is handler-value', () => {
    expect(ctx('{"handle": [{"handler": "')).toEqual({ type: "handler-value" });
  });

  test('"handler" outside a handle array is NOT handler-value', () => {
    expect(ctx('{"handler": "')).toEqual({ type: "unknown" });
  });

  test('"method": ["|" inside a match object is method-value', () => {
    expect(ctx('{"match": [{"method": ["')).toEqual({ type: "method-value" });
  });

  test('"method": ["GET", "|" (second array element) is still method-value', () => {
    expect(ctx('{"match": [{"method": ["GET", "')).toEqual({ type: "method-value" });
  });

  test('method-value fires inside a "not"-negated matcher, any depth', () => {
    expect(ctx('{"match": [{"not": [{"method": ["')).toEqual({ type: "method-value" });
    expect(ctx('{"match": [{"not": [{"not": [{"method": ["')).toEqual({ type: "method-value" });
  });

  test('"protocol": "|" inside a match object is the protocol enum', () => {
    expect(ctx('{"match": [{"protocol": "')).toEqual({ type: "enum-value", field: "protocol" });
  });

  test('protocol enum fires inside a nested "not" matcher too', () => {
    expect(ctx('{"match": [{"not": [{"protocol": "')).toEqual({
      type: "enum-value",
      field: "protocol",
    });
  });

  test("reverse_proxy's transport.protocol does NOT get the match-protocol enum (regression)", () => {
    expect(ctx('{"handle": [{"handler": "reverse_proxy", "transport": {"protocol": "')).toEqual({
      type: "unknown",
    });
  });

  test("load_balancing.selection_policy.policy is the selection_policy enum (regression)", () => {
    expect(ctx('{"handle": [{"load_balancing": {"selection_policy": {"policy": "')).toEqual({
      type: "enum-value",
      field: "selection_policy",
    });
  });

  test('a bare "policy" field elsewhere is NOT the selection_policy enum', () => {
    expect(ctx('{"policy": "')).toEqual({ type: "unknown" });
  });

  test('encode handler\'s "prefer" array is the encodings enum (regression)', () => {
    expect(ctx('{"handle": [{"prefer": ["')).toEqual({ type: "enum-value", field: "encodings" });
  });
});

describe("detectContext -- property-key positions", () => {
  test('inside a match object ("match": [{"|) offers match-property', () => {
    expect(ctx('{"match": [{"')).toEqual({ type: "match-property" });
  });

  test('match-property fires inside a "not"-negated matcher, any depth (regression)', () => {
    expect(ctx('{"match": [{"not": [{"')).toEqual({ type: "match-property" });
    expect(ctx('{"match": [{"not": [{"not": [{"')).toEqual({ type: "match-property" });
  });

  test("inside a handle element with no handler set yet offers handle-property", () => {
    expect(ctx('{"handle": [{"')).toEqual({ type: "handle-property" });
  });

  test("inside a handle element with a known handler already set offers handler-property", () => {
    expect(ctx('{"handle": [{"handler": "reverse_proxy", "')).toEqual({
      type: "handler-property",
      handler: "reverse_proxy",
    });
  });

  test("inside a handle element with an UNKNOWN handler falls back to handle-property", () => {
    expect(ctx('{"handle": [{"handler": "totally_made_up", "')).toEqual({
      type: "handle-property",
    });
  });

  test("document root offers route-property", () => {
    expect(ctx('{"')).toEqual({ type: "route-property" });
  });

  test('an element of a "routes" array (server config / subroute) offers route-property', () => {
    expect(ctx('{"routes": [{"')).toEqual({ type: "route-property" });
  });

  test("root-level route-property does NOT fire on a non-Caddy filename (regression)", () => {
    expect(ctx('{"', { fileName: "package.json" })).toEqual({ type: "unknown" });
  });
});

describe("path-matching helpers", () => {
  test("pathEndsWith matches an exact trailing sequence", () => {
    expect(pathEndsWith(["match", 0, "host"], ["match", ANY, "host"])).toBe(true);
    expect(pathEndsWith(["match", 0, "host"], ["match", ANY, "path"])).toBe(false);
  });

  test("pathEndsWith is false when the path is shorter than the pattern", () => {
    expect(pathEndsWith(["host"], ["match", ANY, "host"])).toBe(false);
  });

  test("isMatchObjectPath accepts arbitrary 'not' nesting depth", () => {
    expect(isMatchObjectPath(["match", 0, ""], [""])).toBe(true);
    expect(isMatchObjectPath(["match", 0, "not", 0, ""], [""])).toBe(true);
    expect(isMatchObjectPath(["match", 0, "not", 0, "not", 1, ""], [""])).toBe(true);
  });

  test("isMatchObjectPath rejects a non-match, non-not prefix", () => {
    expect(isMatchObjectPath(["handle", 0, ""], [""])).toBe(false);
    expect(isMatchObjectPath(["match", 0, "transport", ""], [""])).toBe(false);
  });

  test("fieldNameAtValuePosition reads the property name at a scalar value", () => {
    expect(fieldNameAtValuePosition(["handler"])).toBe("handler");
  });

  test("fieldNameAtValuePosition reads the enclosing array's field name at an array element", () => {
    expect(fieldNameAtValuePosition(["method", 0])).toBe("method");
  });

  test("fieldNameAtValuePosition returns undefined at the document root", () => {
    expect(fieldNameAtValuePosition([])).toBeUndefined();
  });
});
