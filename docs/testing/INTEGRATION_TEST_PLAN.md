# Integration Test Plan: caddy-security Authentication

## Overview

This document outlines the integration testing strategy for caddy-security authentication types using Playwright for browser-based flows and Docker containers for identity providers.

## Auth Types vs Identity Providers

caddy-security supports these **authentication types**:

| Auth Type  | Protocol       | Identity Store/Provider            |
| ---------- | -------------- | ---------------------------------- |
| **Local**  | Form-based     | JSON file (`local` driver)         |
| **LDAP**   | LDAP bind      | Directory server (`ldap` driver)   |
| **OAuth2** | OAuth 2.0      | Social providers (`oauth2` driver) |
| **OIDC**   | OpenID Connect | Any OIDC provider (`oidc` driver)  |
| **SAML**   | SAML 2.0       | SAML IdP (`saml` driver)           |

Our tests cover each auth **type**, not each **product**. Some phases use the same product (Keycloak) for different protocols.

## Test Coverage Matrix

| Phase | Auth Type             | Service    | Unique Coverage                        |
| ----- | --------------------- | ---------- | -------------------------------------- |
| 1     | Config validation     | None       | Schema/type correctness                |
| 2     | **OIDC** (basic)      | Mock OAuth | Protocol compliance, minimal setup     |
| 3     | **OIDC** (enterprise) | Keycloak   | RBAC: roles, groups, claims mapping    |
| 4     | **LDAP**              | OpenLDAP   | Directory auth, bind operations        |
| 5     | **SAML**              | Keycloak   | Federation protocol, attribute mapping |
| 6     | **MFA/Flows**         | Authentik  | TOTP, WebAuthn, auth flows, outposts   |

### Why Multiple OIDC Tests?

- **Mock OAuth (Phase 2)**: Fast, deterministic, validates OIDC protocol basics
- **Keycloak (Phase 3)**: Enterprise features - role mapping, group membership, custom claims
- **Authentik (Phase 6)**: Advanced IdP features - MFA enrollment, configurable flows

## Quick Start

```bash
# Run all auth type tests (skips unavailable services)
npm run test:auth-types

# Run specific auth type
npm run test:oauth      # OIDC basic
npm run test:keycloak   # OIDC enterprise
npm run test:ldap       # LDAP
npm run test:saml       # SAML
npm run test:authentik  # MFA/Flows
```

## Phase Details

### Phase 1: Config Validation (No Docker)

Tests validate caddy-security configuration generation without external services.

**Location**: `src/__tests__/caddy-security-config.test.ts`

| Test                 | Description                    |
| -------------------- | ------------------------------ |
| Local identity store | JSON user database config      |
| JWT validation       | Token validator config         |
| ACL rules            | Access control list generation |
| Portal config        | Authentication portal settings |
| OAuth provider       | OAuth2/OIDC provider config    |

### Phase 2: OIDC Basic (Mock OAuth)

Fast OAuth/OIDC testing with deterministic mock server.

**Purpose**: Validate OIDC protocol compliance without enterprise complexity.

```bash
npm run docker:oauth:up
npm run test:oauth
npm run docker:oauth:down
```

| Test               | Coverage                           |
| ------------------ | ---------------------------------- |
| Discovery endpoint | `.well-known/openid-configuration` |
| Authorization flow | Redirect to IdP, code exchange     |
| Token exchange     | Code → access/id tokens            |
| JWT claims         | Token structure validation         |
| JWKS endpoint      | Key rotation support               |

### Phase 3: OIDC Enterprise (Keycloak)

Production-like OIDC with enterprise RBAC features.

**Purpose**: Validate role-based access, group claims, token customization.

```bash
npm run docker:keycloak:up
npm run test:keycloak
npm run docker:keycloak:down
```

| Test                | Coverage                     |
| ------------------- | ---------------------------- |
| Direct access grant | Username/password → tokens   |
| Token refresh       | Refresh token flow           |
| Userinfo endpoint   | Standard claims              |
| Role mapping        | Realm/client roles in tokens |
| Group membership    | Group claims                 |
| Browser login       | Interactive OIDC flow        |

### Phase 4: LDAP

Directory-based authentication using OpenLDAP.

**Purpose**: Validate LDAP bind, user search, group membership.

```bash
npm run docker:ldap:up
npm run test:ldap
npm run docker:ldap:down
```

| Test                 | Coverage                   |
| -------------------- | -------------------------- |
| Server health        | Connection, bind           |
| User search          | By uid, email, cn          |
| Group membership     | `memberOf`, `groupOfNames` |
| Organizational units | `ou=users`, `ou=groups`    |
| Service accounts     | Bind DN for searches       |

### Phase 5: SAML

SAML 2.0 federation using Keycloak as IdP.

**Purpose**: Validate SAML protocol, attribute mapping, SSO/SLO.

```bash
npm run docker:saml:up
npm run test:saml
npm run docker:saml:down
```

| Test              | Coverage                   |
| ----------------- | -------------------------- |
| IdP metadata      | Entity ID, SSO bindings    |
| Attribute mapping | Email, name, roles, groups |
| Browser SSO       | SAML request/response flow |
| Protocol mappers  | Claim transformation       |
| Single logout     | SLO endpoints              |

### Phase 6: Advanced IdP (Authentik)

Enterprise IdP with MFA and configurable authentication flows.

**Purpose**: Validate MFA enrollment, TOTP/WebAuthn, auth flow customization.

```bash
npm run docker:authentik:up
npm run test:authentik
npm run docker:authentik:down
```

| Test               | Coverage                  |
| ------------------ | ------------------------- |
| Health endpoints   | Ready, live checks        |
| Admin interface    | Bootstrap login           |
| API endpoints      | v3 API structure          |
| MFA stages         | TOTP, WebAuthn            |
| Flow configuration | Auth flow customization   |
| Outposts           | Reverse proxy integration |

## Running All Tests

```bash
# Run all auth type tests at once
# Tests skip gracefully when their service isn't running
npm run test:auth-types

# Example output:
# 70 skipped (services not running)
# 6 passed (validation tests)
```

To run with all services:

```bash
# Start services (note: may have port conflicts if run simultaneously)
npm run docker:oauth:up
npm run docker:keycloak:up
npm run docker:ldap:up
npm run docker:saml:up
npm run docker:authentik:up

# Wait for services to be healthy (~60s for Authentik)

# Run all tests
npm run test:auth-types

# Cleanup
npm run docker:oauth:down
npm run docker:keycloak:down
npm run docker:ldap:down
npm run docker:saml:down
npm run docker:authentik:down
```

## Port Assignments

| Service         | Port     | Notes           |
| --------------- | -------- | --------------- |
| Mock OAuth      | 8888     | OIDC basic      |
| Keycloak OIDC   | 8081     | Enterprise OIDC |
| Keycloak SAML   | 8082     | SAML IdP        |
| OpenLDAP        | 389, 636 | LDAP/LDAPS      |
| phpLDAPadmin    | 8083     | LDAP admin UI   |
| Authentik       | 9000     | Advanced IdP    |
| Caddy (various) | 8080     | Test proxy      |

## Directory Structure

```
src/__tests__/
├── playwright/
│   ├── oauth-flow.spec.ts           # Phase 2: OIDC basic
│   ├── keycloak-oidc.spec.ts        # Phase 3: OIDC enterprise
│   ├── ldap-identity-store.spec.ts  # Phase 4: LDAP
│   ├── saml-flow.spec.ts            # Phase 5: SAML
│   └── authentik-advanced.spec.ts   # Phase 6: MFA/Flows
├── caddy-security-config.test.ts    # Phase 1: Config validation
tests/integration/
├── docker-compose.oauth.yml
├── docker-compose.keycloak.yml
├── docker-compose.ldap.yml
├── docker-compose.saml.yml
├── docker-compose.authentik.yml
├── Caddyfile.*
└── fixtures/
    ├── keycloak-realm.json
    ├── keycloak-saml-realm.json
    └── ldap-bootstrap.ldif
```

## Test Count Summary

| Phase     | Tests  | Skip Behavior                     |
| --------- | ------ | --------------------------------- |
| 1         | 21     | Never skip (unit tests)           |
| 2         | 7      | Skip if Mock OAuth unavailable    |
| 3         | 16     | Skip if Keycloak unavailable      |
| 4         | 20     | Skip if OpenLDAP unavailable      |
| 5         | 16     | Skip if Keycloak SAML unavailable |
| 6         | 17     | Skip if Authentik unavailable     |
| **Total** | **97** |                                   |

## CI/CD Integration

Tests can run in GitHub Actions with conditional service startup:

```yaml
jobs:
  test-auth-types:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium

      # Start only needed services
      - run: npm run docker:oauth:up
      - run: npm run docker:ldap:up

      # Run tests (others will skip)
      - run: npm run test:auth-types

      - run: npm run docker:oauth:down
      - run: npm run docker:ldap:down
```

## Success Criteria

- [x] Phase 1: Config generation tests pass
- [x] Phase 2: Mock OAuth OIDC flow works
- [x] Phase 3: Keycloak OIDC with RBAC works
- [x] Phase 4: LDAP authentication works
- [x] Phase 5: SAML flows work
- [x] Phase 6: Authentik MFA/flows work
- [ ] CI/CD: Integration tests run in GitHub Actions
