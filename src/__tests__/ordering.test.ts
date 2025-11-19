/**
 * Unit tests for route ordering system
 */

import { describe, test, expect } from "vitest";
import {
  sortRoutes,
  calculateRoutePriority,
  validateRouteOrdering,
  insertRouteRelative,
  ROUTE_PRIORITIES,
} from "../caddy/ordering";
import type { CaddyRoute } from "../types";

describe("Route Ordering", () => {
  describe("ROUTE_PRIORITIES constants", () => {
    test("priorities are in ascending order", () => {
      expect(ROUTE_PRIORITIES.HEALTH).toBeLessThan(ROUTE_PRIORITIES.AUTH_DOMAIN);
      expect(ROUTE_PRIORITIES.AUTH_DOMAIN).toBeLessThan(ROUTE_PRIORITIES.AUTH_PATH);
      expect(ROUTE_PRIORITIES.AUTH_PATH).toBeLessThan(ROUTE_PRIORITIES.SPECIFIC_PATH);
      expect(ROUTE_PRIORITIES.SPECIFIC_PATH).toBeLessThan(ROUTE_PRIORITIES.WILDCARD);
      expect(ROUTE_PRIORITIES.WILDCARD).toBeLessThan(ROUTE_PRIORITIES.FALLBACK);
    });

    test("HEALTH has priority 0", () => {
      expect(ROUTE_PRIORITIES.HEALTH).toBe(0);
    });
  });

  describe("calculateRoutePriority", () => {
    test("returns explicit priority when set", () => {
      const route: CaddyRoute = {
        priority: 42,
        match: [{ path: ["/*"] }],
      };

      expect(calculateRoutePriority(route)).toBe(42);
    });

    test("identifies health routes by @id", () => {
      const route: CaddyRoute = {
        "@id": "global-health",
        match: [{ path: ["/health"] }],
      };

      expect(calculateRoutePriority(route)).toBe(ROUTE_PRIORITIES.HEALTH);
    });

    test("identifies health routes by path pattern", () => {
      const route: CaddyRoute = {
        match: [{ path: ["/health"] }],
      };

      expect(calculateRoutePriority(route)).toBe(ROUTE_PRIORITIES.HEALTH);
    });

    test("identifies auth routes by path", () => {
      const adminRoute: CaddyRoute = {
        match: [{ host: ["example.com"], path: ["/admin/*"] }],
      };

      expect(calculateRoutePriority(adminRoute)).toBe(ROUTE_PRIORITIES.AUTH_PATH);
    });

    test("identifies wildcard routes", () => {
      const route: CaddyRoute = {
        match: [{ path: ["/*"] }],
      };

      expect(calculateRoutePriority(route)).toBe(ROUTE_PRIORITIES.WILDCARD);
    });

    test("identifies specific path routes", () => {
      const route: CaddyRoute = {
        match: [{ path: ["/api/*"] }],
      };

      expect(calculateRoutePriority(route)).toBe(ROUTE_PRIORITIES.SPECIFIC_PATH);
    });

    test("returns FALLBACK for routes without matchers", () => {
      const route: CaddyRoute = {};

      expect(calculateRoutePriority(route)).toBe(ROUTE_PRIORITIES.FALLBACK);
    });

    test("returns SERVICE priority for regular routes", () => {
      const route: CaddyRoute = {
        match: [{ host: ["example.com"], path: ["/users"] }],
      };

      expect(calculateRoutePriority(route)).toBe(ROUTE_PRIORITIES.SPECIFIC_PATH);
    });
  });

  describe("sortRoutes", () => {
    test("places health routes first", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "catch-all",
          match: [{ path: ["/*"] }],
        },
        {
          "@id": "global-health",
          match: [{ path: ["/health"] }],
        },
        {
          "@id": "api",
          match: [{ path: ["/api/*"] }],
        },
      ];

      const sorted = sortRoutes(routes);

      expect(sorted[0]["@id"]).toBe("global-health");
    });

    test("places specific paths before wildcards", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "wildcard",
          match: [{ path: ["/*"] }],
        },
        {
          "@id": "specific",
          match: [{ path: ["/api/*"] }],
        },
      ];

      const sorted = sortRoutes(routes);

      expect(sorted[0]["@id"]).toBe("specific");
      expect(sorted[1]["@id"]).toBe("wildcard");
    });

    test("respects explicit priority over path specificity", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "low-priority-specific",
          match: [{ path: ["/api/*"] }],
          priority: 100,
        },
        {
          "@id": "high-priority-wildcard",
          match: [{ path: ["/*"] }],
          priority: 10,
        },
      ];

      const sorted = sortRoutes(routes);

      expect(sorted[0]["@id"]).toBe("high-priority-wildcard");
      expect(sorted[1]["@id"]).toBe("low-priority-specific");
    });

    test("maintains stable order for same priority and specificity", () => {
      const routes: CaddyRoute[] = [
        { "@id": "route-1", priority: 50 },
        { "@id": "route-2", priority: 50 },
        { "@id": "route-3", priority: 50 },
      ];

      const sorted = sortRoutes(routes);

      // Order should be preserved for equal priorities
      expect(sorted.map((r) => r["@id"])).toEqual(["route-1", "route-2", "route-3"]);
    });

    test("sorts complex real-world routing setup", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "catch-all",
          match: [{ host: ["example.com"], path: ["/*"] }],
        },
        {
          "@id": "health",
          match: [{ path: ["/health"] }],
        },
        {
          "@id": "api-admin",
          match: [{ host: ["example.com"], path: ["/api/admin/*"] }],
          priority: ROUTE_PRIORITIES.AUTH_PATH,
        },
        {
          "@id": "api-public",
          match: [{ host: ["example.com"], path: ["/api/*"] }],
          priority: ROUTE_PRIORITIES.SPECIFIC_PATH,
        },
      ];

      const sorted = sortRoutes(routes);

      expect(sorted.map((r) => r["@id"])).toEqual([
        "health",
        "api-admin",
        "api-public",
        "catch-all",
      ]);
    });

    test("does not mutate input array", () => {
      const routes: CaddyRoute[] = [
        { "@id": "b", priority: 20 },
        { "@id": "a", priority: 10 },
      ];

      const originalOrder = routes.map((r) => r["@id"]);
      sortRoutes(routes);

      expect(routes.map((r) => r["@id"])).toEqual(originalOrder);
    });
  });

  describe("validateRouteOrdering", () => {
    test("does not throw for empty routes", () => {
      expect(() => validateRouteOrdering([])).not.toThrow();
    });

    test("does not throw for correctly ordered routes", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "health",
          match: [{ path: ["/health"] }],
          priority: ROUTE_PRIORITIES.HEALTH,
        },
        {
          "@id": "api",
          match: [{ path: ["/api/*"] }],
          priority: ROUTE_PRIORITIES.SPECIFIC_PATH,
        },
        {
          "@id": "wildcard",
          match: [{ path: ["/*"] }],
          priority: ROUTE_PRIORITIES.WILDCARD,
        },
      ];

      expect(() => validateRouteOrdering(routes)).not.toThrow();
    });

    test("throws when health route is not first", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "api",
          match: [{ path: ["/api/*"] }],
        },
        {
          "@id": "health",
          match: [{ path: ["/health"] }],
        },
      ];

      expect(() => validateRouteOrdering(routes)).toThrow(/health.*must be first/i);
    });

    test("throws when priorities are descending", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "low-priority",
          priority: 100,
        },
        {
          "@id": "high-priority",
          priority: 10,
        },
      ];

      expect(() => validateRouteOrdering(routes)).toThrow(/ordering violation/i);
    });

    test("throws when wildcard comes before specific path on same host", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "health",
          match: [{ path: ["/health"] }],
          priority: ROUTE_PRIORITIES.HEALTH,
        },
        {
          "@id": "wildcard",
          match: [{ host: ["example.com"], path: ["/*"] }],
          priority: ROUTE_PRIORITIES.WILDCARD,
        },
        {
          "@id": "specific",
          match: [{ host: ["example.com"], path: ["/api"] }],
          priority: ROUTE_PRIORITIES.WILDCARD + 1, // Higher priority number (lower precedence)
        },
      ];

      expect(() => validateRouteOrdering(routes)).toThrow(/ordering violation/i);
    });

    test("allows wildcard after specific path on same host", () => {
      const routes: CaddyRoute[] = [
        {
          "@id": "health",
          match: [{ path: ["/health"] }],
          priority: ROUTE_PRIORITIES.HEALTH,
        },
        {
          "@id": "specific",
          match: [{ host: ["example.com"], path: ["/api"] }],
          priority: ROUTE_PRIORITIES.SPECIFIC_PATH,
        },
        {
          "@id": "wildcard",
          match: [{ host: ["example.com"], path: ["/*"] }],
          priority: ROUTE_PRIORITIES.WILDCARD,
        },
      ];

      expect(() => validateRouteOrdering(routes)).not.toThrow();
    });
  });

  describe("insertRouteRelative", () => {
    const existingRoutes: CaddyRoute[] = [
      { "@id": "health", priority: 0 },
      { "@id": "api", priority: 30 },
      { "@id": "wildcard", priority: 90 },
    ];

    test("inserts at beginning with position option", () => {
      const newRoute: CaddyRoute = { "@id": "new", priority: 5 };
      const result = insertRouteRelative(existingRoutes, newRoute, { position: "beginning" });

      expect(result[0]["@id"]).toBe("new");
      expect(result.length).toBe(4);
    });

    test("inserts at end with position option", () => {
      const newRoute: CaddyRoute = { "@id": "new", priority: 100 };
      const result = insertRouteRelative(existingRoutes, newRoute, { position: "end" });

      expect(result[result.length - 1]["@id"]).toBe("new");
      expect(result.length).toBe(4);
    });

    test("inserts before specific route by @id", () => {
      const newRoute: CaddyRoute = { "@id": "new", priority: 20 };
      const result = insertRouteRelative(existingRoutes, newRoute, { beforeId: "api" });

      const apiIndex = result.findIndex((r) => r["@id"] === "api");
      expect(result[apiIndex - 1]["@id"]).toBe("new");
    });

    test("inserts after specific route by @id", () => {
      const newRoute: CaddyRoute = { "@id": "new", priority: 40 };
      const result = insertRouteRelative(existingRoutes, newRoute, { afterId: "api" });

      const apiIndex = result.findIndex((r) => r["@id"] === "api");
      expect(result[apiIndex + 1]["@id"]).toBe("new");
    });

    test("throws when beforeId is not found", () => {
      const newRoute: CaddyRoute = { "@id": "new" };

      expect(() =>
        insertRouteRelative(existingRoutes, newRoute, { beforeId: "nonexistent" })
      ).toThrow(/not found/i);
    });

    test("throws when afterId is not found", () => {
      const newRoute: CaddyRoute = { "@id": "new" };

      expect(() =>
        insertRouteRelative(existingRoutes, newRoute, { afterId: "nonexistent" })
      ).toThrow(/not found/i);
    });

    test("defaults to appending at end when no options provided", () => {
      const newRoute: CaddyRoute = { "@id": "new" };
      const result = insertRouteRelative(existingRoutes, newRoute);

      expect(result[result.length - 1]["@id"]).toBe("new");
    });

    test("does not mutate input routes array", () => {
      const newRoute: CaddyRoute = { "@id": "new" };
      const originalLength = existingRoutes.length;

      insertRouteRelative(existingRoutes, newRoute, { position: "end" });

      expect(existingRoutes.length).toBe(originalLength);
    });
  });

  describe("Integration: sortRoutes + validateRouteOrdering", () => {
    test("sorted routes pass validation", () => {
      const unsortedRoutes: CaddyRoute[] = [
        { "@id": "wildcard", match: [{ path: ["/*"] }] },
        { "@id": "health", match: [{ path: ["/health"] }] },
        { "@id": "api", match: [{ path: ["/api/*"] }] },
      ];

      const sorted = sortRoutes(unsortedRoutes);

      expect(() => validateRouteOrdering(sorted)).not.toThrow();
    });

    test("unsorted routes fail validation", () => {
      const unsortedRoutes: CaddyRoute[] = [
        { "@id": "api", match: [{ path: ["/api/*"] }], priority: 30 },
        { "@id": "health", match: [{ path: ["/health"] }], priority: 0 },
      ];

      expect(() => validateRouteOrdering(unsortedRoutes)).toThrow();
    });
  });
});
