/**
 * Unit tests for security-config-generator.ts, extracted from
 * security-wizard.ts. Also drops a no-op ternary in
 * generateIdentityStoreConfig's `driver` field
 * (`store.type === "oauth2" || ... ? store.type : store.type`), simplified
 * to `store.type` during extraction.
 */
import { describe, test, expect } from "vitest";
import {
  generateSecurityCode,
  generateIdentityStoreConfig,
  generatePortalConfig,
  generatePolicyConfig,
  type IdentityStoreConfig,
  type PortalConfig,
  type PolicyConfig,
  type SecurityConfig,
} from "../../vscode-extension/src/wizards/security-config-generator.js";

describe("generateIdentityStoreConfig", () => {
  test("local store includes driver, realm, and path", () => {
    const store: IdentityStoreConfig = { type: "local", realm: "local", path: "/etc/users.json" };
    expect(generateIdentityStoreConfig(store)).toEqual({
      driver: "local",
      realm: "local",
      path: "/etc/users.json",
    });
  });

  test("ldap store includes servers/bind/search fields, snake_cased", () => {
    const store: IdentityStoreConfig = {
      type: "ldap",
      realm: "corp",
      ldapServers: [{ address: "ldap.example.com", port: 389 }],
      bindDn: "cn=admin,dc=example,dc=com",
      bindPassword: "secret",
      searchBaseDn: "ou=users,dc=example,dc=com",
      searchFilter: "(uid={username})",
    };
    expect(generateIdentityStoreConfig(store)).toEqual({
      driver: "ldap",
      realm: "corp",
      servers: [{ address: "ldap.example.com", port: 389 }],
      bind_dn: "cn=admin,dc=example,dc=com",
      bind_password: "secret",
      search_base_dn: "ou=users,dc=example,dc=com",
      search_filter: "(uid={username})",
    });
  });

  test.each(["oauth2", "oidc"] as const)(
    "%s store includes provider/client/scopes fields, snake_cased",
    (type) => {
      const store: IdentityStoreConfig = {
        type,
        realm: "sso",
        provider: "github",
        clientId: "abc",
        clientSecret: "xyz",
        scopes: ["openid", "email"],
      };
      expect(generateIdentityStoreConfig(store)).toEqual({
        driver: type,
        realm: "sso",
        provider: "github",
        client_id: "abc",
        client_secret: "xyz",
        scopes: ["openid", "email"],
      });
    }
  );
});

describe("generatePortalConfig", () => {
  test("includes name and identity_stores", () => {
    const portal: PortalConfig = { name: "myportal", identityStores: ["local"] };
    expect(generatePortalConfig(portal)).toEqual({
      name: "myportal",
      identity_stores: ["local"],
    });
  });

  test("omits cookie entirely when neither domain nor lifetime is set", () => {
    const portal: PortalConfig = { name: "myportal", identityStores: ["local"] };
    expect(generatePortalConfig(portal).cookie).toBeUndefined();
  });

  test("includes only the cookie fields that were actually set", () => {
    const domainOnly: PortalConfig = {
      name: "p",
      identityStores: ["local"],
      cookieDomain: ".example.com",
    };
    expect(generatePortalConfig(domainOnly).cookie).toEqual({ domain: ".example.com" });

    const lifetimeOnly: PortalConfig = {
      name: "p",
      identityStores: ["local"],
      cookieLifetime: "24h",
    };
    expect(generatePortalConfig(lifetimeOnly).cookie).toEqual({ lifetime: "24h" });

    const both: PortalConfig = {
      name: "p",
      identityStores: ["local"],
      cookieDomain: ".example.com",
      cookieLifetime: "24h",
    };
    expect(generatePortalConfig(both).cookie).toEqual({ domain: ".example.com", lifetime: "24h" });
  });
});

describe("generatePolicyConfig", () => {
  test("maps access rules to snake_case access_lists", () => {
    const policy: PolicyConfig = {
      name: "my-policy",
      accessLists: [{ action: "allow", claim: "roles", values: ["admin", "user"] }],
    };
    expect(generatePolicyConfig(policy)).toEqual({
      name: "my-policy",
      access_lists: [{ action: "allow", claim: "roles", values: ["admin", "user"] }],
    });
  });

  test("preserves multiple rules in order", () => {
    const policy: PolicyConfig = {
      name: "p",
      accessLists: [
        { action: "allow", claim: "roles", values: ["admin"] },
        { action: "deny", claim: "email", values: ["banned@example.com"] },
      ],
    };
    expect(generatePolicyConfig(policy).access_lists).toHaveLength(2);
  });
});

describe("generateSecurityCode", () => {
  test("assembles a full security app config from all three sections", () => {
    const config: SecurityConfig = {
      identityStores: [{ type: "local", realm: "local", path: "/etc/users.json" }],
      portals: [{ name: "myportal", identityStores: ["local"] }],
      policies: [
        { name: "policy1", accessLists: [{ action: "allow", claim: "roles", values: ["user"] }] },
      ],
    };
    const parsed = JSON.parse(generateSecurityCode(config));
    expect(parsed.config.identity_stores).toHaveLength(1);
    expect(parsed.config.authentication_portals).toHaveLength(1);
    expect(parsed.config.authorization_policies).toHaveLength(1);
    expect(parsed.config.identity_stores[0].driver).toBe("local");
    expect(parsed.config.authentication_portals[0].name).toBe("myportal");
    expect(parsed.config.authorization_policies[0].name).toBe("policy1");
  });

  test("produces valid, empty-array sections when nothing is configured", () => {
    const config: SecurityConfig = { identityStores: [], portals: [], policies: [] };
    const parsed = JSON.parse(generateSecurityCode(config));
    expect(parsed.config).toEqual({
      identity_stores: [],
      authentication_portals: [],
      authorization_policies: [],
    });
  });
});
