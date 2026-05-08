/**
 * Caddy host-pattern matching utilities.
 *
 * Implements just enough of Caddy's host-matcher semantics for use in
 * config builders and diagnostic helpers — full matcher coverage is
 * not the goal. The patterns supported here mirror what
 * `automatic_https.skip` and `match.host[]` actually accept in practice:
 * exact hostnames and `*`-globs.
 */

/**
 * Returns true when `host` matches `pattern` per Caddy's host-matcher
 * conventions used in routes and `automatic_https.skip`:
 *
 *   - Exact match: `pattern === host`.
 *   - Single-label leading wildcard: `*.example.com` matches
 *     `foo.example.com` but NOT `example.com` and NOT `a.b.example.com`.
 *   - Generic glob: any other `*`-bearing pattern is converted to a
 *     regex (`.*` per `*` run) and matched. Useful for patterns like
 *     `api-*.example.com` or `*-prod`.
 *
 * Match is case-sensitive on input — callers that want case-insensitive
 * matching should lowercase both arguments first.
 *
 * @example
 * hostMatchesPattern("foo.example.com", "*.example.com")  // true
 * hostMatchesPattern("example.com", "*.example.com")      // false
 * hostMatchesPattern("a.b.example.com", "*.example.com")  // false
 * hostMatchesPattern("api-prod.example.com", "api-*")     // true
 */
export function hostMatchesPattern(host: string, pattern: string): boolean {
  if (pattern === host) return true;
  if (!pattern.includes("*")) return false;
  // Single-label leading wildcard: pattern starts `*.` AND the tail is a
  // literal (no further `*`). Patterns like `*.api-*.example.com` fall
  // through to the generic glob branch — single-label semantics don't
  // apply when the tail itself is a glob.
  if (pattern.startsWith("*.") && !pattern.slice(2).includes("*")) {
    const tail = pattern.slice(2);
    if (!host.endsWith("." + tail)) return false;
    const head = host.slice(0, host.length - tail.length - 1);
    return head.length > 0 && !head.includes(".");
  }
  // Generic glob: convert pattern to regex.
  const re = new RegExp("^" + pattern.split(/\*+/).map(escapeRegex).join(".*") + "$");
  return re.test(host);
}

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}
