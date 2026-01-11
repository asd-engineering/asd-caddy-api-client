# Integration Test Plan: caddy-security Authentication

## Overview

This document outlines the integration testing strategy for caddy-security authentication types using Playwright for browser-based flows and Docker containers for identity providers.

## Test Phases

| Phase       | Focus                  | Services           | Priority |
| ----------- | ---------------------- | ------------------ | -------- |
| **Phase 1** | Quick Wins (No Docker) | None               | P0       |
| **Phase 2** | Mock OAuth             | mock-oauth2-server | P0       |
| **Phase 3** | Full OAuth/OIDC        | Keycloak           | P1       |
| **Phase 4** | LDAP                   | OpenLDAP           | P1       |
| **Phase 5** | SAML                   | Keycloak SAML      | P2       |
| **Phase 6** | Advanced               | Authentik, MFA     | P3       |

---

## Phase 1: Quick Wins (No External Services)

These tests validate caddy-security configuration generation without running Caddy or identity providers.

### Tests

| Test                          | Description                           | Playwright? |
| ----------------------------- | ------------------------------------- | ----------- |
| `local-identity-store`        | Generate local user store config      | No          |
| `jwt-validation-config`       | Generate JWT validator config         | No          |
| `acl-rule-config`             | Generate ACL rules                    | No          |
| `portal-config`               | Generate authentication portal config | No          |
| `cookie-config`               | Generate cookie settings              | No          |
| `oauth-provider-config`       | Generate OAuth provider config        | No          |
| `authorization-policy-config` | Generate authorization policy         | No          |

### Implementation

```typescript
// src/__tests__/integration/caddy-security-config.integration.test.ts
describe("caddy-security config generation", () => {
  test("generates valid local identity store config", () => {
    const config = buildLocalIdentityStore({
      name: "local_users",
      realm: "local",
      path: "users.json",
    });
    expect(config).toMatchSnapshot();
  });

  test("generates valid OAuth provider config", () => {
    const config = buildOAuthProvider({
      name: "google",
      driver: "google",
      client_id: "xxx",
      client_secret: "xxx",
      scopes: ["openid", "email", "profile"],
    });
    expect(config).toMatchSnapshot();
  });
});
```

---

## Phase 2: Mock OAuth Server

Fast OAuth flow testing without real identity providers.

### Docker Service

```yaml
mock-oauth:
  image: ghcr.io/navikt/mock-oauth2-server:2.1.0
  ports: ["9000:9000"]
  environment:
    SERVER_PORT: 9000
    JSON_CONFIG: |
      {
        "interactiveLogin": true,
        "httpServer": "NettyWrapper",
        "tokenCallbacks": [
          {
            "issuerId": "default",
            "tokenExpiry": 3600,
            "requestMappings": [
              {
                "requestParam": "scope",
                "match": "openid",
                "claims": {
                  "sub": "test-user",
                  "email": "test@example.com",
                  "name": "Test User"
                }
              }
            ]
          }
        ]
      }
```

### Playwright Tests

| Test                       | Flow                                |
| -------------------------- | ----------------------------------- |
| `oauth-authorize-redirect` | App → Mock OAuth login page         |
| `oauth-callback`           | Mock OAuth → App callback with code |
| `oauth-token-exchange`     | Code → Token exchange               |
| `oauth-userinfo`           | Token → User info endpoint          |
| `oauth-logout`             | Logout flow                         |

### Implementation

```typescript
// src/__tests__/integration/oauth-flow.integration.test.ts
import { test, expect } from "@playwright/test";

test.describe("OAuth Flow with Mock Server", () => {
  test("completes full OAuth login flow", async ({ page }) => {
    // 1. Visit protected resource
    await page.goto("http://localhost:8080/protected");

    // 2. Should redirect to OAuth login
    await expect(page).toHaveURL(/mock-oauth.*authorize/);

    // 3. Fill login form (mock server auto-login or interactive)
    await page.fill('[name="username"]', "test-user");
    await page.click('button[type="submit"]');

    // 4. Should redirect back with token
    await expect(page).toHaveURL(/localhost:8080/);

    // 5. Verify authenticated state
    await expect(page.locator(".user-info")).toContainText("test@example.com");
  });
});
```

---

## Phase 3: Keycloak (Full OIDC)

Production-like OAuth/OIDC testing with Keycloak.

### Docker Service

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:23.0
  command: start-dev --import-realm
  environment:
    KEYCLOAK_ADMIN: admin
    KEYCLOAK_ADMIN_PASSWORD: admin
  volumes:
    - ./fixtures/keycloak-realm.json:/opt/keycloak/data/import/realm.json
  ports: ["8080:8080"]
```

### Realm Fixture

```json
{
  "realm": "test-realm",
  "enabled": true,
  "clients": [
    {
      "clientId": "caddy-app",
      "enabled": true,
      "publicClient": false,
      "secret": "test-secret",
      "redirectUris": ["http://localhost:8080/*"],
      "webOrigins": ["http://localhost:8080"]
    }
  ],
  "users": [
    {
      "username": "testuser",
      "email": "test@example.com",
      "enabled": true,
      "credentials": [{ "type": "password", "value": "password" }],
      "realmRoles": ["user"]
    }
  ]
}
```

### Tests

| Test                     | Description          |
| ------------------------ | -------------------- |
| `keycloak-oidc-login`    | Full OIDC login flow |
| `keycloak-refresh-token` | Token refresh        |
| `keycloak-logout`        | RP-initiated logout  |
| `keycloak-groups`        | Group claims mapping |
| `keycloak-roles`         | Role-based access    |

---

## Phase 4: LDAP

### Docker Service

```yaml
openldap:
  image: osixia/openldap:1.5.0
  environment:
    LDAP_ORGANISATION: "Test Org"
    LDAP_DOMAIN: "test.local"
    LDAP_ADMIN_PASSWORD: "admin"
    LDAP_TLS: "false"
  volumes:
    - ./fixtures/ldap-bootstrap.ldif:/container/service/slapd/assets/config/bootstrap/ldif/custom/bootstrap.ldif
  ports: ["389:389"]
```

### LDIF Fixture

```ldif
dn: ou=users,dc=test,dc=local
objectClass: organizationalUnit
ou: users

dn: cn=testuser,ou=users,dc=test,dc=local
objectClass: inetOrgPerson
cn: testuser
sn: User
uid: testuser
mail: test@test.local
userPassword: password

dn: cn=admins,ou=groups,dc=test,dc=local
objectClass: groupOfNames
cn: admins
member: cn=testuser,ou=users,dc=test,dc=local
```

### Tests

| Test                    | Description               |
| ----------------------- | ------------------------- |
| `ldap-simple-bind`      | Username/password auth    |
| `ldap-search-user`      | User lookup               |
| `ldap-group-membership` | Group-based authorization |

---

## Phase 5: SAML

Uses Keycloak as SAML IdP.

### Tests

| Test                     | Description               |
| ------------------------ | ------------------------- |
| `saml-redirect-binding`  | HTTP-Redirect flow        |
| `saml-post-binding`      | HTTP-POST flow            |
| `saml-attribute-mapping` | Attribute → claim mapping |
| `saml-logout`            | SLO flow                  |

---

## Directory Structure

```
src/__tests__/
├── integration/
│   ├── caddy-security/
│   │   ├── config-generation.test.ts    # Phase 1: No Docker
│   │   ├── oauth-mock.test.ts           # Phase 2: Mock OAuth
│   │   ├── oauth-keycloak.test.ts       # Phase 3: Keycloak
│   │   ├── ldap.test.ts                 # Phase 4: LDAP
│   │   └── saml.test.ts                 # Phase 5: SAML
│   └── fixtures/
│       ├── keycloak-realm.json
│       ├── ldap-bootstrap.ldif
│       └── mock-oauth-config.json
├── playwright/
│   └── caddy-security/
│       ├── oauth-flow.spec.ts
│       ├── ldap-login.spec.ts
│       └── saml-flow.spec.ts
docker/
├── docker-compose.integration.yml
└── Caddyfile.test
```

## NPM Scripts

```json
{
  "test:integration:quick": "vitest run src/__tests__/integration/caddy-security/config-generation.test.ts",
  "test:integration:oauth": "docker compose -f docker/docker-compose.integration.yml up -d mock-oauth && playwright test src/playwright/caddy-security/oauth-flow.spec.ts",
  "test:integration:keycloak": "docker compose -f docker/docker-compose.integration.yml up -d keycloak && playwright test",
  "test:integration:all": "docker compose -f docker/docker-compose.integration.yml up -d && playwright test"
}
```

## Success Criteria

- [ ] Phase 1: All config generation tests pass
- [ ] Phase 2: OAuth flow with mock server works end-to-end
- [ ] Phase 3: Keycloak OIDC login/logout works
- [ ] Phase 4: LDAP authentication works
- [ ] Phase 5: SAML flows work
- [ ] CI/CD: Integration tests run in GitHub Actions

## Dependencies

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0"
  }
}
```

## Next Steps

1. Install Playwright: `npm init playwright@latest`
2. Implement Phase 1 tests (no Docker required)
3. Create Docker compose for Phase 2
4. Implement OAuth flow tests with Playwright
5. Iterate through remaining phases
