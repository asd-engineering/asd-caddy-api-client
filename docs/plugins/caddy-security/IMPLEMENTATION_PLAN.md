# caddy-security Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Caddy Configuration                         │
├─────────────────────────────────────────────────────────────────┤
│  apps:                                                          │
│    security:                    ← SecurityApp                   │
│      config:                    ← SecurityConfig                │
│        authentication_portals:  ← AuthPortal[]                  │
│        authorization_policies:  ← AuthzPolicy[]                 │
│        identity_providers:      ← IdentityProvider[]            │
│        identity_stores:         ← IdentityStore[]               │
│        credentials:             ← Credential[]                  │
│                                                                 │
│    http:                                                        │
│      servers:                                                   │
│        routes:                                                  │
│          - handle:                                              │
│              - handler: "authenticator"  ← refs portal by name  │
│              - handler: "authentication" ← refs policy by name  │
│                providers:                  (via authorizer)     │
│                  authorizer: ...                                │
└─────────────────────────────────────────────────────────────────┘
```

## Key Insight: Name-Based References

Everything in caddy-security uses **name-based references**:

1. Portal defines: `name: "myportal"`
2. Handler references: `portal_name: "myportal"`
3. Portal references providers: `identity_providers: ["github", "google"]`
4. Providers defined separately: `realm: "github"`

This means our builders need to:

- Accept names as strings
- Validate that referenced names exist (optional, can be done at build time)
- Return objects that can be assembled into the full config

## Implementation Phases

### Phase 1: Core Types & Schemas (Foundation)

**Goal**: Define all TypeScript types and Zod schemas for the caddy-security config structure.

#### 1.1 Security App Types

```typescript
// src/plugins/caddy-security/types.ts

export interface SecurityApp {
  config?: SecurityConfig;
  secrets_managers?: unknown[];
}

export interface SecurityConfig {
  authentication_portals?: AuthPortal[];
  authorization_policies?: AuthzPolicy[];
  identity_providers?: IdentityProvider[];
  identity_stores?: IdentityStore[];
  credentials?: Credential[];
  sso_providers?: SsoProvider[];
}
```

#### 1.2 Authentication Portal

```typescript
export interface AuthPortal {
  name: string; // Required - referenced by handlers

  // Provider references (by name)
  identity_providers?: string[];
  identity_stores?: string[];
  single_sign_on_providers?: string[];

  // UI configuration
  ui?: PortalUI;

  // Cookie settings
  cookie_config?: CookieConfig;

  // Token options
  token_validator_options?: TokenValidatorOptions;
  token_grantor_options?: TokenGrantorOptions;

  // API settings
  api?: ApiConfig;
}

export interface PortalUI {
  theme?: string;
  logo_url?: string;
  logo_description?: string;
  meta_title?: string;
  meta_description?: string;
  auto_redirect_url?: string;
  templates?: Record<string, string>;
}

export interface CookieConfig {
  path?: string;
  lifetime?: number;
  samesite?: "lax" | "strict" | "none";
  insecure?: boolean;
  domains?: Record<string, CookieDomainConfig>;
}
```

#### 1.3 Authorization Policy

```typescript
export interface AuthzPolicy {
  name: string; // Required - referenced by handlers

  // ACL rules
  access_list_rules?: AclRule[];

  // Crypto
  crypto_key_configs?: CryptoKeyConfig[];

  // Redirect settings
  auth_url_path?: string;
  forbidden_url?: string;
  auth_redirect_query_parameter?: string;
  auth_redirect_status_code?: number;
  auth_redirect_query_disabled?: boolean;
  auth_redirect_disabled?: boolean;

  // Validation options
  validate_source_address?: boolean;
  validate_bearer_header?: boolean;
  validate_method_path?: boolean;
  validate_access_list_path_claim?: boolean;

  // Token sources
  allowed_token_sources?: string[];
  strip_token_enabled?: boolean;

  // Login hints
  login_hint_validators?: string[];

  // User identity
  user_identity_field?: string;
}

export interface AclRule {
  comment?: string;
  action: string; // "allow", "deny", "allow log info", etc.
  conditions: string[]; // "match roles admin", "match path /api/*"
}
```

#### 1.4 Identity Providers (OAuth/SAML)

```typescript
export interface IdentityProvider {
  realm: string; // Required - used as reference name
  driver: string; // Required - "github", "google", "generic", etc.

  // OAuth credentials
  client_id?: string;
  client_secret?: string;

  // URLs
  base_auth_url?: string;
  metadata_url?: string;
  authorization_url?: string;
  token_url?: string;

  // Scopes
  scopes?: string[];

  // User info extraction
  user_info_roles_field_name?: string;
  user_info_fields?: string[];
  required_token_fields?: string[];

  // UI
  login_icon?: LoginIcon;

  // Options
  domain_name?: string;
  metadata_discovery_disabled?: boolean;
  key_verification_disabled?: boolean;
  email_claim_check_disabled?: boolean;
  logout_enabled?: boolean;

  // Retry
  retry_attempts?: number;
  retry_interval?: number;
}

export interface LoginIcon {
  text?: string;
  css_class?: string;
  color?: string;
  background_color?: string;
  priority?: number;
}
```

#### 1.5 Identity Stores (Local/LDAP)

```typescript
export interface LocalIdentityStore {
  realm: string; // Required
  path?: string; // File path for user storage
  users?: LocalUser[];

  // Recovery options
  username_recovery_enabled?: boolean;
  password_recovery_enabled?: boolean;
  contact_support_enabled?: boolean;
  support_link?: string;
  support_email?: string;

  // Defaults
  fallback_roles?: string[];
}

export interface LocalUser {
  username: string;
  name?: string;
  email_address?: string;
  password: string; // plain or "bcrypt:cost:hash"
  password_overwrite_enabled?: boolean;
  roles?: string[];
}

export interface LdapIdentityStore {
  realm: string;

  // Search config
  search_base_dn: string;
  search_user_filter?: string;
  search_group_filter?: string;

  // Bind credentials
  bind_username?: string;
  bind_password?: string;

  // Servers
  servers: LdapServer[];

  // Attribute mapping
  attributes?: LdapAttributes;

  // Group mapping
  groups?: LdapGroup[];

  // TLS
  trusted_authorities?: string[];

  // Options
  fallback_roles?: string[];
}

export type IdentityStore =
  | ({ type: "local" } & LocalIdentityStore)
  | ({ type: "ldap" } & LdapIdentityStore);
```

### Phase 2: Builder Functions (High-Level API)

**Goal**: Create ergonomic builder functions that validate and construct configs.

#### 2.1 Security App Builder

```typescript
// src/plugins/caddy-security/builders.ts

export interface BuildSecurityAppOptions {
  portals?: AuthPortal[];
  policies?: AuthzPolicy[];
  identityProviders?: IdentityProvider[];
  identityStores?: IdentityStore[];
  credentials?: Credential[];
}

export function buildSecurityApp(options: BuildSecurityAppOptions): SecurityApp {
  // Validate references (portals reference existing providers/stores)
  // Return validated config
}
```

#### 2.2 Portal Builder

```typescript
export interface BuildAuthPortalOptions {
  name: string;

  // Simple provider references
  identityProviders?: string[];
  identityStores?: string[];

  // UI customization
  theme?: string;
  logoUrl?: string;
  title?: string;

  // Cookie settings
  cookieDomain?: string;
  cookieLifetime?: number;
  secureCookies?: boolean;
}

export function buildAuthPortal(options: BuildAuthPortalOptions): AuthPortal {
  return validateOrThrow(
    AuthPortalSchema,
    {
      name: options.name,
      identity_providers: options.identityProviders,
      identity_stores: options.identityStores,
      ui: {
        theme: options.theme,
        logo_url: options.logoUrl,
        meta_title: options.title,
      },
      cookie_config: options.cookieDomain
        ? {
            domains: {
              [options.cookieDomain]: {
                lifetime: options.cookieLifetime ?? 3600,
                insecure: !options.secureCookies,
              },
            },
          }
        : undefined,
    },
    "buildAuthPortal"
  );
}
```

#### 2.3 Policy Builder

```typescript
export interface BuildAuthzPolicyOptions {
  name: string;

  // Simple ACL
  defaultAction?: "allow" | "deny";
  rules?: Array<{
    action: "allow" | "deny";
    roles?: string[];
    paths?: string[];
    comment?: string;
  }>;

  // Redirect settings
  authUrl?: string;
  forbiddenUrl?: string;
}

export function buildAuthzPolicy(options: BuildAuthzPolicyOptions): AuthzPolicy {
  const rules: AclRule[] = (options.rules ?? []).map((rule) => ({
    comment: rule.comment,
    action: rule.action,
    conditions: [
      ...(rule.roles ? [`match roles ${rule.roles.join(" ")}`] : []),
      ...(rule.paths ? rule.paths.map((p) => `match path ${p}`) : []),
    ].filter(Boolean),
  }));

  if (options.defaultAction) {
    rules.push({
      action: options.defaultAction,
      conditions: ["match any"],
    });
  }

  return validateOrThrow(
    AuthzPolicySchema,
    {
      name: options.name,
      access_list_rules: rules,
      auth_url_path: options.authUrl,
      forbidden_url: options.forbiddenUrl,
    },
    "buildAuthzPolicy"
  );
}
```

#### 2.4 Identity Provider Builders

```typescript
// Pre-configured OAuth providers
export function buildGitHubProvider(options: {
  name?: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
}): IdentityProvider {
  return {
    realm: options.name ?? "github",
    driver: "github",
    client_id: options.clientId,
    client_secret: options.clientSecret,
    scopes: options.scopes ?? ["user"],
    login_icon: {
      text: "GitHub",
      css_class: "lab la-github",
      color: "#ffffff",
      background_color: "#000000",
    },
  };
}

export function buildGoogleProvider(options: {
  name?: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
}): IdentityProvider {
  return {
    realm: options.name ?? "google",
    driver: "google",
    client_id: options.clientId,
    client_secret: options.clientSecret,
    scopes: options.scopes ?? ["openid", "email", "profile"],
    login_icon: {
      text: "Google",
      css_class: "lab la-google",
      color: "#ffffff",
      background_color: "#4285f4",
    },
  };
}

export function buildGenericOAuthProvider(options: {
  name: string;
  driver?: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes?: string[];
  userInfoFields?: string[];
}): IdentityProvider {
  return {
    realm: options.name,
    driver: options.driver ?? "generic",
    client_id: options.clientId,
    client_secret: options.clientSecret,
    authorization_url: options.authorizationUrl,
    token_url: options.tokenUrl,
    scopes: options.scopes ?? ["openid"],
    user_info_fields: options.userInfoFields,
  };
}
```

#### 2.5 Identity Store Builders

```typescript
export function buildLocalIdentityStore(options: {
  name?: string;
  users: Array<{
    username: string;
    password: string;
    name?: string;
    email?: string;
    roles?: string[];
  }>;
}): LocalIdentityStore {
  return {
    realm: options.name ?? "local",
    users: options.users.map((u) => ({
      username: u.username,
      password: u.password,
      name: u.name,
      email_address: u.email,
      roles: u.roles ?? ["user"],
    })),
  };
}
```

### Phase 3: CaddyClient Integration

**Goal**: Add methods to CaddyClient for managing security configuration.

#### 3.1 New Client Methods

```typescript
// src/caddy/client.ts additions

export class CaddyClient {
  // ... existing methods ...

  /**
   * Configure the security app
   */
  async configureSecurityApp(app: SecurityApp): Promise<void> {
    await this.put("/config/apps/security", app);
  }

  /**
   * Get current security configuration
   */
  async getSecurityConfig(): Promise<SecurityApp | null> {
    try {
      return await this.get<SecurityApp>("/config/apps/security");
    } catch (e) {
      if (e instanceof CaddyApiError && e.statusCode === 404) {
        return null;
      }
      throw e;
    }
  }

  /**
   * Add an authentication portal
   */
  async addAuthPortal(portal: AuthPortal): Promise<void> {
    await this.post("/config/apps/security/config/authentication_portals", portal);
  }

  /**
   * Add an authorization policy
   */
  async addAuthzPolicy(policy: AuthzPolicy): Promise<void> {
    await this.post("/config/apps/security/config/authorization_policies", policy);
  }

  /**
   * Add an identity provider
   */
  async addIdentityProvider(provider: IdentityProvider): Promise<void> {
    await this.post("/config/apps/security/config/identity_providers", provider);
  }
}
```

### Phase 4: High-Level Domain Functions

**Goal**: Create convenience functions for common auth patterns.

#### 4.1 Protected Route Helpers

```typescript
// src/plugins/caddy-security/domains.ts

export interface AddProtectedDomainOptions {
  client: CaddyClient;
  domain: string;

  // Authentication
  portalName: string;
  loginPath?: string; // default: "/auth/*"

  // Authorization
  policyName: string;
  protectedPaths?: string[]; // default: ["/*"]
  publicPaths?: string[]; // paths that skip auth

  // Backend
  upstream: string;
}

export async function addProtectedDomain(options: AddProtectedDomainOptions): Promise<void> {
  const routes: CaddyRoute[] = [];

  // Public paths (no auth)
  if (options.publicPaths?.length) {
    routes.push({
      match: [{ host: [options.domain], path: options.publicPaths }],
      handle: [{ handler: "reverse_proxy", upstreams: [{ dial: options.upstream }] }],
    });
  }

  // Login portal route
  routes.push({
    match: [{ host: [options.domain], path: [options.loginPath ?? "/auth/*"] }],
    handle: [{ handler: "authenticator", portal_name: options.portalName }],
  });

  // Protected routes
  routes.push({
    match: [{ host: [options.domain], path: options.protectedPaths ?? ["/*"] }],
    handle: [
      {
        handler: "authentication",
        providers: {
          authorizer: { gatekeeper_name: options.policyName },
        },
      },
      { handler: "reverse_proxy", upstreams: [{ dial: options.upstream }] },
    ],
  });

  // Add routes to Caddy
  await options.client.patchRoutes(routes);
}
```

#### 4.2 Quick Setup Function

```typescript
export interface QuickSecuritySetupOptions {
  client: CaddyClient;

  // Portal
  portalName?: string;

  // Users (for local auth)
  users?: Array<{
    username: string;
    password: string;
    roles?: string[];
  }>;

  // OAuth providers
  github?: { clientId: string; clientSecret: string };
  google?: { clientId: string; clientSecret: string };

  // Policy
  policyName?: string;
  adminRoles?: string[];
  userRoles?: string[];
}

export async function setupBasicAuth(options: QuickSecuritySetupOptions): Promise<{
  portalName: string;
  policyName: string;
}> {
  const portalName = options.portalName ?? "main";
  const policyName = options.policyName ?? "default";

  const providers: IdentityProvider[] = [];
  const stores: IdentityStore[] = [];

  // Add OAuth providers
  if (options.github) {
    providers.push(buildGitHubProvider(options.github));
  }
  if (options.google) {
    providers.push(buildGoogleProvider(options.google));
  }

  // Add local users
  if (options.users?.length) {
    stores.push(buildLocalIdentityStore({ users: options.users }));
  }

  // Build portal
  const portal = buildAuthPortal({
    name: portalName,
    identityProviders: providers.map((p) => p.realm),
    identityStores: stores.map((s) => s.realm),
  });

  // Build policy
  const policy = buildAuthzPolicy({
    name: policyName,
    rules: [
      ...(options.adminRoles
        ? [
            {
              action: "allow" as const,
              roles: options.adminRoles,
              comment: "Allow admin roles",
            },
          ]
        : []),
      ...(options.userRoles
        ? [
            {
              action: "allow" as const,
              roles: options.userRoles,
              comment: "Allow user roles",
            },
          ]
        : []),
    ],
    defaultAction: "deny",
  });

  // Configure security app
  await options.client.configureSecurityApp({
    config: {
      authentication_portals: [portal],
      authorization_policies: [policy],
      identity_providers: providers,
      identity_stores: stores,
    },
  });

  return { portalName, policyName };
}
```

## File Structure

```
src/plugins/caddy-security/
├── index.ts              # Public exports
├── types.ts              # All TypeScript interfaces
├── schemas.ts            # All Zod schemas
├── builders.ts           # Builder functions
├── domains.ts            # High-level domain functions
└── providers/            # Pre-configured provider helpers
    ├── github.ts
    ├── google.ts
    ├── azure-ad.ts
    └── generic-oauth.ts
```

## Implementation Order

1. **Types & Schemas** (Phase 1)
   - Define all interfaces in types.ts
   - Create Zod schemas in schemas.ts
   - Export from index.ts

2. **Core Builders** (Phase 2.1-2.3)
   - `buildSecurityApp()`
   - `buildAuthPortal()`
   - `buildAuthzPolicy()`
   - `buildAclRule()`

3. **Provider Builders** (Phase 2.4-2.5)
   - `buildGitHubProvider()`
   - `buildGoogleProvider()`
   - `buildGenericOAuthProvider()`
   - `buildLocalIdentityStore()`
   - `buildLdapIdentityStore()`

4. **Client Integration** (Phase 3)
   - Add security methods to CaddyClient
   - Response validation

5. **High-Level API** (Phase 4)
   - `addProtectedDomain()`
   - `setupBasicAuth()`
   - Example documentation

## Testing Strategy

1. **Unit Tests**: Schema validation, builder output
2. **Integration Tests**: Full config apply to Caddy with security plugin
3. **Example Scripts**: Real-world usage patterns

## Success Criteria

- [ ] All types match Go source field names
- [ ] Builders produce valid JSON for Caddy
- [ ] Integration test passes with real Caddy + caddy-security
- [ ] Examples work end-to-end
- [ ] TypeScript IntelliSense provides good DX
