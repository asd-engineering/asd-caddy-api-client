# Testing Strategy

## Problem: Mock Drift

Our unit tests use mocked HTTP responses. While this provides fast, reliable tests, we face the **mock drift problem**: our mocks might not match what Caddy actually returns, leading to false confidence.

## Multi-Layer Testing Approach

### 1. Unit Tests (Current - 94 tests, 76.49% coverage)

**Purpose:** Fast feedback, regression detection, business logic validation

**Approach:** Mock `fetch` API to test client behavior

**Strengths:**

- ✅ Fast (runs in ~150ms)
- ✅ No external dependencies
- ✅ Isolated - tests one component at a time
- ✅ Runs in CI/CD without infrastructure

**Weaknesses:**

- ❌ Mock responses may not match real Caddy API
- ❌ Doesn't catch API contract changes
- ❌ Doesn't validate actual HTTP requests

**Location:** `src/__tests__/**/*.test.ts`

### 2. Integration Tests (Recommended Addition)

**Purpose:** Validate against real Caddy instance

**Approach:** Run tests against actual Caddy Admin API

**Implementation Plan:**

```typescript
// src/__tests__/integration/domains.integration.test.ts
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { addDomainWithAutoTls, getDomainConfig, deleteDomain } from "../../caddy/domains.js";

describe("Domain Management Integration Tests", () => {
  const CADDY_URL = process.env.CADDY_ADMIN_URL || "http://127.0.0.1:2019";

  beforeAll(async () => {
    // Verify Caddy is running
    const response = await fetch(CADDY_URL);
    if (!response.ok) {
      throw new Error("Caddy not running - start with: docker compose up -d");
    }
  });

  afterAll(async () => {
    // Cleanup test domains
    await deleteDomain({ domain: "test.example.com", adminUrl: CADDY_URL });
  });

  test("full domain lifecycle with real Caddy", async () => {
    // Add domain
    const config = await addDomainWithAutoTls({
      domain: "test.example.com",
      target: "127.0.0.1",
      targetPort: 8080,
      adminUrl: CADDY_URL,
    });

    expect(config.domain).toBe("test.example.com");

    // Verify domain exists
    const retrieved = await getDomainConfig("test.example.com", CADDY_URL);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.target).toBe("127.0.0.1");
    expect(retrieved?.targetPort).toBe(8080);

    // Delete domain
    await deleteDomain({ domain: "test.example.com", adminUrl: CADDY_URL });

    // Verify deleted
    const deleted = await getDomainConfig("test.example.com", CADDY_URL);
    expect(deleted).toBeNull();
  });

  test("validates actual Caddy API response structure", async () => {
    // This test will FAIL if Caddy changes its API response format
    const config = await addDomainWithAutoTls({
      domain: "api-test.example.com",
      target: "127.0.0.1",
      targetPort: 3000,
      adminUrl: CADDY_URL,
    });

    // Directly query Caddy to verify structure
    const response = await fetch(`${CADDY_URL}/config/apps/http/servers`);
    const servers = await response.json();

    // Validate actual response structure matches our expectations
    expect(servers).toHaveProperty("api-test.example.com");
    expect(servers["api-test.example.com"]).toHaveProperty("routes");
    expect(servers["api-test.example.com"].routes[0]).toHaveProperty("handle");

    // Cleanup
    await deleteDomain({ domain: "api-test.example.com", adminUrl: CADDY_URL });
  });
});
```

**Docker Compose Setup:**

```yaml
# docker-compose.test.yml
services:
  caddy:
    image: caddy:2.9-alpine
    ports:
      - "2019:2019" # Admin API
      - "8443:443" # HTTPS (non-standard port to avoid conflicts)
    environment:
      - CADDY_ADMIN=0.0.0.0:2019
    volumes:
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
```

**Run Integration Tests:**

```bash
# Start Caddy
docker compose -f docker-compose.test.yml up -d

# Run integration tests
CADDY_ADMIN_URL=http://127.0.0.1:2019 bun test:integration

# Stop Caddy
docker compose -f docker-compose.test.yml down
```

### 3. Contract Testing (Advanced)

**Purpose:** Validate our mocks match real Caddy responses

**Approach:** Record real Caddy responses and compare with mocks

**Implementation:**

```typescript
// scripts/update-mocks.ts
/**
 * Utility to capture real Caddy API responses and update test mocks
 * Run this when Caddy API changes or periodically to prevent drift
 */
import { writeFileSync } from "fs";

async function captureRealResponses() {
  const CADDY_URL = "http://127.0.0.1:2019";

  // Capture getServers response
  const serversResponse = await fetch(`${CADDY_URL}/config/apps/http/servers`);
  const servers = await serversResponse.json();

  // Capture getConfig response
  const configResponse = await fetch(`${CADDY_URL}/config/`);
  const config = await configResponse.json();

  // Save as fixtures
  writeFileSync(
    "src/__tests__/fixtures/caddy-servers-response.json",
    JSON.stringify(servers, null, 2)
  );

  writeFileSync(
    "src/__tests__/fixtures/caddy-config-response.json",
    JSON.stringify(config, null, 2)
  );

  console.log("✅ Captured real Caddy responses");
  console.log("⚠️  Review fixtures and update mocks in tests to match");
}

captureRealResponses().catch(console.error);
```

**Usage:**

```typescript
// src/__tests__/domains.test.ts
import serversFixture from "./fixtures/caddy-servers-response.json";

test("mock matches real Caddy response structure", () => {
  // Use real captured response as mock
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => serversFixture,
  } as Response);

  // Test with realistic data
  const result = await getDomainConfig("example.com");
  // ...
});
```

### 4. Smoke Tests (Production-Like)

**Purpose:** Quick validation that basic operations work

**Approach:** Minimal test suite that can run in any environment

```typescript
// src/__tests__/smoke/basic.smoke.test.ts
describe("Smoke Tests", () => {
  test("can connect to Caddy Admin API", async () => {
    const client = new CaddyClient();
    const version = await client.getVersion();
    expect(version).toBeDefined();
  });

  test("can read configuration without errors", async () => {
    const client = new CaddyClient();
    const config = await client.getConfig();
    expect(config).toBeDefined();
  });
});
```

## Recommended Testing Matrix

| Test Type             | When to Run                    | Duration | Requires Caddy | Coverage                     |
| --------------------- | ------------------------------ | -------- | -------------- | ---------------------------- |
| **Unit Tests**        | Every commit (pre-commit hook) | ~150ms   | No             | Logic, error handling        |
| **Integration Tests** | Before merge, nightly          | ~5s      | Yes (Docker)   | API contracts, real behavior |
| **Contract Tests**    | When Caddy version updates     | ~1s      | Yes (Docker)   | Mock accuracy                |
| **Smoke Tests**       | Production deployment          | ~500ms   | Yes (Real)     | Basic connectivity           |

## Implementation Roadmap

### Phase 1: Enhance Unit Tests (Current)

- [x] Add comprehensive unit tests with mocks
- [x] Achieve 76.49% coverage
- [x] Pre-commit hooks for quality

### Phase 2: Add Integration Tests (Recommended)

- [ ] Create `docker-compose.test.yml`
- [ ] Add integration test suite in `src/__tests__/integration/`
- [ ] Add `just test:integration` command
- [ ] Document how to run integration tests

### Phase 3: Contract Testing (Optional)

- [ ] Create mock capture script
- [ ] Save Caddy responses as fixtures
- [ ] Compare mocks against fixtures in CI
- [ ] Alert on mock drift

### Phase 4: CI/CD Integration (Future)

- [ ] GitHub Actions workflow with Caddy container
- [ ] Run unit tests on every PR
- [ ] Run integration tests on merge to main
- [ ] Publish coverage reports

## Addressing the Mock Drift Problem

**Short-term solution (now):**

1. Use examples (`examples/*.ts`) as manual smoke tests
2. Periodically run examples against real Caddy to validate behavior
3. Update mocks when bugs are found

**Medium-term solution (recommended):**

1. Add integration tests that run against real Caddy
2. Run integration tests in CI with docker-compose
3. Keep unit tests for speed, integration tests for correctness

**Long-term solution (ideal):**

1. Contract testing with captured Caddy responses
2. Automated mock validation in CI
3. Version-specific test suites for different Caddy versions

## Best Practices

### When to Use Each Test Type

**Unit Tests (Mocked):**

- ✅ Business logic (route building, config parsing)
- ✅ Error handling paths
- ✅ Edge cases (empty responses, malformed data)
- ✅ Fast regression detection

**Integration Tests (Real Caddy):**

- ✅ API contract validation
- ✅ Full request/response lifecycle
- ✅ Configuration application and retrieval
- ✅ Certificate management
- ✅ Domain lifecycle (add → update → delete)

**Examples (Manual):**

- ✅ Documentation and learning
- ✅ Quick smoke testing during development
- ✅ Demonstrating features

## Conclusion

Our current unit test suite provides excellent coverage and fast feedback, but **you're right** - we need integration tests to catch mock drift. The recommended approach is:

1. **Keep unit tests** for fast development feedback (current 94 tests)
2. **Add integration tests** for API contract validation (to be implemented)
3. **Use examples** for smoke testing and documentation (current 3 examples)

This multi-layer strategy provides both speed and confidence in our implementation.
