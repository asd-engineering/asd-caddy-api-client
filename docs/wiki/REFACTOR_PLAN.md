# Caddy API Client Refactoring Plan

**Status**: 📋 Planning Phase
**Created**: 2025-11-19
**Goal**: Transform library from scenario-heavy implementation to clean, contract-based API

---

## Executive Summary

This document outlines a comprehensive refactoring to improve the caddy-api-client library's architecture, test organization, and developer experience. The refactor maintains 100% backward compatibility while introducing clearer abstractions and better test organization.

### Key Principles

1. **No Breaking Changes**: Existing API surface remains fully functional
2. **Incremental Migration**: Old and new APIs coexist during transition
3. **Contract-First Testing**: Clear separation between API contracts and scenarios
4. **Explicit over Implicit**: Route ordering, priorities, and behaviors are first-class concepts

---

## Current State Analysis

### Strengths ✅

- Comprehensive integration test coverage (123+ assertions)
- Real Caddy integration testing (not mocked)
- Production-ready features (auth, TLS, routing, load balancing)
- Strong type safety with TypeScript + Zod
- Certificate management utilities

### Weaknesses ❌

- **Monolithic Tests**: Single tests combine health + auth + routing + idempotency
- **Implicit Route Ordering**: Relies on array index, not explicit priority
- **Scattered Certificate Logic**: Utilities and domain helpers mixed across files
- **No Clear API Layers**: Low-level client and high-level helpers intertwined
- **Limited Test Helpers**: Repeated HTTP call patterns and assertions
- **Debug Experience**: Hard to diagnose failures without manual config inspection

---

## Architecture Improvements

### 1. API Layering

#### 1.1 Low-Level Client (Existing `CaddyClient`)

**Role**: Thin wrapper around Caddy Admin API
**Responsibility**: Type-safe HTTP calls only

```typescript
export class CaddyClient {
  // Existing methods (no changes)
  async getConfig(): Promise<CaddyConfig>;
  async getServers(): Promise<Record<string, CaddyServer>>;
  async patchServer(servers: Record<string, unknown>): Promise<void>;

  // Enhanced route methods
  async insertRoute(serverName: string, route: CaddyRoute, position: RoutePosition): Promise<void>;
  async getRoutes(serverName: string): Promise<CaddyRoute[]>;
  async replaceRouteById(serverName: string, routeId: string, route: CaddyRoute): Promise<boolean>;
  async removeRouteById(serverName: string, routeId: string): Promise<boolean>;
}
```

**Key Properties**:

- No opinion on route ordering
- No validation of route semantics
- Just types + HTTP calls

#### 1.2 High-Level Helpers (New)

**Role**: Opinionated, production-ready route builders
**Responsibility**: Encode .asd patterns and best practices

Create `src/caddy/helpers.ts`:

```typescript
/**
 * Create a standardized global health check route
 * Always evaluated first, accessible from any host
 */
export function createHealthRoute(options: {
  instanceId: string;
  path?: string;
  services?: number;
  version?: string;
}): CaddyRoute;

/**
 * Create service routes with standard security headers
 * Returns array: [redirect?, auth?, main route]
 */
export function createServiceRoutes(options: ServiceRouteOptions): CaddyRoute[];

/**
 * Create Basic Auth protected route (domain or path-level)
 */
export function createBasicAuthRoute(options: {
  host: string;
  path?: string;
  accounts: { username: string; password: string }[];
  upstream: string | { dial: string }[];
  realm?: string;
  headers?: Record<string, string[]>;
}): CaddyRoute;

/**
 * Create load-balanced route with health checks
 */
export function createLoadBalancerRoute(options: LoadBalancerRouteOptions): CaddyRoute;

/**
 * Create path rewriting route
 */
export function createRewriteRoute(options: {
  host: string;
  pathPrefix: string;
  stripPrefix: string;
  upstream: string | { dial: string }[];
  headers?: Record<string, string[]>;
}): CaddyRoute;
```

**Benefits**:

- Hide Caddy JSON complexity
- Standardize security headers
- Reduce boilerplate in tests
- Clear intent in code

---

### 2. Route Ordering Abstraction

#### Current Problem

Route ordering is implicit and relies on array manipulation:

```typescript
// Current approach (implicit)
const routes = [];
routes.push(healthRoute); // Must be first
routes.push(apiRoute); // Must be before catchAll
routes.push(catchAllRoute); // Must be last
```

This is fragile and not testable at the API level.

#### Solution: Priority System

Add explicit priority to routes:

```typescript
export interface CaddyRoute {
  "@id"?: string;
  priority?: number; // NEW: 0 = highest (health), 100 = lowest (catch-all)
  match?: CaddyMatch[];
  handle?: CaddyHandler[];
  terminal?: boolean;
}

export const ROUTE_PRIORITIES = {
  HEALTH: 0, // Global health checks
  AUTH_DOMAIN: 10, // Domain-level auth
  AUTH_PATH: 20, // Path-level auth
  SPECIFIC_PATH: 30, // /api/*, /admin/*
  WILDCARD: 90, // /*
  FALLBACK: 100, // Default catch-all
} as const;
```

#### New Ordering Functions

Create `src/caddy/ordering.ts`:

```typescript
/**
 * Sort routes by priority (explicit) and specificity (implicit)
 * Priority takes precedence, then path specificity
 */
export function sortRoutes(routes: CaddyRoute[]): CaddyRoute[];

/**
 * Calculate implicit priority from route match patterns
 * Used when priority is not explicitly set
 */
export function calculateRoutePriority(route: CaddyRoute): number;

/**
 * Validate route ordering against expected rules
 * Throws if ordering would cause routing issues
 */
export function validateRouteOrdering(routes: CaddyRoute[]): void;

/**
 * Insert route with relative positioning
 */
export function insertRouteRelative(
  routes: CaddyRoute[],
  route: CaddyRoute,
  options: {
    beforeId?: string;
    afterId?: string;
    position?: "beginning" | "end";
  }
): CaddyRoute[];
```

#### High-Level Helpers Use Priority

```typescript
export function createHealthRoute(options): CaddyRoute {
  return {
    "@id": "global-health",
    priority: ROUTE_PRIORITIES.HEALTH, // Explicit priority
    match: [{ path: [options.path ?? "/health"] }],
    handle: [
      /* ... */
    ],
  };
}

export function createBasicAuthRoute(options): CaddyRoute {
  const priority = options.path ? ROUTE_PRIORITIES.AUTH_PATH : ROUTE_PRIORITIES.AUTH_DOMAIN;

  return {
    "@id": options.id ?? `auth-${options.host}`,
    priority, // Explicit priority
    match: [{ host: [options.host], path: options.path ? [options.path] : undefined }],
    handle: [
      /* ... */
    ],
  };
}
```

#### Contract Tests for Ordering

New test suite `src/__tests__/routing-order.contract.test.ts`:

```typescript
describe("[CONTRACT] Route Ordering", () => {
  test("sortRoutes places health routes first", () => {
    const routes = [catchAll, health, apiRoute];
    const sorted = sortRoutes(routes);
    expect(sorted[0]["@id"]).toBe("global-health");
  });

  test("sortRoutes respects explicit priority over specificity", () => {
    const specific = { match: [{ path: ["/api/*"] }], priority: 50 };
    const generic = { match: [{ path: ["/*"] }], priority: 10 };
    const sorted = sortRoutes([specific, generic]);
    expect(sorted[0]).toBe(generic); // Lower priority number wins
  });

  test("calculateRoutePriority assigns lower numbers to more specific paths", () => {
    expect(calculateRoutePriority({ match: [{ path: ["/health"] }] })).toBeLessThan(
      calculateRoutePriority({ match: [{ path: ["/api/*"] }] })
    );
  });

  test("validateRouteOrdering throws when health route is not first", () => {
    const routes = [apiRoute, healthRoute];
    expect(() => validateRouteOrdering(routes)).toThrow(/health.*must be first/i);
  });
});
```

---

### 3. Certificate Management Abstraction

#### Current State

Certificate utilities are scattered:

- `src/utils/certificate.ts` - parsing, tagging, expiry
- `src/caddy/domains.ts` - rotation, cleanup
- No clear entry point

#### Solution: CertificateManager

Create `src/caddy/certificates.ts`:

```typescript
/**
 * Certificate management facade
 * Bundles all certificate operations in one place
 */
export class CertificateManager {
  constructor(private client: CaddyClient) {}

  /**
   * Inspect certificate metadata
   */
  async inspect(certPem: string): Promise<CertificateInfo> {
    return parseCertificate(certPem);
  }

  /**
   * Rotate certificate with zero downtime
   * Returns new certificate tag
   */
  async rotate(domain: string, certPath: string, keyPath: string): Promise<string> {
    // Implementation from rotateCertificate()
  }

  /**
   * Remove old certificates after rotation
   * Returns number of certificates removed
   */
  async cleanupOld(domain: string, keepTag: string): Promise<number> {
    // Implementation from removeOldCertificates()
  }

  /**
   * List all certificates for a domain
   */
  async list(domain: string): Promise<CertificateInfo[]> {
    // NEW: Query Caddy for all certs matching domain
  }

  /**
   * Check if any certificates are expiring soon
   */
  async checkExpiration(
    domain: string,
    thresholdDays: number = 30
  ): Promise<{ expiringSoon: boolean; certificates: CertificateInfo[] }> {
    // NEW: Combine list() + isCertificateExpiringSoon()
  }
}
```

#### Migration Path

1. Create `CertificateManager` class
2. Move `rotateCertificate` and `removeOldCertificates` logic into manager
3. Keep existing exported functions as thin wrappers (backward compatibility):

```typescript
// src/caddy/domains.ts (backward compatibility)
export async function rotateCertificate(...args) {
  const manager = new CertificateManager(client);
  return manager.rotate(...args);
}
```

4. Update documentation to recommend `CertificateManager`
5. Eventually deprecate standalone functions (major version bump)

#### Contract Tests for Certificates

New test suite `src/__tests__/certificates.contract.test.ts`:

```typescript
describe("[CONTRACT] CertificateManager", () => {
  test("inspect returns valid certificate info", async () => {
    const info = await manager.inspect(testCertPem);
    expect(info).toHaveProperty("subject");
    expect(info).toHaveProperty("serialNumber");
    expect(info).toHaveProperty("notBefore");
    expect(info).toHaveProperty("notAfter");
  });

  test("rotate returns new cert tag", async () => {
    const tag = await manager.rotate("example.com", certPath, keyPath);
    expect(tag).toMatch(/^example\.com-[a-f0-9]+-\d+$/);
  });

  test("cleanupOld removes old certs but keeps current", async () => {
    const removed = await manager.cleanupOld("example.com", currentTag);
    expect(removed).toBeGreaterThanOrEqual(0);
    // Verify current cert still exists
  });

  test("checkExpiration detects expiring certificates", async () => {
    const result = await manager.checkExpiration("example.com", 30);
    expect(result).toHaveProperty("expiringSoon");
    expect(result.certificates).toBeInstanceOf(Array);
  });
});
```

---

## Test Suite Refactoring

### Current Issues

1. **Monolithic Tests**: `asd-complex-scenario.integration.test.ts` tests everything
2. **Repeated Patterns**: HTTP calls and assertions duplicated across tests
3. **No Clear Contracts**: Hard to know which tests define API guarantees vs scenarios
4. **Debug Difficulty**: Test failures don't show Caddy config state

### Solution: Concern-Based Test Suites

#### Test Organization

```
src/__tests__/
├── unit/                          # Unit tests (no Caddy)
│   ├── certificate.test.ts        # Certificate parsing utilities
│   ├── schemas.test.ts            # Zod schema validation
│   ├── ordering.test.ts           # Route ordering logic (NEW)
│   └── helpers.test.ts            # High-level helper functions (NEW)
│
├── contract/                      # API contract tests (NEW)
│   ├── client.contract.test.ts    # CaddyClient guarantees
│   ├── routing-order.contract.test.ts
│   ├── auth-patterns.contract.test.ts
│   ├── idempotency.contract.test.ts
│   ├── certificates.contract.test.ts
│   └── upstream-formats.contract.test.ts
│
├── integration/                   # Integration tests (Caddy required)
│   ├── topology.integration.test.ts      # Multi-service topology (SCENARIO)
│   ├── mixed-servers.integration.test.ts # HTTP + HTTPS servers (SCENARIO)
│   ├── dynamic-ports.integration.test.ts # .asd port allocation (SCENARIO)
│   ├── load-balancing.integration.test.ts # Load balancer scenarios
│   └── __fixtures__/              # Config snapshots
│       ├── topology-config.json
│       └── mixed-servers-config.json
│
└── helpers/                       # Test utilities (NEW)
    ├── http.ts                    # HTTP request helpers
    ├── assertions.ts              # Custom assertions
    └── fixtures.ts                # Test data builders
```

#### Contract vs Scenario Tests

**Contract Tests** (`[CONTRACT]`):

- Define API guarantees and invariants
- Stable, should rarely change
- Breaking these = breaking change
- Examples:
  - Route ordering rules
  - Authentication behavior (401, WWW-Authenticate)
  - Idempotency guarantees
  - Certificate rotation behavior

**Scenario Tests** (`[SCENARIO]`):

- Model realistic deployment topologies
- Can evolve with product
- Examples:
  - Full .asd production setup
  - Multi-service configurations
  - Dynamic port allocation

---

### Test Helper Functions

Create `src/__tests__/helpers/http.ts`:

```typescript
import http from "http";

export interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/**
 * Make HTTP request to Caddy test server
 */
export async function callCaddy(options: {
  host: string;
  path: string;
  port?: number;
  auth?: { username: string; password: string };
}): Promise<HttpResponse> {
  // Implementation from existing httpRequest helper
}

/**
 * Call global health endpoint
 */
export async function callHealth(hostHeader: string, port = 8080): Promise<HttpResponse> {
  return callCaddy({ host: hostHeader, path: "/health", port });
}

/**
 * Call service endpoint with auth if provided
 */
export async function callService(options: {
  host: string;
  path: string;
  auth?: { username: string; password: string };
  port?: number;
}): Promise<HttpResponse> {
  return callCaddy(options);
}
```

Create `src/__tests__/helpers/assertions.ts`:

```typescript
import type { HttpResponse } from "./http";

/**
 * Assert response is from specific backend
 * Based on "Hello from backend X" pattern
 */
export function expectBackend(response: HttpResponse, backendIndex: 1 | 2 | 3): void {
  expect(response.body).toContain(`Hello from backend ${backendIndex}`);
}

/**
 * Assert standard ASD service headers are present
 */
export function expectServiceHeaders(
  response: HttpResponse,
  expected: {
    serviceId?: string;
    serviceType?: string;
    authType?: string;
  }
): void {
  if (expected.serviceId) {
    expect(response.headers["x-asd-service-id"]).toBe(expected.serviceId);
  }
  if (expected.serviceType) {
    expect(response.headers["x-asd-service-type"]).toBe(expected.serviceType);
  }
  if (expected.authType) {
    expect(response.headers["x-asd-auth-type"]).toBe(expected.authType);
  }
}

/**
 * Assert security headers are present
 */
export function expectSecurityHeaders(
  response: HttpResponse,
  expected: {
    frameOptions?: string;
    contentTypeOptions?: string;
  } = {}
): void {
  if (expected.frameOptions) {
    expect(response.headers["x-frame-options"]).toBe(expected.frameOptions);
  }
  if (expected.contentTypeOptions) {
    expect(response.headers["x-content-type-options"]).toBe(expected.contentTypeOptions);
  }
}

/**
 * Assert authentication is required (401 + WWW-Authenticate)
 */
export function expectAuthRequired(response: HttpResponse, realm?: string): void {
  expect(response.statusCode).toBe(401);
  expect(response.headers["www-authenticate"]).toBeDefined();
  if (realm) {
    expect(response.headers["www-authenticate"]).toContain(`realm="${realm}"`);
  }
}

/**
 * Assert authentication succeeded (200)
 */
export function expectAuthSuccess(response: HttpResponse): void {
  expect(response.statusCode).toBe(200);
}
```

Create `src/__tests__/helpers/fixtures.ts`:

```typescript
/**
 * Standard test credentials
 */
export const TEST_CREDENTIALS = {
  admin: {
    username: "admin",
    password: "admin123",
    hash: "$2a$14$lVk5aohGe.EmndSm6H1uJeOI/lOcaTHoJYSk/8dn1DDsW5NbNqVLW",
  },
  apiUser: {
    username: "apiuser",
    password: "apipass",
    hash: "$2a$14$6bYQvFSJUbyRLQ3vjnjBWu1ea6Sj3GiJAcp4vaVXF0NtuNhhs7.x.",
  },
} as const;

/**
 * Standard test upstreams
 */
export const TEST_UPSTREAMS = {
  backend1: "echo-test:5678",
  backend2: "echo-test-2:5679",
  backend3: "echo-test-3:5680",
} as const;

/**
 * Build test route with defaults
 */
export function buildTestRoute(overrides: Partial<CaddyRoute>): CaddyRoute {
  return {
    "@id": "test-route",
    match: [{ host: ["test.localhost"] }],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: TEST_UPSTREAMS.backend1 }],
      },
    ],
    terminal: true,
    ...overrides,
  };
}
```

---

### New Test Suites

#### 1. Routing Order Contract Test

`src/__tests__/contract/routing-order.contract.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../caddy/client";
import { createHealthRoute, createServiceRoutes } from "../../caddy/helpers";
import { sortRoutes, ROUTE_PRIORITIES } from "../../caddy/ordering";
import { callCaddy, callHealth } from "../helpers/http";

describe("[CONTRACT] Route Ordering", () => {
  let client: CaddyClient;
  const SERVER = "test-routing-order";

  beforeAll(async () => {
    client = new CaddyClient();
    // Setup test server
  });

  afterAll(async () => {
    // Cleanup
  });

  describe("sortRoutes", () => {
    test("places health routes first regardless of input order", () => {
      const health = createHealthRoute({ instanceId: "test" });
      const api = createServiceRoutes({
        /* ... */
      })[0];
      const catchAll = createServiceRoutes({
        /* ... */
      })[0];

      const sorted = sortRoutes([catchAll, api, health]);
      expect(sorted[0]["@id"]).toBe("global-health");
    });

    test("places more specific paths before wildcards", () => {
      const wildcard = { match: [{ path: ["/*"] }], priority: ROUTE_PRIORITIES.WILDCARD };
      const specific = { match: [{ path: ["/api/*"] }], priority: ROUTE_PRIORITIES.SPECIFIC_PATH };

      const sorted = sortRoutes([wildcard, specific]);
      expect(sorted[0]).toBe(specific);
    });

    test("respects explicit priority over path specificity", () => {
      const lowPriority = { match: [{ path: ["/api/*"] }], priority: 100 };
      const highPriority = { match: [{ path: ["/*"] }], priority: 10 };

      const sorted = sortRoutes([lowPriority, highPriority]);
      expect(sorted[0]).toBe(highPriority);
    });
  });

  describe("Caddy integration", () => {
    test("health endpoint is accessible before service routes are matched", async () => {
      // Setup routes: service on /*, health on /health
      const routes = sortRoutes([
        createServiceRoutes({ host: "test.localhost", upstream: "backend:8080" })[0],
        createHealthRoute({ instanceId: "test" }),
      ]);

      await client.patchServer({ [SERVER]: { routes } });

      // Health should be accessible despite /* catch-all
      const health = await callHealth("test.localhost");
      expect(health.statusCode).toBe(200);
      expect(health.headers["x-asd-health"]).toBe("ok");
    });

    test("/api/* is matched before /* catch-all", async () => {
      const routes = sortRoutes([
        createServiceRoutes({
          host: "test.localhost",
          path: "/api/*",
          upstream: "api-backend:8080",
          priority: ROUTE_PRIORITIES.SPECIFIC_PATH,
        })[0],
        createServiceRoutes({
          host: "test.localhost",
          path: "/*",
          upstream: "default-backend:8080",
          priority: ROUTE_PRIORITIES.WILDCARD,
        })[0],
      ]);

      await client.patchServer({ [SERVER]: { routes } });

      const apiResponse = await callCaddy({ host: "test.localhost", path: "/api/users" });
      expectBackend(apiResponse, "api-backend");

      const defaultResponse = await callCaddy({ host: "test.localhost", path: "/other" });
      expectBackend(defaultResponse, "default-backend");
    });
  });
});
```

#### 2. Authentication Patterns Contract Test

`src/__tests__/contract/auth-patterns.contract.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../caddy/client";
import { createBasicAuthRoute, createServiceRoutes } from "../../caddy/helpers";
import { callService } from "../helpers/http";
import { expectAuthRequired, expectAuthSuccess, expectServiceHeaders } from "../helpers/assertions";
import { TEST_CREDENTIALS } from "../helpers/fixtures";

describe("[CONTRACT] Authentication Patterns", () => {
  let client: CaddyClient;
  const SERVER = "test-auth";

  beforeAll(async () => {
    client = new CaddyClient();
    // Setup server with auth routes
  });

  afterAll(async () => {
    // Cleanup
  });

  describe("Domain-level authentication", () => {
    test("entire domain requires authentication", async () => {
      const route = createBasicAuthRoute({
        host: "admin.localhost",
        accounts: [TEST_CREDENTIALS.admin],
        upstream: "admin-backend:8080",
        realm: "Admin Area",
      });

      await client.patchServer({ [SERVER]: { routes: [route] } });

      // No auth = 401
      const noAuth = await callService({ host: "admin.localhost", path: "/" });
      expectAuthRequired(noAuth, "Admin Area");

      // Wrong auth = 401
      const wrongAuth = await callService({
        host: "admin.localhost",
        path: "/",
        auth: { username: "admin", password: "wrong" },
      });
      expectAuthRequired(wrongAuth);

      // Correct auth = 200
      const correctAuth = await callService({
        host: "admin.localhost",
        path: "/",
        auth: TEST_CREDENTIALS.admin,
      });
      expectAuthSuccess(correctAuth);
    });

    test("credentials are scoped to specific service", async () => {
      const adminRoute = createBasicAuthRoute({
        host: "admin.localhost",
        accounts: [TEST_CREDENTIALS.admin],
        upstream: "admin-backend:8080",
      });

      const apiRoute = createBasicAuthRoute({
        host: "api.localhost",
        accounts: [TEST_CREDENTIALS.apiUser],
        upstream: "api-backend:8080",
      });

      await client.patchServer({ [SERVER]: { routes: [adminRoute, apiRoute] } });

      // Admin creds don't work on API service
      const response = await callService({
        host: "api.localhost",
        path: "/",
        auth: TEST_CREDENTIALS.admin, // Wrong service
      });
      expectAuthRequired(response);
    });
  });

  describe("Path-level authentication", () => {
    test("specific paths require authentication, others are public", async () => {
      const authRoute = createBasicAuthRoute({
        host: "api.localhost",
        path: "/admin/*",
        accounts: [TEST_CREDENTIALS.admin],
        upstream: "admin-api:8080",
      });

      const publicRoute = createServiceRoutes({
        host: "api.localhost",
        path: "/*",
        upstream: "public-api:8080",
      })[0];

      await client.patchServer({ [SERVER]: { routes: [authRoute, publicRoute] } });

      // Public path = no auth required
      const publicResponse = await callService({ host: "api.localhost", path: "/users" });
      expect(publicResponse.statusCode).toBe(200);

      // Admin path = auth required
      const adminNoAuth = await callService({ host: "api.localhost", path: "/admin/settings" });
      expectAuthRequired(adminNoAuth);

      // Admin path with auth = success
      const adminWithAuth = await callService({
        host: "api.localhost",
        path: "/admin/settings",
        auth: TEST_CREDENTIALS.admin,
      });
      expectAuthSuccess(adminWithAuth);
    });
  });

  describe("Multiple accounts per service", () => {
    test("any valid account grants access", async () => {
      const route = createBasicAuthRoute({
        host: "shared.localhost",
        accounts: [TEST_CREDENTIALS.admin, TEST_CREDENTIALS.apiUser],
        upstream: "shared-backend:8080",
      });

      await client.patchServer({ [SERVER]: { routes: [route] } });

      // Admin creds work
      const adminResponse = await callService({
        host: "shared.localhost",
        path: "/",
        auth: TEST_CREDENTIALS.admin,
      });
      expectAuthSuccess(adminResponse);

      // API user creds work
      const apiResponse = await callService({
        host: "shared.localhost",
        path: "/",
        auth: TEST_CREDENTIALS.apiUser,
      });
      expectAuthSuccess(apiResponse);
    });
  });
});
```

#### 3. Idempotency Contract Test

`src/__tests__/contract/idempotency.contract.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../caddy/client";
import { createHealthRoute, createServiceRoutes } from "../../caddy/helpers";

describe("[CONTRACT] Idempotency", () => {
  let client: CaddyClient;
  const SERVER = "test-idempotency";

  beforeAll(async () => {
    client = new CaddyClient();
  });

  afterAll(async () => {
    // Cleanup
  });

  test("applying same configuration twice produces identical state", async () => {
    const routes = [
      createHealthRoute({ instanceId: "test" }),
      createServiceRoutes({ host: "app.localhost", upstream: "backend:8080" })[0],
    ];

    const config = { [SERVER]: { routes, listen: [":8080"] } };

    // First application
    await client.patchServer(config);
    const state1 = await client.getServers();

    // Second application (idempotent)
    await client.patchServer(config);
    const state2 = await client.getServers();

    // States should be identical
    expect(state1).toEqual(state2);
  });

  test("route insertion is idempotent when route @id exists", async () => {
    const route = createHealthRoute({ instanceId: "test" });
    route["@id"] = "unique-route";

    await client.insertRoute(SERVER, route, "end");
    const routes1 = await client.getRoutes(SERVER);

    await client.insertRoute(SERVER, route, "end");
    const routes2 = await client.getRoutes(SERVER);

    // Should not duplicate routes
    expect(routes1.length).toBe(routes2.length);
  });
});
```

#### 4. Topology Integration Test (Scenario)

`src/__tests__/integration/topology.integration.test.ts`:

This replaces the monolithic `asd-complex-scenario.integration.test.ts` with a focused topology test.

```typescript
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { CaddyClient } from "../../caddy/client";
import { createHealthRoute, createServiceRoutes, createBasicAuthRoute } from "../../caddy/helpers";
import { sortRoutes } from "../../caddy/ordering";
import { callHealth, callService } from "../helpers/http";
import { expectServiceHeaders, expectSecurityHeaders } from "../helpers/assertions";
import { TEST_UPSTREAMS, TEST_CREDENTIALS } from "../helpers/fixtures";

describe("[SCENARIO] Multi-Service Production Topology", () => {
  let client: CaddyClient;
  const SERVER = "complex-scenario";

  beforeAll(async () => {
    if (!process.env.INTEGRATION_TEST) {
      return;
    }

    client = new CaddyClient();

    // Build production-like topology
    const routes = sortRoutes([
      createHealthRoute({ instanceId: "prod-cluster-1", services: 10 }),

      // Public services
      ...createServiceRoutes({
        host: "studio.localhost",
        upstream: TEST_UPSTREAMS.backend1,
        serviceId: "code-server-main",
        serviceType: "ide",
      }),

      // Auth-protected services
      createBasicAuthRoute({
        host: "admin.localhost",
        accounts: [TEST_CREDENTIALS.admin],
        upstream: TEST_UPSTREAMS.backend2,
        realm: "Admin Dashboard",
      }),

      // ... more services
    ]);

    await client.patchServer({ [SERVER]: { routes, listen: [":8080"] } });

    // Save snapshot if requested
    if (process.env.UPDATE_SNAPSHOTS === "true") {
      await saveSnapshot(SERVER, "topology-config.json");
    }
  });

  afterAll(async () => {
    if (!process.env.INTEGRATION_TEST) {
      return;
    }
    // Cleanup
  });

  test("global health check is accessible from all hosts", async () => {
    const hosts = ["studio.localhost", "admin.localhost", "api.localhost"];

    for (const host of hosts) {
      const response = await callHealth(host);
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-asd-health"]).toBe("ok");
      expect(response.headers["x-asd-instance"]).toBe("prod-cluster-1");
    }
  });

  test("each service responds with correct backend and headers", async () => {
    const services = [
      { host: "studio.localhost", path: "/", backend: 1, serviceId: "code-server-main" },
      { host: "db.localhost", path: "/", backend: 2, serviceId: "database-ui" },
      // ... more services
    ];

    for (const service of services) {
      const response = await callService({ host: service.host, path: service.path });
      expect(response.statusCode).toBe(200);
      expectBackend(response, service.backend);
      expectServiceHeaders(response, { serviceId: service.serviceId });
      expectSecurityHeaders(response, { contentTypeOptions: "nosniff" });
    }
  });

  test("authenticated services require valid credentials", async () => {
    const authServices = [
      { host: "admin.localhost", path: "/", credentials: TEST_CREDENTIALS.admin },
      { host: "api.localhost", path: "/admin/settings", credentials: TEST_CREDENTIALS.apiUser },
    ];

    for (const service of authServices) {
      // No auth = 401
      const noAuth = await callService({ host: service.host, path: service.path });
      expectAuthRequired(noAuth);

      // With auth = 200
      const withAuth = await callService({
        host: service.host,
        path: service.path,
        auth: service.credentials,
      });
      expectAuthSuccess(withAuth);
    }
  });
});
```

---

## DX and Observability Improvements

### 1. Debug Logging

Add optional debug output for test failures.

Create `src/__tests__/helpers/debug.ts`:

```typescript
import type { CaddyClient } from "../../caddy/client";

export async function debugCaddyConfig(client: CaddyClient): Promise<void> {
  if (!process.env.DEBUG_CADDY_CONFIG) {
    return;
  }

  console.log("\n=== CADDY CONFIGURATION DEBUG ===");

  const servers = await client.getServers();
  console.log("\nServers:");
  console.log(JSON.stringify(servers, null, 2));

  const config = await client.getConfig();
  console.log("\nFull Config:");
  console.log(JSON.stringify(config, null, 2));

  console.log("\n=== END DEBUG ===\n");
}

export function wrapTestWithDebug(
  client: CaddyClient,
  testFn: () => Promise<void>
): () => Promise<void> {
  return async () => {
    try {
      await testFn();
    } catch (error) {
      await debugCaddyConfig(client);
      throw error;
    }
  };
}
```

Usage in tests:

```typescript
import { wrapTestWithDebug } from "../helpers/debug";

test(
  "route ordering",
  wrapTestWithDebug(client, async () => {
    // Test code...
    // If this fails, debugCaddyConfig() will run automatically
  })
);
```

Run with debug:

```bash
DEBUG_CADDY_CONFIG=true INTEGRATION_TEST=true bun test
```

### 2. Enhanced Snapshots

Current snapshots are raw Caddy JSON. Add high-level abstraction snapshots.

Create `src/__tests__/helpers/snapshots.ts`:

```typescript
/**
 * Extract high-level topology from Caddy config
 * This is what our library promises, not Caddy's internals
 */
export function extractTopology(routes: CaddyRoute[]): Topology {
  return {
    services: routes
      .filter((r) => r["@id"] !== "global-health")
      .map((r) => ({
        id: r["@id"],
        host: r.match?.[0]?.host?.[0] ?? "unknown",
        path: r.match?.[0]?.path?.[0] ?? "/*",
        hasAuth: r.handle?.some((h) => h.handler === "authentication") ?? false,
        upstream: extractUpstream(r),
      })),
    health: routes.find((r) => r["@id"] === "global-health")
      ? {
          path:
            routes.find((r) => r["@id"] === "global-health")?.match?.[0]?.path?.[0] ?? "/health",
          instanceId: extractInstanceId(routes.find((r) => r["@id"] === "global-health")),
        }
      : null,
  };
}

export async function saveTopologySnapshot(
  client: CaddyClient,
  serverName: string,
  filename: string
): Promise<void> {
  const routes = await client.getRoutes(serverName);
  const topology = extractTopology(routes);

  const path = join(process.cwd(), "src", "__tests__", "integration", "__fixtures__", filename);
  await writeFile(path, JSON.stringify(topology, null, 2), "utf-8");
}
```

Usage:

```typescript
test("topology snapshot", async () => {
  // Setup routes...

  if (process.env.UPDATE_SNAPSHOTS === "true") {
    // Save both raw and abstraction snapshots
    await saveSnapshot(SERVER, "topology-raw.json");
    await saveTopologySnapshot(client, SERVER, "topology-abstraction.json");
  }

  // Load and compare abstraction snapshot
  const topology = extractTopology(await client.getRoutes(SERVER));
  expect(topology).toMatchSnapshot();
});
```

### 3. Focused Test Runs

Support running specific test suites via environment flags.

Update `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest src/__tests__/unit",
    "test:contract": "INTEGRATION_TEST=true vitest src/__tests__/contract",
    "test:integration": "INTEGRATION_TEST=true vitest src/__tests__/integration",
    "test:auth": "INTEGRATION_TEST=true vitest src/__tests__/contract/auth-patterns",
    "test:routing": "INTEGRATION_TEST=true vitest src/__tests__/contract/routing-order",
    "test:all": "INTEGRATION_TEST=true vitest"
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Establish new abstractions without breaking existing code

1. ✅ Create `src/caddy/ordering.ts` with priority system
2. ✅ Create `src/caddy/helpers.ts` with high-level builders
3. ✅ Create `src/caddy/certificates.ts` with CertificateManager
4. ✅ Create test helpers in `src/__tests__/helpers/`
5. ✅ Add backward-compatible wrappers for existing functions

**Deliverables**:

- New modules exist alongside old code
- All existing tests still pass
- No breaking changes

### Phase 2: Contract Tests (Week 2)

**Goal**: Define API contracts with focused test suites

1. ✅ Create `src/__tests__/contract/routing-order.contract.test.ts`
2. ✅ Create `src/__tests__/contract/auth-patterns.contract.test.ts`
3. ✅ Create `src/__tests__/contract/idempotency.contract.test.ts`
4. ✅ Create `src/__tests__/contract/certificates.contract.test.ts`
5. ✅ Create `src/__tests__/contract/upstream-formats.contract.test.ts`

**Deliverables**:

- 50+ contract tests defining API guarantees
- All contract tests pass
- Clear separation between contracts and scenarios

### Phase 3: Integration Test Refactor (Week 3)

**Goal**: Split monolithic integration tests into focused scenarios

1. ✅ Create `src/__tests__/integration/topology.integration.test.ts`
2. ✅ Create `src/__tests__/integration/mixed-servers.integration.test.ts`
3. ✅ Create `src/__tests__/integration/dynamic-ports.integration.test.ts`
4. ✅ Migrate assertions to use test helpers
5. ✅ Keep `asd-complex-scenario.integration.test.ts` as legacy (deprecated)

**Deliverables**:

- Clear, focused integration tests
- Test helpers eliminate duplication
- Snapshots for both raw config and abstraction

### Phase 4: Documentation & Migration (Week 4)

**Goal**: Guide users to new APIs

1. ✅ Update README with new API examples
2. ✅ Add migration guide (old API → new API)
3. ✅ Update FEATURE_ROADMAP.md with refactor status
4. ✅ Add JSDoc examples to new helper functions
5. ✅ Mark old functions as `@deprecated` (but keep working)

**Deliverables**:

- Clear documentation of new API surface
- Migration path for existing users
- No breaking changes (yet)

### Phase 5: Cleanup (Future)

**Goal**: Remove deprecated code in major version bump

1. ⏳ Remove deprecated functions from `src/caddy/domains.ts`
2. ⏳ Remove legacy integration tests
3. ⏳ Bump major version (e.g., 2.0.0)

**Deliverables**:

- Clean, focused codebase
- No legacy code

---

## Acceptance Criteria

This refactor is complete when:

### API Clarity ✅

- [ ] Low-level `CaddyClient` is clearly separated from high-level helpers
- [ ] Route ordering is explicit via priority system
- [ ] `CertificateManager` bundles all certificate operations
- [ ] High-level helpers (`createHealthRoute`, `createServiceRoutes`, etc.) exist
- [ ] All new APIs have JSDoc documentation

### Test Organization ✅

- [ ] Contract tests exist for:
  - [ ] Route ordering
  - [ ] Authentication patterns
  - [ ] Idempotency
  - [ ] Certificate management
  - [ ] Upstream formats
- [ ] Integration tests are split by concern (topology, mixed servers, dynamic ports)
- [ ] Test helpers eliminate duplication
- [ ] Tests are tagged `[CONTRACT]` or `[SCENARIO]`

### DX Improvements ✅

- [ ] Debug logging available via `DEBUG_CADDY_CONFIG` env var
- [ ] High-level topology snapshots available
- [ ] Focused test runs via npm scripts
- [ ] Test failures show clear error messages

### No Regressions ✅

- [ ] All existing tests pass
- [ ] All existing features work
- [ ] No breaking changes to public API
- [ ] Backward compatibility maintained

---

## Open Questions

1. **Priority Numbering**: Should we use 0-100 scale or 0-1000? (Allows for finer-grained insertion)
2. **CertificateManager Instance**: Should it be a class instance or just exported functions? (Class allows state, functions are simpler)
3. **Deprecation Timeline**: When should we remove deprecated functions? (Next major version? Never?)
4. **Snapshot Format**: Should we commit both raw and abstraction snapshots? (Abstraction is clearer, raw is complete)

---

## Next Steps

1. **Review this plan** with team/stakeholders
2. **Answer open questions** above
3. **Start Phase 1** - Create new abstractions
4. **Iterate incrementally** - No big-bang refactor

---

**Document Version**: 1.0
**Last Updated**: 2025-11-19
**Owner**: Claude Code Assistant
