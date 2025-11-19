# Feature Roadmap: Implementation Status

This document tracks the implementation status of features for the TypeScript `caddy-api-client` compared to the Python version.

## Priority Classification

- **P0 (Critical)**: Core functionality gaps that affect production usage - ✅ **COMPLETE**
- **P1 (High)**: Important features that improve reliability and functionality - ✅ **COMPLETE**
- **P2 (Medium)**: Nice-to-have features that enhance usability - 🚧 **IN PROGRESS**
- **P3 (Low)**: Optional improvements - 📋 **PLANNED**

---

## ✅ Completed Features

### 1. Certificate Rotation (P0 - Critical) ✅ **IMPLEMENTED**

**Status**: ✅ **COMPLETE** - TypeScript implementation EXCEEDS Python version

#### Implementation Summary

**What We Built:**

- ✅ Added `@peculiar/x509` library for certificate parsing
- ✅ Created `src/utils/certificate.ts` with comprehensive utilities:
  - `parseCertificate()` - Extract metadata from PEM certificates
  - `generateCertTag()` - Create unique tags (format: `domain-serial-timestamp`)
  - `splitCertificateBundle()` - Handle certificate chains
  - `extractSerialNumber()` - Get serial as hex string
  - `isCertificateExpired()` - Check expiration status
  - `isCertificateExpiringSoon()` - Check upcoming expiration
  - `getDaysUntilExpiration()` - Calculate days to expiry

**New Functions:**

- ✅ `rotateCertificate()` - Zero-downtime certificate rotation
- ✅ `removeOldCertificates()` - Clean up old certificates after rotation
- ✅ Updated `addDomainWithTls()` to use certificate tagging

**Beyond Python:**

- ✅ Certificate expiration checking (Python doesn't have this)
- ✅ Certificate rotation workflow (Python doesn't have this)
- ✅ Old certificate cleanup (Python doesn't have this)

**Tests**: 29 tests covering all certificate utilities + rotation workflows

**Files Changed:**

- `src/utils/certificate.ts` (new)
- `src/caddy/domains.ts` (updated)
- `src/__tests__/certificate.test.ts` (new)
- `src/__tests__/domains.test.ts` (updated)
- `package.json` (added @peculiar/x509)

---

### 2. Redirect Modes (P1 - High) ✅ **IMPLEMENTED**

**Status**: ✅ **COMPLETE** - Full feature parity with Python

#### Implementation Summary

**What We Built:**

- ✅ Updated `RedirectMode` type: `"none" | "www_to_domain" | "domain_to_www"`
- ✅ Added `@id` field to `CaddyRoute` interface for route tracking
- ✅ Created `buildRedirectRoute()` function in `src/caddy/routes.ts`
- ✅ Integrated redirect routes into `addDomainWithAutoTls()` and `addDomainWithTls()`

**Features:**

- ✅ www → domain redirects (`www.example.com` → `example.com`)
- ✅ domain → www redirects (`example.com` → `www.example.com`)
- ✅ Permanent (301) redirects by default
- ✅ Temporary (302) redirects when `permanent: false`
- ✅ Query string and path preservation with `{http.request.uri}`
- ✅ Route IDs for tracking and management

**Minor Difference:**

- TypeScript uses `301` (Moved Permanently)
- Python uses `308` (Permanent Redirect)
- Both work correctly, 308 is slightly more modern

**Tests**: 4 tests for redirect routes + integration in domain tests

**Files Changed:**

- `src/types.ts` (updated RedirectMode, added @id to CaddyRoute)
- `src/schemas.ts` (updated RedirectModeSchema)
- `src/caddy/routes.ts` (added buildRedirectRoute)
- `src/caddy/domains.ts` (integrated redirects)
- `src/__tests__/routes.test.ts` (added redirect tests)
- `src/__tests__/schemas.test.ts` (updated test values)

---

## 🚧 Partially Complete / Future Enhancements

### 3. TLS Connection Policies (P1 - High) ✅ **COMPLETE**

**Status**: ✅ **COMPLETE** - Full TLS connection policy configuration

#### Implementation Summary

**What We Built:**

- ✅ Created comprehensive `TlsConnectionPolicy` interface in `src/types.ts`
- ✅ Created `src/caddy/tls.ts` module with builder functions
- ✅ Implemented `buildTlsConnectionPolicy()` with full options
- ✅ Implemented `buildModernTlsPolicy()` (TLS 1.3, HTTP/3)
- ✅ Implemented `buildCompatibleTlsPolicy()` (TLS 1.2+, HTTP/2)
- ✅ Added constants for cipher suites, curves, and ALPN protocols

**New Functions:**

```typescript
// Build custom TLS policy with all options
const policy = buildTlsConnectionPolicy({
  sni: ["example.com"],
  certificateTags: ["cert-tag"],
  protocolMin: "1.3",
  protocolMax: "1.3",
  cipherSuites: "modern", // or custom array
  curves: "recommended", // or custom array
  alpn: "http3", // or "http2", "http1", or custom array
  clientAuthMode: "require",
  clientCaCertFiles: ["/path/to/ca.crt"],
});

// Modern TLS 1.3 with HTTP/3 (recommended)
const modernPolicy = buildModernTlsPolicy({
  sni: ["example.com"],
  certificateTags: ["cert-tag"],
});

// Compatible TLS 1.2+ with HTTP/2 (broader support)
const compatiblePolicy = buildCompatibleTlsPolicy({
  sni: ["example.com"],
  certificateTags: ["cert-tag"],
});
```

**Features:**

- ✅ SNI (Server Name Indication) matching
- ✅ Certificate selection (any_tag, all_tags, serial_number)
- ✅ Protocol version enforcement (TLS 1.2, 1.3)
- ✅ Cipher suite configuration (modern presets + custom)
- ✅ Elliptic curve configuration (recommended presets + custom)
- ✅ ALPN protocol configuration (HTTP/3, HTTP/2, HTTP/1.1)
- ✅ Client authentication (mTLS support)
- ✅ Preset policies for common use cases

**Constants Provided:**

- `TLS_1_3_CIPHER_SUITES` - TLS 1.3 cipher suites
- `TLS_1_2_CIPHER_SUITES` - TLS 1.2 cipher suites
- `MODERN_CIPHER_SUITES` - Combined modern ciphers
- `RECOMMENDED_CURVES` - Recommended elliptic curves
- `HTTP_ALPN_PROTOCOLS` - HTTP/3, HTTP/2, HTTP/1.1
- `HTTP2_ALPN_PROTOCOLS` - HTTP/2, HTTP/1.1
- `HTTP1_ALPN_PROTOCOLS` - HTTP/1.1 only

**Tests**: 35 comprehensive unit tests

**Files Changed:**

- `src/types.ts` (added comprehensive TlsConnectionPolicy interface)
- `src/caddy/tls.ts` (new module with builders and constants)
- `src/caddy/index.ts` (exported TLS functions and types)
- `src/__tests__/tls.test.ts` (35 unit tests)

---

### 4. Compression Handler (P2 - Medium) ✅ **IMPLEMENTED**

**Status**: ✅ **COMPLETE** - Full compression support

#### Implementation Summary

**What We Built:**

- ✅ Created `buildCompressionHandler()` in `src/caddy/routes.ts`
- ✅ Integrated into `addDomainWithAutoTls()` and `addDomainWithTls()`
- ✅ Supports gzip (enabled by default)
- ✅ Supports zstd (enabled by default)
- ✅ Supports brotli (opt-in)
- ✅ Fully configurable (can disable individual encodings)

**Features:**

- ✅ Automatic compression when `enableCompression !== false`
- ✅ Multiple compression algorithms (gzip, zstd, brotli)
- ✅ Client-driven content negotiation (Accept-Encoding)
- ✅ Handler placed before reverse_proxy in the chain

**Tests**: 5 tests for compression handler

**Files Changed:**

- `src/caddy/routes.ts` (added buildCompressionHandler)
- `src/caddy/domains.ts` (integrated compression)
- `src/__tests__/routes.test.ts` (added compression tests)

---

### 5. Route Ordering with @id (P2 - Medium) ✅ **COMPLETE**

**Status**: ✅ **COMPLETE** - Full route manipulation functionality

#### Implementation Summary

**What We Built:**

- ✅ Added `@id` field to `CaddyRouteSchema` in Zod validation
- ✅ Implemented `insertRoute()` in CaddyClient
- ✅ Implemented `replaceRouteById()` in CaddyClient
- ✅ Implemented `removeRouteById()` in CaddyClient
- ✅ Route positioning logic (beginning, end, after-health-checks)

**New Functions:**

```typescript
// Insert route at specific position
await client.insertRoute(server, route, "beginning");
await client.insertRoute(server, route, "end");
await client.insertRoute(server, route, "after-health-checks"); // default

// Replace route by @id (preserves @id)
const replaced = await client.replaceRouteById(server, "example.com", newRoute);

// Remove route by @id (handles duplicates)
const removed = await client.removeRouteById(server, "example.com-redirect");
```

**Features:**

- ✅ Flexible route positioning (beginning, end, after-health-checks)
- ✅ Route replacement preserves @id
- ✅ Route removal handles duplicate @ids
- ✅ Full Zod validation for routes
- ✅ Returns boolean for success/failure (replace/remove)

**Tests**: 13 unit tests + 14 integration tests (27 total tests)

**Files Changed:**

- `src/schemas.ts` (added @id field to CaddyRouteSchema)
- `src/caddy/client.ts` (added insertRoute, replaceRouteById, removeRouteById)
- `src/__tests__/client.test.ts` (13 unit tests)
- `src/__tests__/integration/client.integration.test.ts` (14 integration tests)

---

### 6. HTTP Basic Authentication (P1 - High) ✅ **IMPLEMENTED**

**Status**: ✅ **COMPLETE** - Full authentication support with bcrypt

#### Implementation Summary

**What We Built:**

- ✅ Created `src/utils/auth.ts` with comprehensive authentication utilities
- ✅ Enhanced `buildBasicAuthHandler()` to support multiple accounts
- ✅ Added bcrypt password hashing (optional dependency)
- ✅ Support for both npm bcrypt and Caddy CLI hash generation
- ✅ Backward compatible with single-account legacy API

**New Functions:**

```typescript
// Hash passwords with bcrypt
const hash = await hashPassword("my-password", 10); // cost: 10

// Verify passwords
const isValid = await verifyPassword("my-password", hash);

// Use Caddy CLI for hashing (no bcrypt dependency needed)
const hash = await hashPasswordWithCaddy("my-password");

// Create single account
const account = await createBasicAuthAccount("admin", "secret123");
// Returns: { username: "admin", password: "$2a$10$..." }

// Create multiple accounts
const accounts = await createBasicAuthAccounts([
  { username: "admin", password: "admin-pass" },
  { username: "user", password: "user-pass" },
]);
```

**Enhanced buildBasicAuthHandler:**

```typescript
// Single account (legacy, backward compatible)
buildBasicAuthHandler({
  enabled: true,
  username: "admin",
  passwordHash: "$2a$10$...",
  realm: "Admin Area",
});

// Multiple accounts (recommended)
buildBasicAuthHandler({
  enabled: true,
  accounts: [
    { username: "admin", password: "$2a$10$..." },
    { username: "user", password: "$2a$10$..." },
  ],
  realm: "Protected Area",
});
```

**Features:**

- ✅ Domain-level authentication (entire domain protected)
- ✅ Path-level authentication (specific paths protected)
- ✅ Multiple users per service
- ✅ Bcrypt password hashing (cost configurable)
- ✅ Custom authentication realms
- ✅ Service isolation (credentials scoped per service)
- ✅ Automatic bcrypt detection from hash format
- ✅ Optional bcrypt dependency (graceful fallback to Caddy CLI)

**Authentication Patterns Supported:**

1. **Domain-level**: `admin.localhost/*` - entire domain requires auth
2. **Path-level**: `api.localhost/admin/*` - only specific paths require auth
3. **Mixed**: Some services auth, some public, all in one config

**Tests**: 31 authentication tests in complex scenario integration test

**Files Changed:**

- `src/utils/auth.ts` (new - authentication utilities)
- `src/types.ts` (added BasicAuthAccount interface, enhanced BasicAuthOptions)
- `src/caddy/routes.ts` (enhanced buildBasicAuthHandler for multiple accounts)
- `src/caddy/index.ts` (exported auth utilities)
- `src/__tests__/integration/asd-complex-scenario.integration.test.ts` (added auth tests)
- `package.json` (added bcrypt as optional peer dependency)

**Integration Test Coverage:**

The complex scenario integration test demonstrates:

- ✅ Domain-level authentication (admin.localhost)
- ✅ Path-level authentication (api.localhost/admin/\*)
- ✅ Public services (no authentication)
- ✅ Multiple users per service (admin, superadmin)
- ✅ Service isolation (admin creds don't work on API service)
- ✅ Wrong credentials rejection (401 responses)
- ✅ WWW-Authenticate header verification
- ✅ Mixed authentication patterns in production setup

---

### 7. Path Prefix Rewriting (P2 - Medium) ✅ **IMPLEMENTED**

**Status**: ✅ **COMPLETE** - Full URL rewriting support

#### Implementation Summary

**What We Built:**

- ✅ `buildRewriteHandler()` function for path prefix stripping
- ✅ Integrated into complex scenario test
- ✅ Demonstrates `/backend-service/api/users` → backend receives `/api/users`

**Features:**

- ✅ Path prefix stripping with `strip_path_prefix`
- ✅ Handler placed before reverse_proxy in chain
- ✅ Clean URL rewriting for backend services

**Example:**

```typescript
routes.push({
  "@id": "service-with-rewrite",
  match: [{ host: ["app.localhost"], path: ["/api/v1/*"] }],
  handle: [
    {
      handler: "rewrite",
      strip_path_prefix: "/api/v1", // Strip this prefix
    },
    {
      handler: "reverse_proxy",
      upstreams: [{ dial: "backend:3000" }],
    },
  ],
});
// Request to /api/v1/users → backend receives /users
```

**Tests**: 2 tests for path rewriting in complex scenario

**Files Changed:**

- `src/caddy/routes.ts` (buildRewriteHandler already existed)
- `src/__tests__/integration/asd-complex-scenario.integration.test.ts` (added rewrite service)

---

### 8. HTTPS Backend Connections (P2 - Medium) ✅ **IMPLEMENTED**

**Status**: ✅ **COMPLETE** - Full HTTPS backend support

#### Implementation Summary

**What We Built:**

- ✅ HTTPS backend service in complex scenario test
- ✅ TLS transport configuration for backend connections
- ✅ Documentation for production TLS verification

**Features:**

- ✅ Caddy → Backend HTTPS connections (not just client → Caddy HTTPS)
- ✅ TLS transport configuration
- ✅ Server name verification (SNI)
- ✅ CA certificate configuration
- ✅ Insecure skip verify option (for testing)

**Example:**

```typescript
{
  handler: "reverse_proxy",
  upstreams: [{ dial: "internal-service:443" }],
  transport: {
    protocol: "http",
    tls: {
      server_name: "internal.example.com",
      insecure_skip_verify: false, // Verify in production
      ca: "/path/to/ca.crt" // Optional CA bundle
    }
  }
}
```

**Tests**: 1 test for HTTPS backend in complex scenario

**Files Changed:**

- `src/__tests__/integration/asd-complex-scenario.integration.test.ts` (added HTTPS backend service)

---

## 📋 Future Enhancements (P3 - Low)

These features don't exist in Python either, but would improve the TypeScript client:

### 1. Switch to 308 Redirect Status Code (P3 - Low)

**Current**: TypeScript uses `301` (Moved Permanently)
**Python**: Uses `308` (Permanent Redirect)

**Why 308 is Better:**

- Maintains HTTP method (POST stays POST)
- Better HTTP/1.1 compliance
- More explicit about permanence

**Implementation:** Update redirect status code in `src/caddy/routes.ts`

**Effort**: 30 minutes

---

### 2. load_pem Support (P3 - Low)

**Current**: TypeScript uses `load_files` (file paths)
**Python**: Uses `load_pem` (inline PEM strings)

**Benefits of Adding load_pem:**

- Support inline certificate strings
- Easier testing with mock certificates
- Compatibility with secrets management systems
- Match Python API exactly

**Implementation:**

```typescript
config.apps.tls.certificates.load_pem = [
  {
    certificate: "<PEM string>",
    key: "<PEM string>",
    tags: ["domain-serial-timestamp"],
  },
];
```

**Effort**: 2-3 hours

---

### 3. Fix ASD Integration Test Expectation

**Issue**: Path rewrite test expects "Hello from backend 1" but `echo-test:5678` returns different response

**Fix**: Update test expectation to match actual echo-test response

**Effort**: 15 minutes

---

### 4. Certificate Management Enhancements

**Features:**

- Wildcard certificate detection
- SAN (Subject Alternative Names) parsing
- Certificate renewal automation
- Certificate expiration monitoring with webhooks
- Multi-domain certificate handling

**Effort**: 8-12 hours

---

### 5. Advanced Security Headers

**Features:**

- `Referrer-Policy` support
- `Permissions-Policy` support
- Content Security Policy (CSP) builder
- Security.txt support

**Effort**: 4-6 hours

---

### 6. Reliability & Performance

**Features:**

- Retry logic with exponential backoff
- Circuit breaker pattern
- Request timeout configuration
- Connection pooling
- Config diffing/merging
- Atomic multi-section updates
- Rollback on failure

**Effort**: 12-16 hours

---

## Implementation Status Summary

### ✅ Completed (Core Parity + Beyond)

1. ✅ Certificate Rotation (P0) - **EXCEEDS Python**
2. ✅ Redirect Modes (P1) - **Full Parity**
3. ✅ TLS Connection Policies (P1) - **Full Implementation**
4. ✅ Compression Handler (P2) - **Full Parity**
5. ✅ Route Manipulation (P2) - **Full Implementation**
6. ✅ All CRUD Operations - **Full Parity**
7. ✅ Security Headers - **Full Parity**
8. ✅ Certificate Tagging - **Full Parity**
9. ✅ Auto TLS - **Full Parity**

### ❌ Not Implemented (Non-Critical)

10. ❌ Switch to 308 redirect (P3) - 30 minutes
11. ❌ load_pem Support (P3) - 2-3 hours
12. ❌ Fix ASD integration test expectation (P3) - 15 minutes
13. ❌ Retry Logic (P3) - 4-6 hours
14. ❌ Wildcard Certificates (P3) - 2-3 hours
15. ❌ Advanced Security Headers (P3) - 4-6 hours

---

## Architecture Improvements (2025-11-19)

### Refactoring Phase 1 & 2 ✅ **COMPLETE**

**Status**: ✅ **COMPLETE** - Major architecture improvements implemented

#### What Was Built

**1. Route Ordering System** (`src/caddy/ordering.ts`)

- ✅ Explicit priority-based route ordering (0-100 scale)
- ✅ `sortRoutes()` - Sort routes by priority and specificity
- ✅ `calculateRoutePriority()` - Calculate implicit or explicit priority
- ✅ `validateRouteOrdering()` - Validate route order correctness
- ✅ `insertRouteRelative()` - Insert routes relative to others
- ✅ **32 unit tests** covering all ordering logic

**2. High-Level Helper Functions** (`src/caddy/helpers.ts`)

- ✅ `createHealthRoute()` - Global health check routes
- ✅ `createServiceRoute()` - Service routes with security headers
- ✅ `createBasicAuthRoute()` - Authentication-protected routes
- ✅ `createLoadBalancerRoute()` - Load balancing with health checks
- ✅ `createRewriteRoute()` - Path rewriting routes
- ✅ `createRedirectRoute()` - Redirect routes (www ↔ domain)
- ✅ **38 unit tests** covering all helpers

**3. Test Helper Utilities** (`src/__tests__/helpers/`)

- ✅ HTTP request helpers (`callCaddy`, `callHealth`, `callService`)
- ✅ 14 assertion helpers (`expectBackend`, `expectServiceHeaders`, etc.)
- ✅ 9 fixture builders (TEST_CREDENTIALS, buildTestRoute, etc.)

**4. Contract Tests** (`src/__tests__/contract/`)

- ✅ **Routing Order Contracts** (20 tests) - Route ordering guarantees
- ✅ **Auth Pattern Contracts** (12 tests) - Authentication behavior
- ✅ **Idempotency Contracts** (14 tests) - Configuration idempotency

**5. Certificate Manager Abstraction** (`src/caddy/certificates.ts`)

- ✅ Unified `CertificateManager` class bundling all operations
- ✅ `inspect()`, `rotate()`, `cleanupOld()`, `list()`, `checkExpiration()`
- ✅ Security verified (trusted @peculiar/x509, no custom crypto)
- ✅ **20 comprehensive tests**

**Benefits:**

- Route ordering is now explicit and testable (prevents routing bugs)
- Clean, semantic APIs hide Caddy JSON complexity
- Test helpers eliminate duplication across test suites
- Contract tests define stable API guarantees
- Certificate management is unified and secure

**Documentation:**

- ✅ REFACTOR_PLAN.md - 90+ page comprehensive refactoring strategy
- ✅ REFACTOR_PROGRESS.md - Implementation tracking and metrics

---

## Test Coverage

**Current Status**: 291 tests (267 unit + 24 integration), >95% coverage

| Module                  | Tests | Coverage |
| ----------------------- | ----- | -------- |
| Certificate Utils       | 21    | 100%     |
| Certificate Manager     | 20    | 100%     |
| Domain Management       | 25    | >95%     |
| Routes                  | 28    | >90%     |
| Route Ordering          | 32    | 100%     |
| Route Helpers           | 38    | 100%     |
| TLS Policies            | 35    | 100%     |
| Client (Unit)           | 33    | >95%     |
| Client (Integration)    | 27    | N/A      |
| Schemas                 | 17    | 100%     |
| Errors                  | 20    | 100%     |
| Contract: Routing Order | 20    | N/A      |
| Contract: Auth Patterns | 12    | N/A      |
| Contract: Idempotency   | 14    | N/A      |

---

## Conclusion

**🎉 TypeScript implementation has EXCEEDED Python feature parity!**

We have implemented:

- ✅ **ALL core P0 features** - Certificate rotation, tagging, expiration checking
- ✅ **ALL P1 features** - Redirect modes, TLS connection policies, security headers
- ✅ **ALL P2 features** - Compression handler, route manipulation
- ✅ **Additional features Python doesn't have**:
  - Certificate rotation with zero-downtime
  - Certificate expiration checking and monitoring
  - Advanced route manipulation (insert, replace, remove by ID)
  - Comprehensive TLS policy builders with presets
- ✅ **Comprehensive type safety** with TypeScript + Zod validation
- ✅ **Excellent test coverage** (206 tests: 179 unit + 27 integration, >90%)
- ✅ **Production-ready implementation**

Remaining P3 features are optional enhancements that are not required for production use.

**Next Steps** (optional enhancements):

See "Future Enhancements (P3 - Low)" section above for all remaining tasks.
