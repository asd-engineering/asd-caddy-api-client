/**
 * Shared test utilities for caddy-security integration tests
 *
 * These utilities implement an ADDITIVE config strategy:
 * - Tests ADD new identity stores/portals/policies alongside existing ones
 * - Tests CREATE new dynamic routes that reference these additions
 * - Tests CLEAN UP only what they added (routes + additions to security config)
 *
 * This approach avoids the route conflict problem where static Caddyfile routes
 * reference portals/policies that get deleted when tests replace the entire
 * security configuration.
 */
import type { CaddyClient } from "../../../caddy/client.js";

// Types for security config items
export interface IdentityStore {
  name: string;
  kind: string;
  params: Record<string, unknown>;
}

export interface AuthenticationPortal {
  name: string;
  identity_stores?: string[];
  identity_providers?: string[];
  [key: string]: unknown;
}

export interface AuthorizationPolicy {
  name: string;
  access_lists?: unknown[];
  [key: string]: unknown;
}

export interface IdentityProvider {
  name: string;
  kind: string;
  params: Record<string, unknown>;
}

export interface SecurityConfig {
  identity_stores?: IdentityStore[];
  identity_providers?: IdentityProvider[];
  authentication_portals?: AuthenticationPortal[];
  authorization_policies?: AuthorizationPolicy[];
}

export interface TestAdditions {
  identityStores?: IdentityStore[];
  identityProviders?: IdentityProvider[];
  portals?: AuthenticationPortal[];
  policies?: AuthorizationPolicy[];
  routeIds?: string[];
}

/**
 * Get the current security config from Caddy
 */
export async function getSecurityConfig(client: CaddyClient): Promise<SecurityConfig | null> {
  try {
    const response = await client.request("/config/apps/security/config");
    return (await response.json()) as SecurityConfig;
  } catch {
    return null;
  }
}

/**
 * Add identity stores to the existing security config
 * Uses POST to append to the identity_stores array
 */
export async function addIdentityStores(
  client: CaddyClient,
  stores: IdentityStore[]
): Promise<void> {
  for (const store of stores) {
    try {
      await client.request("/config/apps/security/config/identity_stores", {
        method: "POST",
        body: JSON.stringify(store),
      });
    } catch (error) {
      // Log but continue - store might already exist
      console.warn(`Failed to add identity store ${store.name}:`, error);
    }
  }
}

/**
 * Add identity providers to the existing security config
 * Uses GET-modify-PUT pattern because the identity_providers array may not exist initially
 */
export async function addIdentityProviders(
  client: CaddyClient,
  providers: IdentityProvider[]
): Promise<void> {
  for (const provider of providers) {
    try {
      // Get current config to check if identity_providers exists
      const config = await getSecurityConfig(client);
      const currentProviders = config?.identity_providers ?? [];

      // Check if provider already exists
      if (currentProviders.some((p) => p.name === provider.name)) {
        continue;
      }

      // Add the new provider to the array
      const updatedProviders = [...currentProviders, provider];

      // PUT the entire array back
      await client.request("/config/apps/security/config/identity_providers", {
        method: "PUT",
        body: JSON.stringify(updatedProviders),
      });
    } catch (error) {
      // Log but continue - provider might already exist
      console.warn(`Failed to add identity provider ${provider.name}:`, error);
    }
  }
}

/**
 * Add authentication portals to the existing security config
 * Uses POST to append to the authentication_portals array
 */
export async function addAuthenticationPortals(
  client: CaddyClient,
  portals: AuthenticationPortal[]
): Promise<void> {
  for (const portal of portals) {
    try {
      await client.request("/config/apps/security/config/authentication_portals", {
        method: "POST",
        body: JSON.stringify(portal),
      });
    } catch (error) {
      // Log but continue - portal might already exist
      console.warn(`Failed to add authentication portal ${portal.name}:`, error);
    }
  }
}

/**
 * Add authorization policies to the existing security config
 * Uses POST to append to the authorization_policies array
 */
export async function addAuthorizationPolicies(
  client: CaddyClient,
  policies: AuthorizationPolicy[]
): Promise<void> {
  for (const policy of policies) {
    try {
      await client.request("/config/apps/security/config/authorization_policies", {
        method: "POST",
        body: JSON.stringify(policy),
      });
    } catch (error) {
      // Log but continue - policy might already exist
      console.warn(`Failed to add authorization policy ${policy.name}:`, error);
    }
  }
}

/**
 * Remove an identity store by name
 */
async function removeIdentityStore(client: CaddyClient, name: string): Promise<boolean> {
  const config = await getSecurityConfig(client);
  if (!config?.identity_stores) return false;

  const index = config.identity_stores.findIndex((store) => store.name === name);
  if (index === -1) return false;

  try {
    await client.request(`/config/apps/security/config/identity_stores/${index}`, {
      method: "DELETE",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove an identity provider by name
 */
async function removeIdentityProvider(client: CaddyClient, name: string): Promise<boolean> {
  const config = await getSecurityConfig(client);
  if (!config?.identity_providers) return false;

  const index = config.identity_providers.findIndex((provider) => provider.name === name);
  if (index === -1) return false;

  try {
    await client.request(`/config/apps/security/config/identity_providers/${index}`, {
      method: "DELETE",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove an authentication portal by name
 */
async function removeAuthenticationPortal(client: CaddyClient, name: string): Promise<boolean> {
  const config = await getSecurityConfig(client);
  if (!config?.authentication_portals) return false;

  const index = config.authentication_portals.findIndex((portal) => portal.name === name);
  if (index === -1) return false;

  try {
    await client.request(`/config/apps/security/config/authentication_portals/${index}`, {
      method: "DELETE",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove an authorization policy by name
 */
async function removeAuthorizationPolicy(client: CaddyClient, name: string): Promise<boolean> {
  const config = await getSecurityConfig(client);
  if (!config?.authorization_policies) return false;

  const index = config.authorization_policies.findIndex((policy) => policy.name === name);
  if (index === -1) return false;

  try {
    await client.request(`/config/apps/security/config/authorization_policies/${index}`, {
      method: "DELETE",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Add all security config additions (identity stores, portals, policies, providers)
 * This is a convenience function that adds all items at once.
 */
export async function addSecurityConfig(
  client: CaddyClient,
  additions: Omit<TestAdditions, "routeIds">
): Promise<void> {
  // Add in order: stores/providers first, then portals (which reference stores),
  // then policies (which reference portals)
  if (additions.identityStores?.length) {
    await addIdentityStores(client, additions.identityStores);
  }
  if (additions.identityProviders?.length) {
    await addIdentityProviders(client, additions.identityProviders);
  }
  if (additions.portals?.length) {
    await addAuthenticationPortals(client, additions.portals);
  }
  if (additions.policies?.length) {
    await addAuthorizationPolicies(client, additions.policies);
  }
}

/**
 * Remove all test additions (routes and security config items)
 * This cleans up only what the test added, leaving the original config intact.
 *
 * IMPORTANT: Call this in afterAll/afterEach to ensure cleanup even if tests fail.
 * Uses try/catch for each removal to ensure partial cleanup on errors.
 */
export async function removeTestAdditions(
  client: CaddyClient,
  serverName: string,
  additions: TestAdditions
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;

  // Remove routes first (they reference policies/portals)
  if (additions.routeIds?.length) {
    for (const routeId of additions.routeIds) {
      try {
        const success = await client.removeRouteById(serverName, routeId);
        if (success) removed++;
        else failed++;
      } catch (error) {
        console.warn(`Failed to remove route ${routeId}:`, error);
        failed++;
      }
    }
  }

  // Remove policies (they reference portals)
  if (additions.policies?.length) {
    for (const policy of additions.policies) {
      try {
        const success = await removeAuthorizationPolicy(client, policy.name);
        if (success) removed++;
        else failed++;
      } catch (error) {
        console.warn(`Failed to remove policy ${policy.name}:`, error);
        failed++;
      }
    }
  }

  // Remove portals (they reference identity stores/providers)
  if (additions.portals?.length) {
    for (const portal of additions.portals) {
      try {
        const success = await removeAuthenticationPortal(client, portal.name);
        if (success) removed++;
        else failed++;
      } catch (error) {
        console.warn(`Failed to remove portal ${portal.name}:`, error);
        failed++;
      }
    }
  }

  // Remove identity providers
  if (additions.identityProviders?.length) {
    for (const provider of additions.identityProviders) {
      try {
        const success = await removeIdentityProvider(client, provider.name);
        if (success) removed++;
        else failed++;
      } catch (error) {
        console.warn(`Failed to remove provider ${provider.name}:`, error);
        failed++;
      }
    }
  }

  // Remove identity stores last
  if (additions.identityStores?.length) {
    for (const store of additions.identityStores) {
      try {
        const success = await removeIdentityStore(client, store.name);
        if (success) removed++;
        else failed++;
      } catch (error) {
        console.warn(`Failed to remove store ${store.name}:`, error);
        failed++;
      }
    }
  }

  return { removed, failed };
}

/**
 * Get the first server name from the Caddy config
 * Utility for tests that need to add routes
 */
export async function getServerName(client: CaddyClient): Promise<string | null> {
  try {
    const config = await client.getConfig();
    const servers = (config as { apps?: { http?: { servers?: Record<string, unknown> } } }).apps
      ?.http?.servers;
    if (!servers) return null;
    const serverNames = Object.keys(servers);
    return serverNames.length > 0 ? serverNames[0] : null;
  } catch {
    return null;
  }
}

/**
 * Wait for a condition to be true with timeout
 * Useful for waiting for Caddy to reload config
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      if (await condition()) return true;
    } catch {
      // Ignore errors, keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
