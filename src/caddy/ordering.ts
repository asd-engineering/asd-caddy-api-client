/**
 * Route Ordering and Priority System
 *
 * Provides explicit route ordering to replace implicit array-based ordering.
 * Routes are sorted by priority (lower number = higher priority) and then by
 * path specificity.
 *
 * @module caddy/ordering
 */

import type { CaddyRoute } from "../types";

/**
 * Standard route priorities for common patterns
 * Lower numbers are evaluated first
 */
export const ROUTE_PRIORITIES: Record<string, number> = {
  /** Global health checks - always first */
  HEALTH: 0,

  /** Domain-level authentication (entire domain protected) */
  AUTH_DOMAIN: 10,

  /** Path-level authentication (specific paths protected) */
  AUTH_PATH: 20,

  /** Specific path patterns (/api/*, /admin/*) */
  SPECIFIC_PATH: 30,

  /** Path rewrites */
  REWRITE: 40,

  /** Regular services */
  SERVICE: 50,

  /** Wildcard catch-all (/*) */
  WILDCARD: 90,

  /** Default fallback */
  FALLBACK: 100,
};

/**
 * Calculate implicit priority from route match patterns
 * Used when explicit priority is not set
 *
 * Priority is calculated based on:
 * 1. Path specificity (exact > prefix > wildcard)
 * 2. Host specificity (exact > wildcard)
 * 3. Number of matchers (more = more specific)
 *
 * @param route - Route to analyze
 * @returns Calculated priority (0-100, lower = higher priority)
 *
 * @example
 * calculateRoutePriority({ match: [{ path: ["/health"] }] }) // Returns ~0 (health check)
 * calculateRoutePriority({ match: [{ path: ["/api/*"] }] })  // Returns ~30 (specific path)
 * calculateRoutePriority({ match: [{ path: ["/*"] }] })      // Returns ~90 (wildcard)
 */
export function calculateRoutePriority(route: CaddyRoute): number {
  // If explicit priority is set, use it
  if (typeof route.priority === "number") {
    return route.priority;
  }

  // Special case: health check routes
  if (route["@id"] === "global-health" || isHealthRoute(route)) {
    return ROUTE_PRIORITIES.HEALTH;
  }

  // Analyze route matchers
  const matchers = route.match ?? [];
  if (matchers.length === 0) {
    return ROUTE_PRIORITIES.FALLBACK;
  }

  let priority = ROUTE_PRIORITIES.SERVICE; // Default

  for (const matcher of matchers) {
    // Path-based priority
    const paths = matcher.path ?? [];
    for (const path of paths) {
      if (path === "/health") {
        priority = Math.min(priority, ROUTE_PRIORITIES.HEALTH);
      } else if (path.includes("/admin") || path.includes("/auth")) {
        priority = Math.min(priority, ROUTE_PRIORITIES.AUTH_PATH);
      } else if (path === "/*") {
        priority = Math.max(priority, ROUTE_PRIORITIES.WILDCARD);
      } else if (path.includes("*")) {
        priority = Math.min(priority, ROUTE_PRIORITIES.SPECIFIC_PATH);
      } else {
        // Exact path match
        priority = Math.min(priority, ROUTE_PRIORITIES.SPECIFIC_PATH);
      }
    }
  }

  return priority;
}

/**
 * Check if route appears to be a health check route
 * Heuristic: matches /health path
 *
 * @param route - Route to check
 * @returns True if route looks like a health check
 */
function isHealthRoute(route: CaddyRoute): boolean {
  const matchers = route.match ?? [];
  return matchers.some((m) => m.path?.some((p) => p === "/health" || p.includes("health")));
}

/**
 * Calculate path specificity score
 * Higher score = more specific
 *
 * @param path - Path pattern to analyze
 * @returns Specificity score (higher = more specific)
 */
function calculatePathSpecificity(path: string): number {
  // Exact paths are most specific
  if (!path.includes("*") && !path.includes("{")) {
    return 100;
  }

  // Paths with placeholders
  if (path.includes("{")) {
    return 50;
  }

  // Prefix wildcards (/api/*)
  if (path.endsWith("*")) {
    const segments = path.split("/").filter((s) => s && s !== "*");
    return 30 + segments.length * 5;
  }

  // Pure wildcard (/*) - least specific
  if (path === "/*") {
    return 10;
  }

  // Default
  return 20;
}

/**
 * Sort routes by priority and specificity
 * Routes with lower priority numbers are placed first
 * Within same priority, more specific routes come first
 *
 * @param routes - Routes to sort
 * @returns Sorted routes (does not mutate input)
 *
 * @example
 * const routes = [
 *   { match: [{ path: ["/*"] }] },           // Wildcard
 *   { match: [{ path: ["/health"] }] },      // Health
 *   { match: [{ path: ["/api/*"] }] },       // API
 * ];
 * const sorted = sortRoutes(routes);
 * // Order: health, api, wildcard
 */
export function sortRoutes(routes: CaddyRoute[]): CaddyRoute[] {
  const routesWithPriority = routes.map((route) => ({
    route,
    priority: calculateRoutePriority(route),
    specificity: calculateRouteSpecificity(route),
  }));

  routesWithPriority.sort((a, b) => {
    // First, sort by priority (lower = first)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // Within same priority, sort by specificity (higher = first)
    return b.specificity - a.specificity;
  });

  // Strip priority field before returning (Caddy doesn't recognize it)
  return routesWithPriority.map((item) => {
    const { priority: _priority, ...routeWithoutPriority } = item.route;
    return routeWithoutPriority as CaddyRoute;
  });
}

/**
 * Calculate overall route specificity
 * Considers all matchers in the route
 *
 * @param route - Route to analyze
 * @returns Specificity score (higher = more specific)
 */
function calculateRouteSpecificity(route: CaddyRoute): number {
  const matchers = route.match ?? [];
  if (matchers.length === 0) {
    return 0;
  }

  let totalSpecificity = 0;

  for (const matcher of matchers) {
    // Path specificity
    const paths = matcher.path ?? [];
    for (const path of paths) {
      totalSpecificity += calculatePathSpecificity(path);
    }

    // Host specificity (exact hosts are more specific)
    const hosts = matcher.host ?? [];
    for (const host of hosts) {
      if (host.includes("*")) {
        totalSpecificity += 10;
      } else {
        totalSpecificity += 20;
      }
    }

    // More matchers = more specific
    totalSpecificity += Object.keys(matcher).length * 5;
  }

  return totalSpecificity;
}

/**
 * Validate route ordering against expected rules
 * Throws if ordering would cause routing issues
 *
 * @param routes - Routes to validate (should already be sorted)
 * @throws {Error} If route ordering violates rules
 *
 * @example
 * const routes = sortRoutes([healthRoute, apiRoute, catchAll]);
 * validateRouteOrdering(routes); // No error
 *
 * validateRouteOrdering([catchAll, healthRoute]); // Throws error
 */
export function validateRouteOrdering(routes: CaddyRoute[]): void {
  if (routes.length === 0) {
    return;
  }

  // Rule 1: Health checks must be first
  const healthRouteIndex = routes.findIndex(
    (r) => r["@id"] === "global-health" || isHealthRoute(r)
  );

  if (healthRouteIndex > 0) {
    throw new Error(
      `Route ordering violation: Health check route must be first, but found at index ${healthRouteIndex}`
    );
  }

  // Rule 2: Wildcard routes must come after specific routes
  for (let i = 0; i < routes.length - 1; i++) {
    const currentPriority = calculateRoutePriority(routes[i]);
    const nextPriority = calculateRoutePriority(routes[i + 1]);

    if (currentPriority > nextPriority) {
      const currentId = routes[i]["@id"] ?? `route-${i}`;
      const nextId = routes[i + 1]["@id"] ?? `route-${i + 1}`;

      throw new Error(
        `Route ordering violation: Route "${currentId}" (priority ${currentPriority}) ` +
          `should come after route "${nextId}" (priority ${nextPriority})`
      );
    }
  }

  // Rule 3: Within same host, specific paths before wildcards
  const routesByHost = groupRoutesByHost(routes);

  for (const [host, hostRoutes] of Object.entries(routesByHost)) {
    const wildcardIndex = hostRoutes.findIndex((r) =>
      r.match?.some((m) => m.path?.some((p) => p === "/*"))
    );

    if (wildcardIndex === -1) {
      continue; // No wildcard for this host
    }

    // Check that all routes after wildcard are also wildcards or different hosts
    for (let i = wildcardIndex + 1; i < hostRoutes.length; i++) {
      const route = hostRoutes[i];
      const hasSpecificPath = route.match?.some((m) =>
        m.path?.some((p) => p !== "/*" && !p.includes("*"))
      );

      if (hasSpecificPath) {
        const wildcardId = hostRoutes[wildcardIndex]["@id"] ?? `route-${wildcardIndex}`;
        const specificId = route["@id"] ?? `route-${i}`;

        throw new Error(
          `Route ordering violation on host "${host}": ` +
            `Specific path route "${specificId}" should come before wildcard route "${wildcardId}"`
        );
      }
    }
  }
}

/**
 * Group routes by host for validation
 */
function groupRoutesByHost(routes: CaddyRoute[]): Record<string, CaddyRoute[]> {
  const byHost: Record<string, CaddyRoute[]> = {};

  for (const route of routes) {
    const hosts = route.match?.flatMap((m) => m.host ?? []) ?? ["*"];

    for (const host of hosts) {
      if (!byHost[host]) {
        byHost[host] = [];
      }
      byHost[host].push(route);
    }
  }

  return byHost;
}

/**
 * Insert route with relative positioning
 * Allows inserting routes before/after specific route IDs
 *
 * @param routes - Existing routes
 * @param route - Route to insert
 * @param options - Positioning options
 * @returns New routes array with route inserted
 *
 * @example
 * // Insert at beginning
 * insertRouteRelative(routes, newRoute, { position: "beginning" })
 *
 * // Insert after health check
 * insertRouteRelative(routes, newRoute, { afterId: "global-health" })
 *
 * // Insert before catch-all
 * insertRouteRelative(routes, newRoute, { beforeId: "catch-all" })
 */
export function insertRouteRelative(
  routes: CaddyRoute[],
  route: CaddyRoute,
  options: {
    beforeId?: string;
    afterId?: string;
    position?: "beginning" | "end";
  } = {}
): CaddyRoute[] {
  const newRoutes = [...routes];

  // Insert by position
  if (options.position === "beginning") {
    newRoutes.unshift(route);
    return newRoutes;
  }

  if (options.position === "end") {
    newRoutes.push(route);
    return newRoutes;
  }

  // Insert before specific route
  if (options.beforeId) {
    const index = newRoutes.findIndex((r) => r["@id"] === options.beforeId);
    if (index === -1) {
      throw new Error(`Route with @id "${options.beforeId}" not found`);
    }
    newRoutes.splice(index, 0, route);
    return newRoutes;
  }

  // Insert after specific route
  if (options.afterId) {
    const index = newRoutes.findIndex((r) => r["@id"] === options.afterId);
    if (index === -1) {
      throw new Error(`Route with @id "${options.afterId}" not found`);
    }
    newRoutes.splice(index + 1, 0, route);
    return newRoutes;
  }

  // Default: append to end
  newRoutes.push(route);
  return newRoutes;
}
