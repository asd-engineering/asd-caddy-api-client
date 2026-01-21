/**
 * Caddy Security Configuration Templates
 *
 * IMPORTANT: These templates serve as the SINGLE SOURCE OF TRUTH for:
 * 1. VSCode snippets (auto-generated from these templates)
 * 2. Documentation examples
 * 3. Test fixtures
 *
 * All templates are validated by templates.test.ts to ensure they produce
 * valid Caddy configurations. If you add a new template, it will automatically:
 * - Be tested for validity
 * - Be exported as a VSCode snippet
 *
 * @see templates.test.ts - Validates all templates
 * @see vscode-extension/scripts/generate-snippets.js - Generates snippets from templates
 */

import {
  buildLocalIdentityStore,
  buildLdapIdentityStore,
  buildOAuth2Provider,
  buildOidcProvider,
  buildAuthenticationPortal,
  buildAuthorizationPolicy,
  buildSecurityConfig,
  buildAuthenticatorRoute,
  buildProtectedRoute,
} from "./builders.js";

// ============================================================================
// Template Type Definitions
// ============================================================================

export interface TemplateVariable {
  name: string;
  description: string;
  default: string;
  placeholder?: string;
}

export interface SecurityTemplate {
  /** Template identifier (used as snippet prefix) */
  id: string;
  /** Display name */
  name: string;
  /** Description shown in IntelliSense */
  description: string;
  /** Category for grouping */
  category: "identity-store" | "identity-provider" | "portal" | "policy" | "route" | "full-setup";
  /** Variables that users can customize */
  variables: TemplateVariable[];
  /** Function that builds the configuration (used for testing) */
  build: () => unknown;
  /** Raw snippet body for VSCode (with $1, $2 placeholders) */
  snippet: string[];
}

// ============================================================================
// Identity Store Templates
// ============================================================================

export const LOCAL_IDENTITY_STORE_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-local-store",
  name: "Local Identity Store",
  description: "File-based user authentication with JSON credentials file",
  category: "identity-store",
  variables: [
    { name: "path", description: "Path to users JSON file", default: "/etc/caddy/users.json" },
    { name: "realm", description: "Authentication realm name", default: "local" },
  ],
  build: () =>
    buildLocalIdentityStore({
      path: "/etc/caddy/users.json",
      realm: "local",
    }),
  snippet: [
    "buildLocalIdentityStore({",
    '  path: "${1:/etc/caddy/users.json}",',
    '  realm: "${2:local}",',
    "})",
  ],
};

export const LDAP_IDENTITY_STORE_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-ldap-store",
  name: "LDAP Identity Store",
  description: "LDAP/Active Directory authentication",
  category: "identity-store",
  variables: [
    { name: "server", description: "LDAP server address", default: "ldap.example.com" },
    { name: "port", description: "LDAP server port", default: "389" },
    {
      name: "bindDn",
      description: "Bind DN for LDAP queries",
      default: "cn=admin,dc=example,dc=com",
    },
    { name: "bindPassword", description: "Bind password", default: "secret" },
    {
      name: "searchBaseDn",
      description: "Base DN for user searches",
      default: "ou=users,dc=example,dc=com",
    },
  ],
  build: () =>
    buildLdapIdentityStore({
      servers: [{ address: "ldap.example.com", port: 389 }],
      bindDn: "cn=admin,dc=example,dc=com",
      bindPassword: "secret",
      searchBaseDn: "ou=users,dc=example,dc=com",
      searchFilter: "(uid={username})",
    }),
  snippet: [
    "buildLdapIdentityStore({",
    '  servers: [{ address: "${1:ldap.example.com}", port: ${2:389} }],',
    '  bindDn: "${3:cn=admin,dc=example,dc=com}",',
    '  bindPassword: "${4:secret}",',
    '  searchBaseDn: "${5:ou=users,dc=example,dc=com}",',
    '  searchFilter: "${6:(uid={username})}",',
    "})",
  ],
};

// ============================================================================
// Identity Provider Templates
// ============================================================================

export const OAUTH2_GITHUB_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-oauth2-github",
  name: "GitHub OAuth2 Provider",
  description: "GitHub OAuth2 authentication for developer tools",
  category: "identity-provider",
  variables: [
    { name: "clientId", description: "GitHub OAuth App client ID", default: "your-client-id" },
    {
      name: "clientSecret",
      description: "GitHub OAuth App client secret",
      default: "your-client-secret",
    },
  ],
  build: () =>
    buildOAuth2Provider({
      provider: "github",
      clientId: "your-client-id",
      clientSecret: "your-client-secret",
      scopes: ["user:email", "read:user"],
    }),
  snippet: [
    "buildOAuth2Provider({",
    '  provider: "github",',
    '  clientId: "${1:your-client-id}",',
    '  clientSecret: "${2:your-client-secret}",',
    '  scopes: ["user:email", "read:user"],',
    "})",
  ],
};

export const OAUTH2_GOOGLE_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-oauth2-google",
  name: "Google OAuth2 Provider",
  description: "Google OAuth2 authentication",
  category: "identity-provider",
  variables: [
    {
      name: "clientId",
      description: "Google OAuth client ID",
      default: "your-client-id.apps.googleusercontent.com",
    },
    {
      name: "clientSecret",
      description: "Google OAuth client secret",
      default: "your-client-secret",
    },
  ],
  build: () =>
    buildOAuth2Provider({
      provider: "google",
      clientId: "your-client-id.apps.googleusercontent.com",
      clientSecret: "your-client-secret",
      scopes: ["openid", "email", "profile"],
    }),
  snippet: [
    "buildOAuth2Provider({",
    '  provider: "google",',
    '  clientId: "${1:your-client-id.apps.googleusercontent.com}",',
    '  clientSecret: "${2:your-client-secret}",',
    '  scopes: ["openid", "email", "profile"],',
    "})",
  ],
};

export const OIDC_KEYCLOAK_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-oidc-keycloak",
  name: "Keycloak OIDC Provider",
  description: "Keycloak OpenID Connect authentication",
  category: "identity-provider",
  variables: [
    { name: "clientId", description: "Keycloak client ID", default: "my-app" },
    { name: "clientSecret", description: "Keycloak client secret", default: "your-client-secret" },
    {
      name: "discoveryUrl",
      description: "OIDC discovery URL",
      default: "https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration",
    },
  ],
  build: () =>
    buildOidcProvider({
      provider: "keycloak",
      clientId: "my-app",
      clientSecret: "your-client-secret",
      discoveryUrl: "https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration",
      scopes: ["openid", "email", "profile"],
    }),
  snippet: [
    "buildOidcProvider({",
    '  provider: "keycloak",',
    '  clientId: "${1:my-app}",',
    '  clientSecret: "${2:your-client-secret}",',
    '  discoveryUrl: "${3:https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration}",',
    '  scopes: ["openid", "email", "profile"],',
    "})",
  ],
};

export const OIDC_OKTA_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-oidc-okta",
  name: "Okta OIDC Provider",
  description: "Okta OpenID Connect authentication",
  category: "identity-provider",
  variables: [
    { name: "clientId", description: "Okta client ID", default: "your-client-id" },
    { name: "clientSecret", description: "Okta client secret", default: "your-client-secret" },
    { name: "domain", description: "Okta domain", default: "your-domain.okta.com" },
  ],
  build: () =>
    buildOidcProvider({
      provider: "okta",
      clientId: "your-client-id",
      clientSecret: "your-client-secret",
      discoveryUrl: "https://your-domain.okta.com/.well-known/openid-configuration",
    }),
  snippet: [
    "buildOidcProvider({",
    '  provider: "okta",',
    '  clientId: "${1:your-client-id}",',
    '  clientSecret: "${2:your-client-secret}",',
    '  discoveryUrl: "https://${3:your-domain.okta.com}/.well-known/openid-configuration",',
    "})",
  ],
};

export const OIDC_AUTH0_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-oidc-auth0",
  name: "Auth0 OIDC Provider",
  description: "Auth0 OpenID Connect authentication",
  category: "identity-provider",
  variables: [
    { name: "clientId", description: "Auth0 client ID", default: "your-client-id" },
    { name: "clientSecret", description: "Auth0 client secret", default: "your-client-secret" },
    { name: "domain", description: "Auth0 domain", default: "your-tenant.auth0.com" },
  ],
  build: () =>
    buildOidcProvider({
      provider: "auth0",
      clientId: "your-client-id",
      clientSecret: "your-client-secret",
      discoveryUrl: "https://your-tenant.auth0.com/.well-known/openid-configuration",
    }),
  snippet: [
    "buildOidcProvider({",
    '  provider: "auth0",',
    '  clientId: "${1:your-client-id}",',
    '  clientSecret: "${2:your-client-secret}",',
    '  discoveryUrl: "https://${3:your-tenant.auth0.com}/.well-known/openid-configuration",',
    "})",
  ],
};

// ============================================================================
// Portal Templates
// ============================================================================

export const BASIC_PORTAL_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-portal-basic",
  name: "Basic Authentication Portal",
  description: "Simple authentication portal with local identity store",
  category: "portal",
  variables: [
    { name: "name", description: "Portal name", default: "myportal" },
    { name: "identityStore", description: "Identity store name", default: "local" },
  ],
  build: () =>
    buildAuthenticationPortal({
      name: "myportal",
      identityStores: ["local"],
    }),
  snippet: [
    "buildAuthenticationPortal({",
    '  name: "${1:myportal}",',
    '  identityStores: ["${2:local}"],',
    "})",
  ],
};

export const PORTAL_WITH_COOKIE_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-portal-cookie",
  name: "Portal with Cookie Configuration",
  description: "Authentication portal with custom cookie settings",
  category: "portal",
  variables: [
    { name: "name", description: "Portal name", default: "myportal" },
    { name: "domain", description: "Cookie domain", default: ".example.com" },
    { name: "lifetime", description: "Session lifetime", default: "24h" },
  ],
  build: () =>
    buildAuthenticationPortal({
      name: "myportal",
      identityStores: ["local"],
      cookie: {
        domain: ".example.com",
        path: "/",
        lifetime: "24h",
      },
    }),
  snippet: [
    "buildAuthenticationPortal({",
    '  name: "${1:myportal}",',
    '  identityStores: ["${2:local}"],',
    "  cookie: {",
    '    domain: "${3:.example.com}",',
    '    path: "/",',
    '    lifetime: "${4:24h}",',
    "  },",
    "})",
  ],
};

export const PORTAL_WITH_SSO_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-portal-sso",
  name: "Portal with SSO Providers",
  description: "Authentication portal with OAuth/OIDC single sign-on",
  category: "portal",
  variables: [
    { name: "name", description: "Portal name", default: "myportal" },
    { name: "providers", description: "Identity providers", default: "keycloak" },
  ],
  build: () =>
    buildAuthenticationPortal({
      name: "myportal",
      identityStores: ["local"],
      identityProviders: ["keycloak", "google"],
    }),
  snippet: [
    "buildAuthenticationPortal({",
    '  name: "${1:myportal}",',
    '  identityStores: ["${2:local}"],',
    '  identityProviders: ["${3:keycloak}", "${4:google}"],',
    "})",
  ],
};

// ============================================================================
// Policy Templates
// ============================================================================

export const BASIC_POLICY_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-policy-basic",
  name: "Basic Authorization Policy",
  description: "Simple role-based access control policy",
  category: "policy",
  variables: [
    { name: "name", description: "Policy name", default: "mypolicy" },
    { name: "roles", description: "Allowed roles", default: "user" },
  ],
  build: () =>
    buildAuthorizationPolicy({
      name: "mypolicy",
      accessLists: [{ claim: "roles", values: ["user"] }],
    }),
  snippet: [
    "buildAuthorizationPolicy({",
    '  name: "${1:mypolicy}",',
    "  accessLists: [",
    '    { claim: "roles", values: ["${2:user}"] },',
    "  ],",
    "})",
  ],
};

export const ADMIN_POLICY_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-policy-admin",
  name: "Admin-Only Policy",
  description: "Policy that restricts access to admin role only",
  category: "policy",
  variables: [{ name: "name", description: "Policy name", default: "admin-policy" }],
  build: () =>
    buildAuthorizationPolicy({
      name: "admin-policy",
      accessLists: [{ claim: "roles", values: ["admin"] }],
    }),
  snippet: [
    "buildAuthorizationPolicy({",
    '  name: "${1:admin-policy}",',
    "  accessLists: [",
    '    { claim: "roles", values: ["admin"], action: "allow" },',
    "  ],",
    "})",
  ],
};

export const POLICY_WITH_BYPASS_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-policy-bypass",
  name: "Policy with Bypass Paths",
  description: "Policy with public endpoints that skip authentication",
  category: "policy",
  variables: [
    { name: "name", description: "Policy name", default: "api-policy" },
    { name: "bypass", description: "Paths to bypass", default: "/health,/metrics" },
  ],
  build: () =>
    buildAuthorizationPolicy({
      name: "api-policy",
      accessLists: [{ claim: "roles", values: ["user", "admin"] }],
      bypass: ["/health", "/metrics", "/public/*"],
    }),
  snippet: [
    "buildAuthorizationPolicy({",
    '  name: "${1:api-policy}",',
    "  accessLists: [",
    '    { claim: "roles", values: ["user", "admin"] },',
    "  ],",
    '  bypass: ["/health", "/metrics", "${2:/public/*}"],',
    "})",
  ],
};

// ============================================================================
// Route Templates
// ============================================================================

export const AUTH_PORTAL_ROUTE_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-route-portal",
  name: "Authentication Portal Route",
  description: "Route that serves the login portal",
  category: "route",
  variables: [
    { name: "host", description: "Portal hostname", default: "auth.example.com" },
    { name: "portalName", description: "Portal name", default: "myportal" },
  ],
  build: () =>
    buildAuthenticatorRoute({
      hosts: ["auth.example.com"],
      portalName: "myportal",
      routeId: "auth-portal",
    }),
  snippet: [
    "buildAuthenticatorRoute({",
    '  hosts: ["${1:auth.example.com}"],',
    '  portalName: "${2:myportal}",',
    '  routeId: "${3:auth-portal}",',
    "})",
  ],
};

export const PROTECTED_ROUTE_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-route-protected",
  name: "Protected Route",
  description: "Route with authentication required",
  category: "route",
  variables: [
    { name: "host", description: "Service hostname", default: "api.example.com" },
    { name: "path", description: "Protected path", default: "/api/*" },
    { name: "gatekeeperName", description: "Policy name", default: "mypolicy" },
    { name: "upstream", description: "Upstream address", default: "localhost:3000" },
  ],
  build: () =>
    buildProtectedRoute({
      hosts: ["api.example.com"],
      paths: ["/api/*"],
      gatekeeperName: "mypolicy",
      dial: "localhost:3000",
      routeId: "protected-api",
    }),
  snippet: [
    "buildProtectedRoute({",
    '  hosts: ["${1:api.example.com}"],',
    '  paths: ["${2:/api/*}"],',
    '  gatekeeperName: "${3:mypolicy}",',
    '  dial: "${4:localhost:3000}",',
    '  routeId: "${5:protected-api}",',
    "})",
  ],
};

// ============================================================================
// Full Setup Templates
// ============================================================================

export const FULL_LOCAL_AUTH_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-full-local",
  name: "Complete Local Authentication Setup",
  description: "Full setup with local users, portal, policy, and routes",
  category: "full-setup",
  variables: [
    { name: "usersPath", description: "Path to users file", default: "/etc/caddy/users.json" },
    { name: "authHost", description: "Auth portal hostname", default: "auth.example.com" },
    { name: "apiHost", description: "API hostname", default: "api.example.com" },
  ],
  build: () => {
    const store = buildLocalIdentityStore({ path: "/etc/caddy/users.json" });
    const portal = buildAuthenticationPortal({
      name: "portal",
      identityStores: ["local"],
      cookie: { domain: ".example.com", lifetime: "24h" },
    });
    const policy = buildAuthorizationPolicy({
      name: "policy",
      accessLists: [{ claim: "roles", values: ["user", "admin"] }],
      bypass: ["/health"],
    });
    return buildSecurityConfig({
      identityStores: [store],
      portals: [portal],
      policies: [policy],
    });
  },
  snippet: [
    "// Complete local authentication setup",
    "const store = buildLocalIdentityStore({",
    '  path: "${1:/etc/caddy/users.json}",',
    "});",
    "",
    "const portal = buildAuthenticationPortal({",
    '  name: "${2:portal}",',
    '  identityStores: ["local"],',
    "  cookie: {",
    '    domain: "${3:.example.com}",',
    '    lifetime: "24h",',
    "  },",
    "});",
    "",
    "const policy = buildAuthorizationPolicy({",
    '  name: "${4:policy}",',
    "  accessLists: [",
    '    { claim: "roles", values: ["user", "admin"] },',
    "  ],",
    '  bypass: ["/health"],',
    "});",
    "",
    "const config = buildSecurityConfig({",
    "  identityStores: [store],",
    "  portals: [portal],",
    "  policies: [policy],",
    "});",
  ],
};

export const FULL_OIDC_AUTH_TEMPLATE: SecurityTemplate = {
  id: "caddy-sec-full-oidc",
  name: "Complete OIDC Authentication Setup",
  description: "Full setup with Keycloak OIDC, portal, policy, and routes",
  category: "full-setup",
  variables: [
    { name: "clientId", description: "OIDC client ID", default: "my-app" },
    { name: "clientSecret", description: "OIDC client secret", default: "your-secret" },
    {
      name: "discoveryUrl",
      description: "OIDC discovery URL",
      default: "https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration",
    },
  ],
  build: () => {
    const provider = buildOidcProvider({
      provider: "keycloak",
      clientId: "my-app",
      clientSecret: "your-secret",
      discoveryUrl: "https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration",
    });
    const portal = buildAuthenticationPortal({
      name: "portal",
      identityProviders: ["keycloak"],
    });
    const policy = buildAuthorizationPolicy({
      name: "policy",
      accessLists: [{ claim: "roles", values: ["user"] }],
    });
    return buildSecurityConfig({
      identityProviders: [provider],
      portals: [portal],
      policies: [policy],
    });
  },
  snippet: [
    "// Complete OIDC authentication setup",
    "const provider = buildOidcProvider({",
    '  provider: "keycloak",',
    '  clientId: "${1:my-app}",',
    '  clientSecret: "${2:your-secret}",',
    '  discoveryUrl: "${3:https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration}",',
    "});",
    "",
    "const portal = buildAuthenticationPortal({",
    '  name: "${4:portal}",',
    '  identityProviders: ["keycloak"],',
    "});",
    "",
    "const policy = buildAuthorizationPolicy({",
    '  name: "${5:policy}",',
    "  accessLists: [",
    '    { claim: "roles", values: ["user"] },',
    "  ],",
    "});",
    "",
    "const config = buildSecurityConfig({",
    "  identityProviders: [provider],",
    "  portals: [portal],",
    "  policies: [policy],",
    "});",
  ],
};

// ============================================================================
// Template Registry
// ============================================================================

/**
 * All available security templates.
 * This is the SINGLE SOURCE OF TRUTH for snippets and tests.
 */
export const SECURITY_TEMPLATES: SecurityTemplate[] = [
  // Identity Stores
  LOCAL_IDENTITY_STORE_TEMPLATE,
  LDAP_IDENTITY_STORE_TEMPLATE,
  // Identity Providers
  OAUTH2_GITHUB_TEMPLATE,
  OAUTH2_GOOGLE_TEMPLATE,
  OIDC_KEYCLOAK_TEMPLATE,
  OIDC_OKTA_TEMPLATE,
  OIDC_AUTH0_TEMPLATE,
  // Portals
  BASIC_PORTAL_TEMPLATE,
  PORTAL_WITH_COOKIE_TEMPLATE,
  PORTAL_WITH_SSO_TEMPLATE,
  // Policies
  BASIC_POLICY_TEMPLATE,
  ADMIN_POLICY_TEMPLATE,
  POLICY_WITH_BYPASS_TEMPLATE,
  // Routes
  AUTH_PORTAL_ROUTE_TEMPLATE,
  PROTECTED_ROUTE_TEMPLATE,
  // Full Setups
  FULL_LOCAL_AUTH_TEMPLATE,
  FULL_OIDC_AUTH_TEMPLATE,
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: SecurityTemplate["category"]): SecurityTemplate[] {
  return SECURITY_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): SecurityTemplate | undefined {
  return SECURITY_TEMPLATES.find((t) => t.id === id);
}
