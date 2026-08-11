/**
 * Pure caddy-security config JSON generation for the Security Configuration
 * Wizard -- extracted from security-wizard.ts (0.10) so it can be
 * unit-tested directly (see src/__tests__/security-config-generator.test.ts
 * in the main package), same pattern as completion-data.ts. No `vscode`
 * import: the wizard's QuickPick/InputBox prompting stays in
 * security-wizard.ts and only calls this module once it has fully-populated
 * config objects.
 */

export interface IdentityStoreConfig {
  type: "local" | "ldap" | "oauth2" | "oidc";
  realm: string;
  // Local store
  path?: string;
  // LDAP store
  ldapServers?: Array<{ address: string; port: number }>;
  bindDn?: string;
  bindPassword?: string;
  searchBaseDn?: string;
  searchFilter?: string;
  // OAuth2/OIDC
  provider?: string;
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
}

export interface PortalConfig {
  name: string;
  identityStores: string[];
  cookieDomain?: string;
  cookieLifetime?: string;
}

export interface PolicyConfig {
  name: string;
  accessLists: Array<{
    action: "allow" | "deny";
    claim: string;
    values: string[];
  }>;
}

export interface SecurityConfig {
  identityStores: IdentityStoreConfig[];
  portals: PortalConfig[];
  policies: PolicyConfig[];
}

export function generateSecurityCode(config: SecurityConfig): string {
  const securityApp: Record<string, unknown> = {
    config: {
      identity_stores: config.identityStores.map(generateIdentityStoreConfig),
      authentication_portals: config.portals.map(generatePortalConfig),
      authorization_policies: config.policies.map(generatePolicyConfig),
    },
  };

  return JSON.stringify(securityApp, null, 2);
}

export function generateIdentityStoreConfig(store: IdentityStoreConfig): Record<string, unknown> {
  const base: Record<string, unknown> = {
    driver: store.type,
    realm: store.realm,
  };

  switch (store.type) {
    case "local":
      return { ...base, path: store.path };

    case "ldap":
      return {
        ...base,
        servers: store.ldapServers?.map((s) => ({ address: s.address, port: s.port })),
        bind_dn: store.bindDn,
        bind_password: store.bindPassword,
        search_base_dn: store.searchBaseDn,
        search_filter: store.searchFilter,
      };

    case "oauth2":
    case "oidc":
      return {
        ...base,
        provider: store.provider,
        client_id: store.clientId,
        client_secret: store.clientSecret,
        scopes: store.scopes,
      };
  }

  return base;
}

export function generatePortalConfig(portal: PortalConfig): Record<string, unknown> {
  const config: Record<string, unknown> = {
    name: portal.name,
    identity_stores: portal.identityStores,
  };

  if (portal.cookieDomain || portal.cookieLifetime) {
    config.cookie = {};
    if (portal.cookieDomain) {
      (config.cookie as Record<string, unknown>).domain = portal.cookieDomain;
    }
    if (portal.cookieLifetime) {
      (config.cookie as Record<string, unknown>).lifetime = portal.cookieLifetime;
    }
  }

  return config;
}

export function generatePolicyConfig(policy: PolicyConfig): Record<string, unknown> {
  return {
    name: policy.name,
    access_lists: policy.accessLists.map((rule) => ({
      action: rule.action,
      claim: rule.claim,
      values: rule.values,
    })),
  };
}
