import { describe, test, expect } from "vitest";
import { hostMatchesPattern } from "../caddy/host-match.js";

describe("hostMatchesPattern", () => {
  test("exact match", () => {
    expect(hostMatchesPattern("api.example.com", "api.example.com")).toBe(true);
  });

  test("no wildcards: any non-equal pattern fails", () => {
    expect(hostMatchesPattern("api.example.com", "other.example.com")).toBe(false);
  });

  test("`*.example.com` matches one-label sub-domain only", () => {
    expect(hostMatchesPattern("api.example.com", "*.example.com")).toBe(true);
    expect(hostMatchesPattern("a.b.example.com", "*.example.com")).toBe(false);
    expect(hostMatchesPattern("example.com", "*.example.com")).toBe(false);
  });

  test("generic glob: `api-*.example.com` matches by prefix", () => {
    expect(hostMatchesPattern("api-prod.example.com", "api-*.example.com")).toBe(true);
    expect(hostMatchesPattern("api.example.com", "api-*.example.com")).toBe(false);
  });

  test("trailing-glob: `*-prod` matches", () => {
    expect(hostMatchesPattern("foo-prod", "*-prod")).toBe(true);
    expect(hostMatchesPattern("foo-staging", "*-prod")).toBe(false);
  });

  test("regex meta-chars in pattern are escaped", () => {
    // A literal `.` is escaped — `a.b` does not match `aXb`.
    expect(hostMatchesPattern("aXb", "a.b")).toBe(false);
    expect(hostMatchesPattern("a.b", "a.b")).toBe(true);
  });

  // Reviewer-pinned regression cases — patterns that LOOK like the
  // single-label-leading-wildcard form but whose tail itself contains a
  // glob. The single-label branch must NOT swallow these; they belong on
  // the generic-glob path.
  test("`*.api-*.example.com` is a generic glob, not single-label", () => {
    expect(
      hostMatchesPattern("foo.api-prod.example.com", "*.api-*.example.com"),
    ).toBe(true);
    expect(
      hostMatchesPattern("api-prod.example.com", "*.api-*.example.com"),
    ).toBe(false);
  });

  // Generic-glob `*` is intentionally cross-dot — the `*` is converted
  // to `.*` regex, not `[^.]*`. Only the *.literal-tail branch enforces
  // single-label semantics. This pins the choice so a future "tighten
  // glob to single-label" refactor has to confront the contract first.
  test("generic glob `*` matches across dot-separated labels", () => {
    expect(hostMatchesPattern("api-a.b.example.com", "api-*.example.com")).toBe(true);
    expect(hostMatchesPattern("a.b.example.com", "*.example.com")).toBe(false); // single-label still strict
  });
});
