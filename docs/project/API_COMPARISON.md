# API Comparison: TypeScript vs Python caddy-api-client

## Executive Summary

**Verdict**: Our TypeScript API is **MORE powerful** but potentially **LESS user-friendly** for simple use cases.

### Key Differences

| Feature                 | Python (`caddy-api-client`) | TypeScript (`@asd/caddy-api-client`) | Winner        |
| ----------------------- | --------------------------- | ------------------------------------ | ------------- |
| **Simple domain setup** | ✅ One-liner                | ❌ Multiple steps                    | 🐍 Python     |
| **Type safety**         | ❌ No types                 | ✅ Full TypeScript + Zod             | 🟦 TypeScript |
| **Flexibility**         | ❌ High-level only          | ✅ High + Low level                  | 🟦 TypeScript |
| **Route builders**      | ❌ None                     | ✅ Composable builders               | 🟦 TypeScript |
| **Error handling**      | ⚠️ Basic                    | ✅ Rich error classes                | 🟦 TypeScript |
| **Documentation**       | ⚠️ Limited                  | ✅ Extensive                         | 🟦 TypeScript |

---

## Python API (migetapp/caddy-api-client)

### Strengths ✅

```python
# ONE LINE to add a production-ready domain with TLS!
client.add_domain_with_auto_tls(
    domain="example.org",
    target="nginx",
    target_port=80,
    redirect_mode="domain_to_www",
    enable_security_headers=True,
    enable_hsts=True
)
```

**Why this is great**:

- **Zero Caddy knowledge required** - User doesn't need to know about routes, handlers, matchers
- **Opinionated defaults** - Security headers, HSTS, redirects built-in
- **Single function call** - No loops, no manual route building
- **Named parameters** - Clear intent: `enable_hsts=True` vs figuring out Caddy handler syntax

### Weaknesses ❌

1. **No type safety** - Typos silently fail at runtime
2. **Limited flexibility** - Can only do what the library supports
3. **Black box** - Hard to debug what Caddy config it generates
4. **No composability** - Can't mix custom routes with helper functions
5. **Missing features** - No load balancing, path-based routing, custom headers

---

## TypeScript API (@asd/caddy-api-client)

### Strengths ✅

```typescript
// Type-safe, composable, flexible
const routes = buildServiceRoutes({
  host: "api.localhost",
  dial: "127.0.0.1:3000",
  securityHeaders: {
    enableHsts: true,
    frameOptions: "DENY",
  },
});

for (const route of routes) {
  await client.addRoute("https_server", route);
}
```

**Why this is great**:

- **Full type safety** - IDE autocomplete, compile-time error checking
- **Transparent** - User sees exactly what routes are created
- **Composable** - Mix high-level builders with low-level route manipulation
- **Extensible** - Support for load balancers, path routing, custom handlers
- **Powerful** - Can do ANYTHING Caddy supports

### Weaknesses ❌

1. **Verbose for simple cases** - Need loop to add routes
2. **Requires Caddy knowledge** - User must know about servers, routes, handlers
3. **More code** - 5-10 lines vs 1 line for simple domain setup
4. **No "magic"** - User must explicitly configure everything

---

## What Python Does Better

### 1. Domain Management is a Single Function Call

**Python:**

```python
client.add_domain_with_auto_tls(
    domain="example.org",
    target="nginx",
    target_port=80,
    redirect_mode="domain_to_www",  # Magic!
    enable_security_headers=True,    # Magic!
    enable_hsts=True                 # Magic!
)
```

**TypeScript (Current):**

```typescript
const routes = buildServiceRoutes({
  host: "example.org",
  dial: "nginx:80",
  securityHeaders: {
    enableHsts: true,
    frameOptions: "DENY",
  },
});

// Manual loop required
for (const route of routes) {
  await client.addRoute("https_server", route);
}

// Redirect not supported yet - user must manually build redirect route
```

### 2. WWW Redirects Built-in

**Python:**

```python
redirect_mode="domain_to_www"    # example.org → www.example.org
redirect_mode="www_to_domain"    # www.example.org → example.org
```

**TypeScript:**

```typescript
// We don't have this! User must:
// 1. Know how Caddy redirect handler works
// 2. Build redirect route manually
// 3. Set proper ordering
```

### 3. Update Domain Configuration

**Python:**

```python
client.update_domain(
    domain="example.org",
    target="new-backend",
    target_port=8080,
    redirect_mode="www_to_domain"
)
```

**TypeScript:**

```typescript
// We don't have this! User must:
// 1. Get existing routes
// 2. Filter by domain
// 3. Remove old routes
// 4. Build new routes
// 5. Add new routes
```

---

## Proposed Improvements

### High Priority 🔥

#### 1. Add Simple Domain Management Functions

```typescript
import { addDomain, updateDomain, deleteDomain } from "@asd/caddy-api-client/domains";

// Should be THIS simple for 80% of users
await addDomain({
  domain: "example.org",
  target: "nginx:80",
  autoTls: true, // Let's Encrypt
  redirect: "domain-to-www", // example.org → www.example.org
  security: {
    hsts: true,
    frameOptions: "DENY",
  },
});

// Update domain
await updateDomain({
  domain: "example.org",
  target: "new-backend:8080",
  redirect: "www-to-domain", // Change redirect direction
});

// Delete domain
await deleteDomain({ domain: "example.org" });
```

**Implementation Status:**

- ✅ We have `addDomainWithAutoTls()` with www redirect support!
- ✅ We have www redirect support (`buildWwwRedirect()`)!
- ✅ We have `updateDomain()`!
- ✅ We have `deleteDomain()`!
- ✅ We have `addRoutes()` (plural - no loop needed)!
- ✅ We have `listDomains()`!

**COMPLETED! All high-priority features implemented.**

#### 2. Add WWW Redirect Support

```typescript
import { buildWwwRedirect } from "@asd/caddy-api-client/caddy";

// Redirect www.example.org → example.org
const redirect = buildWwwRedirect({
  domain: "example.org",
  mode: "www-to-domain", // or "domain-to-www"
  permanent: true, // 301 vs 302
});

await client.addRoute("https_server", redirect);
```

#### 3. Simplify Route Addition (No Loop Required)

```typescript
// Current (verbose):
for (const route of routes) {
  await client.addRoute("https_server", route);
}

// Proposed:
await client.addRoutes("https_server", routes); // Plural - handles array
```

### Medium Priority ⚠️

#### 4. Add Fluent/Builder API (Optional)

```typescript
// For users who want more control but still simple
await client
  .domain("example.org")
  .target("nginx:80")
  .autoTls()
  .redirect("domain-to-www")
  .security({ hsts: true })
  .deploy();
```

#### 5. Add Domain Query Methods

```typescript
// Python has get_domain_config()
const config = await client.getDomainConfig("example.org");

// List all domains
const domains = await client.listDomains(); // ["example.org", "api.localhost", ...]
```

### Low Priority 📋

#### 6. Configuration Presets

```typescript
import { DomainPresets } from "@asd/caddy-api-client/presets";

// One-liner for common patterns
await client.addDomain(
  DomainPresets.ProductionWebsite({
    domain: "example.org",
    target: "nginx:80",
  })
);
// Includes: Auto TLS, HSTS, security headers, compression, www redirect

await client.addDomain(
  DomainPresets.API({
    domain: "api.example.org",
    target: "api-server:3000",
  })
);
// Includes: Auto TLS, CORS, rate limiting, JSON headers
```

---

## User Experience Comparison

### Scenario: Add a production website with TLS

**Python (4 lines):**

```python
from caddy_api_client import CaddyAPIClient

client = CaddyAPIClient("http://localhost:2019")
client.add_domain_with_auto_tls(
    domain="example.org", target="nginx", target_port=80,
    redirect_mode="domain_to_www", enable_security_headers=True
)
```

**TypeScript Current (12 lines):**

```typescript
import { CaddyClient, buildServiceRoutes } from "@asd/caddy-api-client/caddy";

const client = new CaddyClient();
const routes = buildServiceRoutes({
  host: "example.org",
  dial: "nginx:80",
  securityHeaders: { enableHsts: true, frameOptions: "DENY" },
});

for (const route of routes) {
  await client.addRoute("https_server", route);
}
// Still missing: www redirect, auto TLS setup
```

**TypeScript Proposed (6 lines):**

```typescript
import { CaddyClient } from "@asd/caddy-api-client/caddy";
import { addDomain } from "@asd/caddy-api-client/domains";

const client = new CaddyClient();
await addDomain({
  domain: "example.org",
  target: "nginx:80",
  autoTls: true,
  redirect: "domain-to-www",
  security: { hsts: true },
});
```

---

## Recommendations

### ✅ Keep Current API

Don't remove anything - our current API is powerful and flexible. It's perfect for:

- Advanced users
- Complex routing scenarios
- .asd production use cases

### ✅ Add High-Level Convenience API

Create a new simplified API layer on top:

```typescript
// Simple API (new) - for 80% of users
import { addDomain } from "@asd/caddy-api-client/domains";
await addDomain({ domain: "example.org", target: "nginx:80", autoTls: true });

// Advanced API (existing) - for power users
import { CaddyClient, buildServiceRoutes } from "@asd/caddy-api-client/caddy";
const routes = buildServiceRoutes({ host: "example.org", dial: "nginx:80" });
await client.addRoutes("https_server", routes);
```

### ✅ Improve Existing Domain Functions

Current `addDomainWithAutoTls()` needs:

1. Support for www redirects
2. Better defaults (HSTS enabled by default)
3. Less verbose configuration

### ✅ Add Missing Features

1. **WWW redirect builder** - Critical for production sites
2. **`updateDomain()`** - Update existing domain configuration
3. **`addRoutes()` (plural)** - Add array of routes without loop
4. **`getDomainConfig()`** - Query existing domain setup
5. **`listDomains()`** - List all configured domains

---

## Conclusion

**Python wins on simplicity**. Their API is perfect for:

- Quick prototyping
- Simple reverse proxy setups
- Users who don't want to learn Caddy internals

**TypeScript wins on power**. Our API is perfect for:

- Production .asd deployments
- Complex routing scenarios
- Type safety and IDE support

**Solution**: Add a simplified high-level API layer while keeping the existing powerful API intact. This gives users choice:

- Simple cases: Use `addDomain()` helper (like Python)
- Complex cases: Use `buildServiceRoutes()` + `client.addRoute()` (like now)

**Priority Order**:

1. 🔥 Add www redirect support (`buildWwwRedirect()`)
2. 🔥 Improve `addDomain()` / `addDomainWithAutoTls()` to match Python simplicity
3. 🔥 Add `updateDomain()` helper
4. ⚠️ Add `addRoutes()` plural method (no loop required)
5. ⚠️ Add `listDomains()` and better domain queries
6. 📋 Add configuration presets (later)
