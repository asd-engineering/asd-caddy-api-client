/**
 * Caddy host-matcher subset for config builders and diagnostics.
 * Covers what `automatic_https.skip` and `match.host[]` accept in
 * practice: exact, leading-wildcard single-label, generic glob.
 */

/**
 * True when `host` matches `pattern`:
 *   - Exact: `pattern === host`.
 *   - Single-label `*.tld`: matches one extra label (case-sensitive).
 *     Only fires when the tail is a literal — `*.api-*.tld` is a
 *     generic glob, not a single-label match.
 *   - Generic glob: `*` becomes `.*` (crosses dots intentionally —
 *     only the single-label branch enforces label boundaries).
 *
 * Case-sensitive — lowercase both inputs for case-insensitive match.
 *
 * @example
 * hostMatchesPattern("foo.example.com", "*.example.com")     // true
 * hostMatchesPattern("a.b.example.com", "*.example.com")     // false
 * hostMatchesPattern("api-a.b.example.com", "api-*.tld")     // true (glob crosses dots)
 */
export function hostMatchesPattern(host: string, pattern: string): boolean {
  if (pattern === host) return true;
  if (!pattern.includes("*")) return false;
  if (pattern.startsWith("*.") && !pattern.slice(2).includes("*")) {
    const tail = pattern.slice(2);
    if (!host.endsWith("." + tail)) return false;
    const head = host.slice(0, host.length - tail.length - 1);
    return head.length > 0 && !head.includes(".");
  }
  const re = new RegExp("^" + pattern.split(/\*+/).map(escapeRegex).join(".*") + "$");
  return re.test(host);
}

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}
