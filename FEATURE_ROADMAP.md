# Feature Roadmap: Missing Python Features

This document outlines the implementation plan for features that exist in the Python `caddy-api-client` but are missing in the TypeScript implementation.

## Priority Classification

- **P0 (Critical)**: Core functionality gaps that affect production usage
- **P1 (High)**: Important features that improve reliability and functionality
- **P2 (Medium)**: Nice-to-have features that enhance usability
- **P3 (Low)**: Optional improvements

---

## 1. Certificate Rotation (P0 - Critical)

### Current State

- ❌ No certificate parsing capability
- ❌ No serial number extraction
- ❌ No certificate tagging system
- ❌ Cannot rotate certificates without downtime

### Python Implementation

```python
from cryptography import x509
from cryptography.hazmat.backends import default_backend
import base64

# Parse certificate
cert_der = base64.b64decode("".join(cert_lines))
cert = x509.load_der_x509_certificate(cert_der, default_backend())
serial_number = format(cert.serial_number, 'x')

# Create unique tag
timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
cert_tag = f"{domain}-{serial_number}-{timestamp}"
```

### Implementation Plan

#### Phase 1: Add Certificate Parsing Library

**Effort**: 2-3 hours

```bash
bun add @peculiar/x509
# OR
bun add node-forge
```

**Recommendation**: Use `@peculiar/x509` (modern, Web Crypto API based)

#### Phase 2: Implement Certificate Parser Utility

**File**: `src/utils/certificate.ts`

```typescript
import { Certificate } from "@peculiar/x509";

export interface CertificateInfo {
  serialNumber: string;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  publicKey: string;
}

/**
 * Parse PEM certificate and extract metadata
 */
export function parseCertificate(pemCert: string): CertificateInfo {
  const cert = new Certificate(pemCert);

  return {
    serialNumber: Buffer.from(cert.serialNumber).toString("hex"),
    subject: cert.subject,
    issuer: cert.issuer,
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
    publicKey: cert.publicKey.algorithm.name,
  };
}

/**
 * Generate unique certificate tag
 */
export function generateCertTag(domain: string, serialNumber: string): string {
  const timestamp = new Date().toISOString().replace(/[:-]/g, "").slice(0, 14);
  return `${domain}-${serialNumber}-${timestamp}`;
}

/**
 * Split certificate bundle into individual certificates
 */
export function splitCertificateBundle(bundle: string): string[] {
  const certBlocks: string[] = [];
  const lines = bundle.split("\n");
  let currentBlock: string[] = [];
  let inCert = false;

  for (const line of lines) {
    if (line.includes("-----BEGIN CERTIFICATE-----")) {
      inCert = true;
      currentBlock = [line];
    } else if (line.includes("-----END CERTIFICATE-----")) {
      inCert = false;
      currentBlock.push(line);
      certBlocks.push(currentBlock.join("\n"));
      currentBlock = [];
    } else if (inCert) {
      currentBlock.push(line);
    }
  }

  return certBlocks;
}
```

#### Phase 3: Update `addDomainWithTls` to Tag Certificates

**File**: `src/caddy/domains.ts`

```typescript
import { parseCertificate, generateCertTag, splitCertificateBundle } from "../utils/certificate.js";

export async function addDomainWithTls(options: AddDomainWithTlsOptions): Promise<DomainConfig> {
  // ... existing validation ...

  // Parse certificate to get serial number
  const certContent = readFileSync(validated.certFile, "utf-8");
  const certs = splitCertificateBundle(certContent);
  const firstCert = parseCertificate(certs[0]);
  const certTag = generateCertTag(validated.domain, firstCert.serialNumber);

  // ... existing config setup ...

  config.apps.tls.certificates.load_files.push({
    certificate: validated.certFile,
    key: validated.keyFile,
    tags: [certTag, validated.domain], // Add tags for tracking
  });

  // ... rest of implementation ...
}
```

#### Phase 4: Implement Certificate Rotation

**File**: `src/caddy/domains.ts`

```typescript
/**
 * Rotate certificate for a domain
 * @param options - Certificate rotation options
 */
export async function rotateCertificate(options: {
  domain: string;
  certFile: string;
  keyFile: string;
  adminUrl?: string;
}): Promise<{ oldSerialNumber: string; newSerialNumber: string }> {
  const client = new CaddyClient({ adminUrl: options.adminUrl });
  const config = await client.getConfig();

  // Parse new certificate
  const newCertContent = readFileSync(options.certFile, "utf-8");
  const newCerts = splitCertificateBundle(newCertContent);
  const newCertInfo = parseCertificate(newCerts[0]);
  const newCertTag = generateCertTag(options.domain, newCertInfo.serialNumber);

  // Find old certificate with matching domain tag
  const oldCerts = config.apps.tls.certificates.load_files.filter((cert) =>
    cert.tags?.includes(options.domain)
  );

  // Add new certificate
  config.apps.tls.certificates.load_files.push({
    certificate: options.certFile,
    key: options.keyFile,
    tags: [newCertTag, options.domain],
  });

  // Update TLS connection policies to use new certificate
  const policy = config.apps.tls.connection_policies?.find((p) =>
    p.match?.sni?.includes(options.domain)
  );
  if (policy) {
    policy.certificate_selection = { any_tag: [newCertTag] };
  }

  // Apply configuration (new cert is now active)
  await client.request("/config/", {
    method: "POST",
    body: JSON.stringify(config),
  });

  // Remove old certificates after grace period (optional)
  // Wait for active connections to close before cleanup

  return {
    oldSerialNumber: oldCerts[0]?.tags?.[0]?.split("-")[1] || "unknown",
    newSerialNumber: newCertInfo.serialNumber,
  };
}
```

#### Testing Requirements

- Unit tests for certificate parsing
- Integration test for certificate rotation
- Test certificate bundle splitting
- Test invalid certificate handling

---

## 2. Redirect Modes (P1 - High)

### Current State

- ❌ `redirectMode` field exists in schema but not implemented
- ❌ No redirect route generation
- ❌ No `@id` tracking for redirect routes

### Python Implementation

```python
if redirect_mode == "www_to_domain":
    redirect_route = {
        '@id': f'{domain}-redirect',
        'match': [{'host': [f'www.{domain}']}],
        'handle': [{
            'handler': 'static_response',
            'status_code': 301,
            'headers': {
                'Location': [f'https://{domain}{{http.request.uri}}']
            }
        }],
        'terminal': True
    }
```

### Implementation Plan

#### Phase 1: Add Redirect Route Builder

**File**: `src/caddy/routes.ts`

```typescript
/**
 * Build a redirect route
 * @param options - Redirect configuration
 * @returns Caddy route for redirect
 */
export function buildRedirectRoute(options: {
  fromHost: string;
  toHost: string;
  permanent?: boolean;
  id?: string;
}): CaddyRoute & { "@id"?: string } {
  const statusCode = options.permanent ? 301 : 302;

  return {
    "@id": options.id,
    match: [{ host: [options.fromHost] }],
    handle: [
      {
        handler: "static_response",
        status_code: statusCode,
        headers: {
          response: {
            set: {
              Location: [`https://${options.toHost}{http.request.uri}`],
            },
          },
        },
      },
    ],
    terminal: true,
  };
}
```

#### Phase 2: Integrate into Domain Management

**File**: `src/caddy/domains.ts`

```typescript
export async function addDomainWithAutoTls(
  options: AddDomainWithAutoTlsOptions
): Promise<DomainConfig> {
  // ... existing code ...

  const routes: CaddyRoute[] = [];

  // Add redirect route if specified
  if (validated.redirectMode === "www_to_domain") {
    routes.push(
      buildRedirectRoute({
        fromHost: `www.${validated.domain}`,
        toHost: validated.domain,
        permanent: true,
        id: `${validated.domain}-redirect`,
      })
    );
  } else if (validated.redirectMode === "domain_to_www") {
    routes.push(
      buildRedirectRoute({
        fromHost: validated.domain,
        toHost: `www.${validated.domain}`,
        permanent: true,
        id: `${validated.domain}-redirect`,
      })
    );
  }

  // Add main domain route
  routes.push({
    "@id": validated.domain,
    handle: [...handlers],
    // ... rest of route config ...
  });

  serverConfig[validated.domain].routes = routes;

  // ... rest of implementation ...
}
```

#### Phase 3: Update Type Definitions

**File**: `src/types.ts`

```typescript
export interface CaddyRoute {
  "@id"?: string; // Add ID for route tracking
  match?: CaddyRouteMatcher[];
  handle: CaddyRouteHandler[];
  terminal?: boolean;
  priority?: number;
}
```

#### Testing Requirements

- Test www → domain redirect
- Test domain → www redirect
- Test redirect with query parameters preserved
- Test permanent vs temporary redirects

---

## 3. TLS Connection Policies (P1 - High)

### Current State

- ❌ No cipher suite configuration
- ❌ No protocol version enforcement
- ❌ No HTTP/3 (ALPN) support
- ❌ No per-domain TLS policies

### Python Implementation

```python
tls_policy = {
    'match': {'sni': [domain]},
    'certificate_selection': {'any_tag': [cert_tag]},
    'protocol_min': '1.2',
    'protocol_max': '1.3',
    'cipher_suites': [
        'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384',
        'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
        // ... more suites ...
    ],
    'curves': ['x25519', 'secp256r1', 'secp384r1'],
    'alpn': ['h3', 'h2', 'h1']  # HTTP/3, HTTP/2, HTTP/1.1
}
```

### Implementation Plan

#### Phase 1: Define TLS Policy Types

**File**: `src/types.ts`

```typescript
export interface TlsConnectionPolicy {
  match?: {
    sni?: string[];
  };
  certificate_selection?: {
    any_tag?: string[];
    all_tags?: string[];
  };
  protocol_min?: "1.2" | "1.3";
  protocol_max?: "1.2" | "1.3";
  cipher_suites?: string[];
  curves?: string[];
  alpn?: string[];
  default_sni?: string;
}

export interface TlsPolicyOptions {
  domain: string;
  certificateTag?: string;
  minProtocol?: "1.2" | "1.3";
  maxProtocol?: "1.2" | "1.3";
  enableHttp3?: boolean;
  cipherSuites?: string[];
}
```

#### Phase 2: Implement TLS Policy Builder

**File**: `src/caddy/tls.ts` (new file)

```typescript
/**
 * Build TLS connection policy for a domain
 */
export function buildTlsConnectionPolicy(options: TlsPolicyOptions): TlsConnectionPolicy {
  const policy: TlsConnectionPolicy = {
    match: {
      sni: [options.domain],
    },
    protocol_min: options.minProtocol ?? "1.2",
    protocol_max: options.maxProtocol ?? "1.3",
    curves: ["x25519", "secp256r1", "secp384r1"],
  };

  // Add certificate selection if tag provided
  if (options.certificateTag) {
    policy.certificate_selection = {
      any_tag: [options.certificateTag],
    };
  }

  // Configure ALPN for HTTP/3 support
  if (options.enableHttp3) {
    policy.alpn = ["h3", "h2", "http/1.1"];
  } else {
    policy.alpn = ["h2", "http/1.1"];
  }

  // Configure cipher suites (modern, secure defaults)
  policy.cipher_suites = options.cipherSuites ?? [
    "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
  ];

  return policy;
}
```

#### Phase 3: Integrate into Domain Management

**File**: `src/caddy/domains.ts`

```typescript
export async function addDomainWithTls(options: AddDomainWithTlsOptions): Promise<DomainConfig> {
  // ... existing certificate setup ...

  // Add TLS connection policy
  const tlsPolicy = buildTlsConnectionPolicy({
    domain: validated.domain,
    certificateTag: certTag,
    enableHttp3: true,
    minProtocol: "1.2",
  });

  config.apps ??= {};
  config.apps.tls ??= {};
  config.apps.tls.connection_policies ??= [];
  config.apps.tls.connection_policies.push(tlsPolicy);

  // ... rest of implementation ...
}
```

#### Testing Requirements

- Test TLS 1.2 enforcement
- Test cipher suite configuration
- Test HTTP/3 ALPN negotiation
- Test certificate selection by tag

---

## 4. Compression Handler (P2 - Medium)

### Current State

- ❌ `enableCompression` field exists but does nothing
- ❌ No `encode` handler implementation

### Python Implementation

```python
if enable_compression:
    handlers.append({
        "handler": "encode",
        "encodings": {
            "gzip": {},
            "zstd": {}
        }
    })
```

### Implementation Plan

#### Phase 1: Add Compression Handler Builder

**File**: `src/caddy/routes.ts`

```typescript
/**
 * Build a compression (encode) handler
 * @param options - Compression options
 * @returns Encode handler
 */
export function buildCompressionHandler(options?: {
  gzip?: boolean;
  zstd?: boolean;
  brotli?: boolean;
}): CaddyRouteHandler {
  const encodings: Record<string, Record<string, unknown>> = {};

  if (options?.gzip !== false) {
    encodings.gzip = {};
  }

  if (options?.zstd !== false) {
    encodings.zstd = {};
  }

  if (options?.brotli) {
    encodings.br = {};
  }

  return {
    handler: "encode",
    encodings,
  };
}
```

#### Phase 2: Integrate into Route Builders

**File**: `src/caddy/routes.ts`

```typescript
export function buildHostRoute(options: HostRouteOptions): CaddyRoute {
  const handlers: CaddyRouteHandler[] = [];

  // Add compression if enabled
  if (options.enableCompression !== false) {
    handlers.push(buildCompressionHandler());
  }

  // Add security headers if configured
  if (validated.securityHeaders) {
    handlers.push(buildSecurityHeadersHandler(validated.securityHeaders));
  }

  // ... rest of handlers ...
}
```

#### Testing Requirements

- Test gzip compression
- Test zstd compression
- Test compression disable
- Verify Accept-Encoding header handling

---

## 5. Route Ordering with @id (P2 - Medium)

### Current State

- ❌ Routes appended to end with POST
- ❌ No `@id` field for route tracking
- ❌ No route positioning logic

### Python Implementation

```python
# Find position after security routes but before domain routes
insert_pos = 0
for i, r in enumerate(current_routes):
    if r.get('handle', [{}])[0].get('handler') == 'static_response':
        insert_pos = i + 1
    elif '@id' in r:
        break

# Insert domain routes at specific position
current_routes[insert_pos:insert_pos] = routes
```

### Implementation Plan

#### Phase 1: Add Route Positioning Logic

**File**: `src/caddy/client.ts`

```typescript
/**
 * Insert route at specific position
 * @param server - Server name
 * @param route - Route to insert
 * @param position - Insertion strategy
 */
async insertRoute(
  server: string,
  route: CaddyRoute & { "@id"?: string },
  position: "beginning" | "end" | "after-health-checks" = "after-health-checks"
): Promise<void> {
  const routes = await this.getRoutes(server);

  let insertIndex = 0;

  if (position === "after-health-checks") {
    // Find position after health check/static routes
    for (let i = 0; i < routes.length; i++) {
      const handler = routes[i].handle?.[0];
      if (handler?.handler === "static_response") {
        insertIndex = i + 1;
      } else if (routes[i]["@id"]) {
        break; // Stop at first domain route
      }
    }
  } else if (position === "end") {
    insertIndex = routes.length;
  }

  // Insert route
  routes.splice(insertIndex, 0, route);

  // Replace all routes
  await this.patchRoutes(server, routes);
}
```

#### Phase 2: Add Route Replacement by ID

**File**: `src/caddy/client.ts`

```typescript
/**
 * Replace route by @id
 */
async replaceRouteById(
  server: string,
  id: string,
  newRoute: CaddyRoute
): Promise<boolean> {
  const routes = await this.getRoutes(server);
  const index = routes.findIndex((r) => r["@id"] === id);

  if (index === -1) {
    return false; // Route not found
  }

  routes[index] = { ...newRoute, "@id": id };
  await this.patchRoutes(server, routes);
  return true;
}

/**
 * Remove route by @id
 */
async removeRouteById(server: string, id: string): Promise<boolean> {
  const routes = await this.getRoutes(server);
  const filtered = routes.filter((r) => r["@id"] !== id);

  if (filtered.length === routes.length) {
    return false; // Route not found
  }

  await this.patchRoutes(server, filtered);
  return true;
}
```

#### Testing Requirements

- Test route insertion at beginning
- Test route insertion after health checks
- Test route replacement by ID
- Test route removal by ID

---

## Implementation Priority

### Sprint 1 (Week 1)

1. **Certificate Rotation** (P0) - 3 days
   - Add certificate parsing library
   - Implement certificate utilities
   - Add rotation logic
   - Write tests

2. **Redirect Modes** (P1) - 2 days
   - Add redirect route builder
   - Integrate into domain management
   - Update type definitions
   - Write tests

### Sprint 2 (Week 2)

3. **TLS Connection Policies** (P1) - 2 days
   - Define TLS policy types
   - Implement policy builder
   - Integrate into domain management
   - Write tests

4. **Compression Handler** (P2) - 1 day
   - Add compression handler builder
   - Integrate into route builders
   - Write tests

5. **Route Ordering** (P2) - 1 day
   - Add route positioning logic
   - Add route replacement by ID
   - Write tests

---

## Dependencies

### NPM Packages

- `@peculiar/x509` - Certificate parsing (6KB gzipped)
- OR `node-forge` - More comprehensive but larger (244KB gzipped)

### Breaking Changes

- None - all features are additive

### Documentation Updates

- Update README with new features
- Add examples for certificate rotation
- Document redirect modes
- Document TLS policies

---

## Success Metrics

- **Test Coverage**: Maintain >90% coverage for new features
- **API Compatibility**: Match Python client feature parity
- **Performance**: Certificate rotation < 500ms
- **Bundle Size**: Keep under 50KB gzipped
- **Zero Downtime**: Certificate rotation without service interruption

---

## Future Enhancements (P3 - Low)

1. **Retry Logic with Exponential Backoff**
   - Handle transient Caddy failures
   - Configurable retry attempts
   - Circuit breaker pattern

2. **Config Diffing/Merging**
   - Compare configs before applying
   - Atomic multi-section updates
   - Rollback on failure

3. **Wildcard Certificate Support**
   - Auto-detect wildcard certs
   - Multi-domain certificate handling
   - SAN (Subject Alternative Names) parsing

4. **Certificate Renewal Automation**
   - Monitor certificate expiration
   - Auto-trigger rotation
   - Webhook notifications

5. **Advanced Security Headers**
   - `Referrer-Policy` support
   - `Permissions-Policy` support
   - Content Security Policy (CSP) builder

---

## Notes

- All features should maintain backward compatibility
- Type definitions must be updated for new features
- Comprehensive tests required for each feature
- Documentation examples for common use cases
- Consider edge cases from Python implementation
