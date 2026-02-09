/**
 * Security Configuration Wizard
 *
 * Interactive wizard for creating caddy-security configurations
 * including identity stores, authentication portals, and authorization policies.
 */

import * as vscode from "vscode";

interface IdentityStoreConfig {
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

interface PortalConfig {
  name: string;
  identityStores: string[];
  cookieDomain?: string;
  cookieLifetime?: string;
}

interface PolicyConfig {
  name: string;
  accessLists: Array<{
    action: "allow" | "deny";
    claim: string;
    values: string[];
  }>;
}

interface SecurityConfig {
  identityStores: IdentityStoreConfig[];
  portals: PortalConfig[];
  policies: PolicyConfig[];
}

/**
 * Multi-step security configuration wizard
 */
export async function runSecurityWizard(): Promise<void> {
  const config: SecurityConfig = {
    identityStores: [],
    portals: [],
    policies: [],
  };

  // Welcome message
  const startChoice = await vscode.window.showQuickPick(
    [
      {
        label: "Quick Setup",
        description: "Create a basic local authentication setup",
        value: "quick",
      },
      {
        label: "Custom Setup",
        description: "Configure each component step by step",
        value: "custom",
      },
    ],
    {
      title: "Security Configuration Wizard",
      placeHolder: "How would you like to set up authentication?",
    }
  );

  if (!startChoice) return;

  if (startChoice.value === "quick") {
    await quickSetup(config);
  } else {
    await customSetup(config);
  }

  // Generate and insert the code
  const code = generateSecurityCode(config);
  await insertCode(code);
}

async function quickSetup(config: SecurityConfig): Promise<void> {
  // Quick setup creates a local store, portal, and basic policy

  // Get portal name
  const portalName = await vscode.window.showInputBox({
    title: "Portal Name",
    prompt: "Enter a name for your authentication portal",
    value: "myportal",
    validateInput: (value) => {
      if (!value.trim()) return "Portal name is required";
      if (!/^[a-z][a-z0-9-]*$/.test(value)) return "Use lowercase letters, numbers, and hyphens";
      return undefined;
    },
  });
  if (!portalName) return;

  // Get cookie domain
  const cookieDomain = await vscode.window.showInputBox({
    title: "Cookie Domain",
    prompt: "Enter the cookie domain (e.g., .example.com for all subdomains)",
    placeHolder: ".example.com",
  });
  if (cookieDomain === undefined) return;

  // Get users file path
  const usersPath = await vscode.window.showInputBox({
    title: "Users File Path",
    prompt: "Where should user credentials be stored?",
    value: "/etc/caddy/users.json",
    validateInput: (value) => {
      if (!value.trim()) return "Path is required";
      if (!value.startsWith("/")) return "Path must be absolute";
      return undefined;
    },
  });
  if (!usersPath) return;

  // Create local identity store
  config.identityStores.push({
    type: "local",
    realm: "local",
    path: usersPath,
  });

  // Create portal
  config.portals.push({
    name: portalName,
    identityStores: ["local"],
    cookieDomain: cookieDomain || undefined,
    cookieLifetime: "24h",
  });

  // Create basic policy
  config.policies.push({
    name: `${portalName}-policy`,
    accessLists: [
      {
        action: "allow",
        claim: "roles",
        values: ["user", "admin"],
      },
    ],
  });
}

async function customSetup(config: SecurityConfig): Promise<void> {
  let addMore = true;

  // Step 1: Identity Stores
  vscode.window.showInformationMessage("Step 1: Configure Identity Stores");

  while (addMore) {
    const store = await configureIdentityStore();
    if (store) {
      config.identityStores.push(store);
    }

    const addAnother = await vscode.window.showQuickPick(
      [
        { label: "Add Another Identity Store", value: true },
        { label: "Continue to Portals", value: false },
      ],
      { placeHolder: "Add more identity stores?" }
    );

    addMore = addAnother?.value ?? false;
  }

  if (config.identityStores.length === 0) {
    vscode.window.showWarningMessage("No identity stores configured");
    return;
  }

  // Step 2: Authentication Portal
  vscode.window.showInformationMessage("Step 2: Configure Authentication Portal");

  const portal = await configurePortal(config.identityStores.map((s) => s.realm));
  if (portal) {
    config.portals.push(portal);
  }

  // Step 3: Authorization Policy
  vscode.window.showInformationMessage("Step 3: Configure Authorization Policy");

  addMore = true;
  while (addMore) {
    const policy = await configurePolicy();
    if (policy) {
      config.policies.push(policy);
    }

    const addAnother = await vscode.window.showQuickPick(
      [
        { label: "Add Another Policy", value: true },
        { label: "Finish", value: false },
      ],
      { placeHolder: "Add more policies?" }
    );

    addMore = addAnother?.value ?? false;
  }
}

async function configureIdentityStore(): Promise<IdentityStoreConfig | undefined> {
  const storeType = await vscode.window.showQuickPick(
    [
      {
        label: "Local (JSON file)",
        description: "Store users in a local JSON file",
        value: "local" as const,
      },
      {
        label: "LDAP",
        description: "Connect to an LDAP/Active Directory server",
        value: "ldap" as const,
      },
      {
        label: "OAuth2",
        description: "Use an OAuth2 provider (GitHub, Google, etc.)",
        value: "oauth2" as const,
      },
      { label: "OIDC", description: "Use an OpenID Connect provider", value: "oidc" as const },
    ],
    {
      title: "Identity Store Type",
      placeHolder: "Select the type of identity store",
    }
  );

  if (!storeType) return undefined;

  const realm = await vscode.window.showInputBox({
    title: "Realm Name",
    prompt: "Enter a unique realm name for this identity store",
    value: storeType.value,
    validateInput: (value) => {
      if (!value.trim()) return "Realm is required";
      return undefined;
    },
  });
  if (!realm) return undefined;

  const baseConfig: IdentityStoreConfig = {
    type: storeType.value,
    realm,
  };

  switch (storeType.value) {
    case "local":
      return configureLocalStore(baseConfig);
    case "ldap":
      return configureLdapStore(baseConfig);
    case "oauth2":
    case "oidc":
      return configureOAuthStore(baseConfig);
  }
}

async function configureLocalStore(
  config: IdentityStoreConfig
): Promise<IdentityStoreConfig | undefined> {
  const path = await vscode.window.showInputBox({
    title: "Users File Path",
    prompt: "Path to the JSON file storing user credentials",
    value: "/etc/caddy/users.json",
  });
  if (!path) return undefined;

  return { ...config, path };
}

async function configureLdapStore(
  config: IdentityStoreConfig
): Promise<IdentityStoreConfig | undefined> {
  const serverAddress = await vscode.window.showInputBox({
    title: "LDAP Server",
    prompt: "LDAP server hostname",
    placeHolder: "ldap.example.com",
  });
  if (!serverAddress) return undefined;

  const serverPort = await vscode.window.showInputBox({
    title: "LDAP Port",
    prompt: "LDAP server port (389 for LDAP, 636 for LDAPS)",
    value: "389",
  });
  if (!serverPort) return undefined;

  const bindDn = await vscode.window.showInputBox({
    title: "Bind DN",
    prompt: "Distinguished name for binding to LDAP",
    placeHolder: "cn=admin,dc=example,dc=com",
  });
  if (!bindDn) return undefined;

  const bindPassword = await vscode.window.showInputBox({
    title: "Bind Password",
    prompt: "Password for the bind DN",
    password: true,
  });
  if (!bindPassword) return undefined;

  const searchBaseDn = await vscode.window.showInputBox({
    title: "Search Base DN",
    prompt: "Base DN for user searches",
    placeHolder: "ou=users,dc=example,dc=com",
  });
  if (!searchBaseDn) return undefined;

  return {
    ...config,
    ldapServers: [{ address: serverAddress, port: parseInt(serverPort, 10) }],
    bindDn,
    bindPassword,
    searchBaseDn,
    searchFilter: "(uid={username})",
  };
}

async function configureOAuthStore(
  config: IdentityStoreConfig
): Promise<IdentityStoreConfig | undefined> {
  const provider = await vscode.window.showQuickPick(
    [
      { label: "GitHub", value: "github" },
      { label: "Google", value: "google" },
      { label: "Microsoft", value: "microsoft" },
      { label: "Custom", value: "custom" },
    ],
    {
      title: "OAuth Provider",
      placeHolder: "Select the OAuth/OIDC provider",
    }
  );
  if (!provider) return undefined;

  const clientId = await vscode.window.showInputBox({
    title: "Client ID",
    prompt: "OAuth client ID from your provider",
    placeHolder: "your-client-id",
  });
  if (!clientId) return undefined;

  const clientSecret = await vscode.window.showInputBox({
    title: "Client Secret",
    prompt: "OAuth client secret (will be stored in config)",
    password: true,
  });
  if (!clientSecret) return undefined;

  return {
    ...config,
    provider: provider.value,
    clientId,
    clientSecret,
    scopes: ["openid", "email", "profile"],
  };
}

async function configurePortal(availableStores: string[]): Promise<PortalConfig | undefined> {
  const name = await vscode.window.showInputBox({
    title: "Portal Name",
    prompt: "Enter a unique name for this authentication portal",
    value: "myportal",
  });
  if (!name) return undefined;

  const selectedStores = await vscode.window.showQuickPick(
    availableStores.map((s) => ({ label: s, picked: true })),
    {
      title: "Identity Stores",
      placeHolder: "Select identity stores to use with this portal",
      canPickMany: true,
    }
  );
  if (!selectedStores || selectedStores.length === 0) return undefined;

  const cookieDomain = await vscode.window.showInputBox({
    title: "Cookie Domain",
    prompt: "Cookie domain (optional, e.g., .example.com)",
  });

  const cookieLifetime = await vscode.window.showQuickPick(
    [
      { label: "1 hour", value: "1h" },
      { label: "8 hours", value: "8h" },
      { label: "24 hours", value: "24h" },
      { label: "7 days", value: "168h" },
      { label: "30 days", value: "720h" },
    ],
    {
      title: "Session Lifetime",
      placeHolder: "How long should sessions last?",
    }
  );

  return {
    name,
    identityStores: selectedStores.map((s) => s.label),
    cookieDomain: cookieDomain || undefined,
    cookieLifetime: cookieLifetime?.value || "24h",
  };
}

async function configurePolicy(): Promise<PolicyConfig | undefined> {
  const name = await vscode.window.showInputBox({
    title: "Policy Name",
    prompt: "Enter a unique name for this authorization policy",
    value: "my-policy",
  });
  if (!name) return undefined;

  const accessLists: PolicyConfig["accessLists"] = [];

  let addMoreRules = true;
  while (addMoreRules) {
    const action = await vscode.window.showQuickPick(
      [
        { label: "Allow", value: "allow" as const },
        { label: "Deny", value: "deny" as const },
      ],
      {
        title: "Access Rule Action",
        placeHolder: "Should this rule allow or deny access?",
      }
    );
    if (!action) break;

    const claim = await vscode.window.showInputBox({
      title: "Claim Name",
      prompt: "JWT claim to check (e.g., roles, email, groups)",
      value: "roles",
    });
    if (!claim) break;

    const values = await vscode.window.showInputBox({
      title: "Claim Values",
      prompt: "Comma-separated list of values to match",
      placeHolder: "user, admin, editor",
    });
    if (!values) break;

    accessLists.push({
      action: action.value,
      claim,
      values: values
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    });

    const addAnother = await vscode.window.showQuickPick(
      [
        { label: "Add Another Rule", value: true },
        { label: "Done with Rules", value: false },
      ],
      { placeHolder: "Add more access rules?" }
    );

    addMoreRules = addAnother?.value ?? false;
  }

  if (accessLists.length === 0) {
    // Default allow rule
    accessLists.push({
      action: "allow",
      claim: "roles",
      values: ["user"],
    });
  }

  return { name, accessLists };
}

function generateSecurityCode(config: SecurityConfig): string {
  const securityApp: Record<string, unknown> = {
    config: {
      identity_stores: config.identityStores.map(generateIdentityStoreConfig),
      authentication_portals: config.portals.map(generatePortalConfig),
      authorization_policies: config.policies.map(generatePolicyConfig),
    },
  };

  return JSON.stringify(securityApp, null, 2);
}

function generateIdentityStoreConfig(store: IdentityStoreConfig): Record<string, unknown> {
  const base: Record<string, unknown> = {
    driver: store.type === "oauth2" || store.type === "oidc" ? store.type : store.type,
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
        driver: store.type,
        provider: store.provider,
        client_id: store.clientId,
        client_secret: store.clientSecret,
        scopes: store.scopes,
      };
  }

  return base;
}

function generatePortalConfig(portal: PortalConfig): Record<string, unknown> {
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

function generatePolicyConfig(policy: PolicyConfig): Record<string, unknown> {
  return {
    name: policy.name,
    access_lists: policy.accessLists.map((rule) => ({
      action: rule.action,
      claim: rule.claim,
      values: rule.values,
    })),
  };
}

async function insertCode(code: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    const position = editor.selection.active;
    await editor.edit((editBuilder) => {
      editBuilder.insert(position, code);
    });
    await vscode.commands.executeCommand("editor.action.formatDocument");
    vscode.window.showInformationMessage("Security configuration inserted!");
  } else {
    const doc = await vscode.workspace.openTextDocument({
      content: code,
      language: "json",
    });
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage("Security configuration created in new document");
  }
}
