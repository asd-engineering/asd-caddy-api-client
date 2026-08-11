/**
 * Pure JSON-path-based completion context detection for CaddyCompletionProvider
 * -- deliberately has no `vscode` import (all inputs are plain strings/
 * numbers/booleans the caller reads off a vscode.TextDocument) so it can be
 * unit-tested directly, same pattern as completion-data.ts. See
 * src/__tests__/completion-context.test.ts in the main package: every case
 * this module covers is a case the 0.9.0 xhigh code review found broken in
 * the first version of this logic (nested "not" matchers, root-property
 * completions leaking into non-Caddy JSON files, the `protocol` enum
 * leaking into reverse_proxy's transport.protocol, selection_policy/
 * encodings keyed by the wrong JSON field).
 */
import { getLocation, parseTree, findNodeAtLocation, type Segment, type Node } from "jsonc-parser";
import { HANDLER_METADATA } from "@accelerated-software-development/caddy-api-client/extension-assets";

export type CompletionContext =
  | { type: "route-property" }
  | { type: "match-property" }
  | { type: "method-value" }
  | { type: "handler-value" }
  | { type: "handle-property" }
  | { type: "handler-property"; handler: string }
  | { type: "enum-value"; field: string }
  | { type: "unknown" };

export interface DetectContextParams {
  text: string;
  offset: number;
  languageId: string;
  isUntitled: boolean;
  fileName: string;
}

/**
 * Filename patterns this extension associates with a Caddy config schema,
 * mirrored from package.json's `jsonValidation` contribution. Caddy-specific
 * completions (route/match/handle properties) only make sense on files
 * where the corresponding schema is actually active -- without this gate,
 * e.g. the root-level route-property completion fires on the first
 * keystroke of ANY json/jsonc file's root object (package.json,
 * tsconfig.json, ...), since that position has no Caddy-specific content
 * to distinguish it by.
 */
const CADDY_FILENAME_PATTERNS = [
  /caddy-server\.json$/i,
  /caddy-full\.json$/i,
  /\.caddy-server\.json$/i,
  /caddy\.json$/i,
  /caddy-config\.json$/i,
  /\.caddy\.json$/i,
  /caddy-security\.json$/i,
  /security-config\.json$/i,
  /\.caddy-security\.json$/i,
  /caddy-security-portal\.json$/i,
  /\.caddy-security-portal\.json$/i,
  /caddy-security-policy\.json$/i,
  /\.caddy-security-policy\.json$/i,
];

export function isCaddyConfigFile(fileName: string): boolean {
  return CADDY_FILENAME_PATTERNS.some((pattern) => pattern.test(fileName));
}

/** Sentinel matching any single path segment (an array index or an in-progress property key). */
export const ANY = Symbol("any-segment");
export type PathPattern = (Segment | typeof ANY)[];

/** True if `path`'s trailing segments equal `pattern` (ANY matches any single segment). */
export function pathEndsWith(path: Segment[], pattern: PathPattern): boolean {
  if (path.length < pattern.length) {
    return false;
  }
  const start = path.length - pattern.length;
  return pattern.every((seg, i) => seg === ANY || seg === path[start + i]);
}

/**
 * True if `path`, once its trailing `suffix` is stripped, points inside a
 * match object -- i.e. `["match", i]` optionally followed by any number of
 * `["not", j]` hops (Caddy's `not` matcher wraps a nested matcher set, and
 * that set can itself contain another `not`). Covers `["match", 0]`,
 * `["match", 0, "not", 1]`, `["match", 0, "not", 1, "not", 0]`, etc.
 */
export function isMatchObjectPath(path: Segment[], suffix: PathPattern): boolean {
  if (!pathEndsWith(path, suffix)) {
    return false;
  }
  const prefix = path.slice(0, path.length - suffix.length);
  if (prefix.length < 2 || prefix[0] !== "match" || typeof prefix[1] !== "number") {
    return false;
  }
  for (let i = 2; i < prefix.length; i += 2) {
    if (prefix[i] !== "not" || typeof prefix[i + 1] !== "number") {
      return false;
    }
  }
  return true;
}

/**
 * The property name a value-position cursor is filling in. For a scalar
 * property (`"handler": "|`) the path ends with the property name itself.
 * For an array element (`"method": ["GET", "|`) the path ends with the
 * array index, so the field name is the segment before it.
 */
export function fieldNameAtValuePosition(path: Segment[]): string | undefined {
  const last = path[path.length - 1];
  if (typeof last === "string") {
    return last;
  }
  if (typeof last === "number") {
    const prev = path[path.length - 2];
    if (typeof prev === "string") {
      return prev;
    }
  }
  return undefined;
}

/** Reads a string-valued sibling property (e.g. `handler`) off an object node, if present. */
export function getStringPropertyValue(objectNode: Node, key: string): string | undefined {
  if (objectNode.type !== "object" || !objectNode.children) {
    return undefined;
  }
  for (const propNode of objectNode.children) {
    const [keyNode, valueNode] = propNode.children ?? [];
    if (keyNode?.value === key && valueNode?.type === "string") {
      return valueNode.value as string;
    }
  }
  return undefined;
}

export function detectContext(params: DetectContextParams): CompletionContext {
  const { text, offset, languageId, isUntitled, fileName } = params;

  // Only process JSON-like files for Caddy config completions, and only
  // ones this extension actually recognizes as Caddy config (see
  // CADDY_FILENAME_PATTERNS) -- otherwise every JSON/JSONC file in the
  // workspace gets Caddy-specific noise in its autocomplete. Unsaved
  // ("Untitled") buffers are exempted -- they have no filename to match
  // against and, unlike a real project file, can't collide with another
  // tool's schema, so it's safe (and expected) to offer Caddy completions
  // while someone is prototyping a config before saving it.
  if (languageId !== "json" && languageId !== "jsonc") {
    return { type: "unknown" };
  }
  if (!isUntitled && !isCaddyConfigFile(fileName)) {
    return { type: "unknown" };
  }

  const location = getLocation(text, offset);
  const { path, isAtPropertyKey } = location;

  if (!isAtPropertyKey) {
    const fieldName = fieldNameAtValuePosition(path);

    // "handler": "|  -- only inside an element of the handle array
    if (fieldName === "handler" && pathEndsWith(path, ["handle", ANY, "handler"])) {
      return { type: "handler-value" };
    }

    // "method": ["|  or  "method": ["GET", "| -- only inside a match object
    // (including one nested inside a "not" matcher, however deep)
    if (fieldName === "method" && isMatchObjectPath(path, ["method", ANY])) {
      return { type: "method-value" };
    }

    // "protocol": "|" -- only inside a match object's own protocol field
    // (not e.g. reverse_proxy's unrelated transport.protocol)
    if (fieldName === "protocol" && isMatchObjectPath(path, ["protocol"])) {
      return { type: "enum-value", field: "protocol" };
    }

    // "policy": "|" -- only inside a reverse_proxy handler's
    // load_balancing.selection_policy.policy
    if (
      fieldName === "policy" &&
      pathEndsWith(path, ["handle", ANY, "load_balancing", "selection_policy", "policy"])
    ) {
      return { type: "enum-value", field: "selection_policy" };
    }

    // "prefer": ["|" -- only inside an encode handler's prefer array
    if (fieldName === "prefer" && pathEndsWith(path, ["handle", ANY, "prefer", ANY])) {
      return { type: "enum-value", field: "encodings" };
    }

    return { type: "unknown" };
  }

  // isAtPropertyKey: path's last segment is the '' placeholder for the
  // key being typed. Its parent object's location is path.slice(0, -1).

  // Inside one element of the "match" array (including nested inside a
  // "not" matcher, however deep)
  if (isMatchObjectPath(path, [""])) {
    return { type: "match-property" };
  }

  // Inside one element of the "handle" array
  if (pathEndsWith(path, ["handle", ANY, ""])) {
    const tree = parseTree(text);
    const handlerObjectPath = path.slice(0, -1);
    const objectNode = tree && findNodeAtLocation(tree, handlerObjectPath);
    const handlerName = objectNode ? getStringPropertyValue(objectNode, "handler") : undefined;

    if (handlerName && HANDLER_METADATA[handlerName]) {
      return { type: "handler-property", handler: handlerName };
    }
    return { type: "handle-property" };
  }

  // Document root, or an element of a "routes" array (e.g. inside a
  // server config or a subroute handler's own "routes" list)
  if (path.length === 1 || pathEndsWith(path, ["routes", ANY, ""])) {
    return { type: "route-property" };
  }

  return { type: "unknown" };
}
