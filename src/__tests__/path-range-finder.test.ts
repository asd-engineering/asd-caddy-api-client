/**
 * Direct unit tests for vscode-extension/src/providers/path-range-finder.ts,
 * extracted from diagnostics.ts's CaddyDiagnosticsProvider.findPathRange
 * (0.10) -- previously untestable without a real vscode.TextDocument since
 * it constructed vscode.Range objects inline. This module operates on plain
 * text/offsets; the vscode.Range conversion is a two-line wrapper left in
 * diagnostics.ts, covered indirectly by the existing Playwright suite.
 */
import { describe, test, expect } from "vitest";
import {
  parseJsonPath,
  escapeRegex,
  findPathRangeOffsets,
} from "../../vscode-extension/src/providers/path-range-finder.js";

describe("parseJsonPath", () => {
  test.each([
    ["host", ["host"]],
    ["match.host", ["match", "host"]],
    ["match[0].host", ["match", 0, "host"]],
    ["handle[1].upstreams[2].dial", ["handle", 1, "upstreams", 2, "dial"]],
    ["$", []],
    ["", []],
  ])("%s -> %o", (path, expected) => {
    expect(parseJsonPath(path)).toEqual(expected);
  });
});

describe("escapeRegex", () => {
  test("escapes regex metacharacters", () => {
    expect(escapeRegex("a.b*c?")).toBe("a\\.b\\*c\\?");
  });

  test("leaves plain identifiers untouched", () => {
    expect(escapeRegex("upstreams")).toBe("upstreams");
  });
});

describe("findPathRangeOffsets", () => {
  test("locates a top-level property by name", () => {
    const text = '{\n  "handler": "reverse_proxy"\n}';
    const { start, end } = findPathRangeOffsets(text, "handler");
    expect(text.slice(start, end)).toBe('"handler":');
  });

  test("locates a nested property", () => {
    const text = '{\n  "match": {\n    "host": ["a"]\n  }\n}';
    const { start, end } = findPathRangeOffsets(text, "match.host");
    expect(text.slice(start, end)).toBe('"host":');
  });

  test("locates the Nth item in an array by index", () => {
    const text = '{\n  "handle": [\n    {"handler": "a"},\n    {"handler": "b"}\n  ]\n}';
    const range = findPathRangeOffsets(text, "handle[1].handler");
    expect(text.slice(range.start, range.end)).toBe('"handler":');
    // Confirm it's the second element's handler ("b"), not the first's.
    const restOfText = text.slice(range.end);
    expect(restOfText.trimStart().startsWith('"b"')).toBe(true);
  });

  test("an empty path returns a 1-character range at the start", () => {
    expect(findPathRangeOffsets("{}", "$")).toEqual({ start: 0, end: 1 });
  });

  test("a path that can't be found falls back to the first line, capped at 80 chars", () => {
    const text = '{\n  "known": true\n}';
    const { start, end } = findPathRangeOffsets(text, "totallyMissing");
    expect(start).toBe(0);
    expect(end).toBe(text.indexOf("\n"));
  });

  test("a not-found path in a single-line (no newline) file doesn't produce a negative range", () => {
    const text = '{"known": true}';
    const { start, end } = findPathRangeOffsets(text, "totallyMissing");
    expect(start).toBe(0);
    expect(end).toBeGreaterThanOrEqual(0);
    expect(end).toBe(Math.min(text.length, 80));
  });
});
