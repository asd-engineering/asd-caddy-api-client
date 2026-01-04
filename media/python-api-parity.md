# Python API Parity

Comparison with [caddy-api-client](https://github.com/migetapp/caddy-api-client) (Python) v0.2.4

## Status: ✅ FEATURE PARITY ACHIEVED

The TypeScript implementation has achieved full feature parity with the Python client and includes several enhancements.

## Core API Methods

| Method                       | Python | TypeScript                  | Notes                             |
| ---------------------------- | ------ | --------------------------- | --------------------------------- |
| `add_domain_with_auto_tls()` | ✅     | ✅ `addDomainWithAutoTls()` | Both support redirect modes       |
| `add_domain_with_tls()`      | ✅     | ✅ `addDomainWithTls()`     | Both support custom certificates  |
| `get_domain_config()`        | ✅     | ✅ `getDomainConfig()`      | Both return domain configuration  |
| `update_domain()`            | ✅     | ✅ `updateDomain()`         | Both support all update scenarios |
| `delete_domain()`            | ✅     | ✅ `deleteDomain()`         | Full cleanup of routes and TLS    |

## Feature Comparison

### Certificate Management

- ✅ **Parity**: Certificate parsing, tagging, bundle splitting
- ✅ **TS Enhancement**: Zero-downtime rotation (`rotateCertificate()`)
- ✅ **TS Enhancement**: Old certificate cleanup (`removeOldCertificates()`)
- ✅ **TS Enhancement**: Expiration checking (`isExpired()`, `getDaysUntilExpiration()`)

### Domain Redirects

- ✅ **Parity**: Both www↔domain redirect modes
- ✅ **Parity**: Query/path preservation
- ✅ **TS Enhancement**: Configurable status codes (301, 302, 307, 308)
- ✅ **TS Default**: Uses 308 (same as Python)

### Security Headers

- ✅ **Parity**: X-Frame-Options, X-Content-Type-Options, HSTS
- ✅ **Parity**: Custom response headers

### TLS Configuration

- ✅ **Parity**: Auto TLS (Let's Encrypt/ZeroSSL)
- ✅ **Parity**: Certificate selection by tag
- ⚠️ **Python**: Uses `load_pem` (inline PEM)
- ⚠️ **TypeScript**: Uses `load_files` (file paths)

### Type Safety & Validation

- ✅ **TS Advantage**: Full TypeScript types
- ✅ **TS Advantage**: Zod runtime validation
- ✅ **TS Advantage**: Compile-time checking

### Error Handling

- ✅ **Parity**: Custom error classes
- ✅ **Parity**: `DomainNotFoundError`, `DomainAlreadyExistsError`, `CaddyApiError`

### Testing

- ✅ **TS Advantage**: 291 unit tests
- ✅ **TS Advantage**: 24 integration tests
- ✅ **TS Advantage**: >95% coverage

## TypeScript Enhancements

Beyond Python parity, TypeScript adds:

1. **High-Level Route Builders** (`src/caddy/helpers.ts`)
   - `createServiceRoute()` - Service routing with load balancing
   - `createHealthRoute()` - Health check endpoints
   - `createBasicAuthRoute()` - Authentication middleware
   - `createRewriteRoute()` - Path rewriting
   - `createLoadBalancerRoute()` - Advanced load balancing
   - `createRedirectRoute()` - HTTP redirects

2. **Explicit Route Ordering** (`src/caddy/ordering.ts`)
   - Priority-based system (0-100)
   - Automatic sorting with `sortRoutes()`
   - Route validation with `validateRouteOrdering()`

3. **Certificate Manager** (`src/caddy/certificates.ts`)
   - Unified `CertificateManager` class
   - Certificate inspection and validation
   - Tag generation and rotation workflows

4. **Modern Build System**
   - ESM + CJS dual builds
   - Tree-shakeable exports
   - TypeScript declaration files

## Implementation Differences

### Certificate Storage

**Python (load_pem):**

```python
config['apps']['tls']['certificates']['load_pem'] = [{
    "certificate": "<PEM string>",
    "key": "<PEM string>",
    "tags": ["domain-serial-timestamp"]
}]
```

**TypeScript (load_files):**

```typescript
config.apps.tls.certificates.load_files = [
  {
    certificate: "/path/to/cert.crt",
    key: "/path/to/key.key",
    tags: ["domain-serial-timestamp"],
  },
];
```

Both approaches are valid - Python embeds PEM inline, TypeScript uses file paths.

### Redirect Status Codes

**Python**: Always uses 308 (Permanent Redirect - maintains HTTP method)

**TypeScript**: Configurable with 308 as default

```typescript
// Default: 308 (same as Python)
addDomainWithAutoTls({ redirectMode: "www_to_domain", ... });

// Custom status code for backward compatibility or specific needs
addDomainWithAutoTls({
  redirectMode: "www_to_domain",
  redirectStatusCode: 301, // or 302, 307, 308
  ...
});
```

TypeScript provides flexibility while maintaining the same default as Python.

## References

- **Python Package**: [caddy-api-client on PyPI](https://pypi.org/project/caddy-api-client/)
- **Python Repository**: [migetapp/caddy-api-client](https://github.com/migetapp/caddy-api-client)
- **TypeScript Package**: `@accelerated-software-development/caddy-api-client` (this package)
