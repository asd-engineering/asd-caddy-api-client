/**
 * MitmproxyManager - High-level API for managing MITMproxy interception
 *
 * Provides simple enable/disable functionality for traffic inspection
 * with support for multiple services and multiple MITMproxy instances.
 */

import type { CaddyClient } from "../caddy/client.js";
import type { CaddyRoute } from "../types.js";
import { buildRewriteHandler, buildReverseProxyHandler } from "../caddy/routes.js";

/**
 * Configuration for a MITMproxy instance
 */
export interface MitmproxyInstance {
  /** MITMproxy host (e.g., "mitmproxy" or "localhost") */
  host: string;
  /** Proxy port for intercepting traffic (default: 8080) */
  port: number;
  /** Web UI port for viewing traffic (optional, e.g., 8081) */
  webPort?: number;
}

/**
 * Service registration for interception
 */
export interface ServiceRegistration {
  /** Unique identifier for this service */
  id: string;
  /** Caddy server name (e.g., "srv0", "https_server") */
  serverId: string;
  /** Path prefix to match (e.g., "/es", "/api") */
  pathPrefix: string;
  /** Backend service to forward to */
  backend: {
    host: string;
    port: number;
  };
  /** Optional: host pattern for host-based routing (e.g., "api.example.com") */
  host?: string;
}

/**
 * Status of a registered service
 */
export interface ServiceStatus {
  /** Whether interception is currently enabled */
  enabled: boolean;
  /** Which proxy instance is being used (null if disabled) */
  proxy: string | null;
  /** Service registration details */
  service: ServiceRegistration;
}

/**
 * Options for enabling interception
 */
export interface EnableOptions {
  /** Which proxy instance to use (default: "default") */
  proxy?: string;
}

/**
 * Internal state for a service
 */
interface ServiceState {
  registration: ServiceRegistration;
  enabled: boolean;
  activeProxy: string | null;
  routeId: string;
}

/**
 * MitmproxyManager - Simplified API for MITMproxy traffic interception
 *
 * @example
 * ```typescript
 * const manager = new MitmproxyManager(caddy, {
 *   default: { host: "mitmproxy", port: 8080, webPort: 8081 },
 *   debug: { host: "mitmproxy-debug", port: 8082, webPort: 8083 },
 * });
 *
 * // Register services
 * manager.register({
 *   id: "elasticsearch",
 *   serverId: "srv0",
 *   pathPrefix: "/es",
 *   backend: { host: "elasticsearch", port: 9200 },
 * });
 *
 * // Enable/disable interception
 * await manager.enable("elasticsearch");
 * await manager.disable("elasticsearch");
 *
 * // Check status
 * const status = manager.getStatus();
 * ```
 */
export class MitmproxyManager {
  private readonly caddy: CaddyClient;
  private readonly proxies: Record<string, MitmproxyInstance>;
  private readonly services: Map<string, ServiceState> = new Map();

  /**
   * Create a new MitmproxyManager
   * @param caddy - CaddyClient instance
   * @param proxies - Map of proxy names to MITMproxy instance configurations
   */
  constructor(caddy: CaddyClient, proxies: Record<string, MitmproxyInstance>) {
    this.caddy = caddy;
    this.proxies = proxies;

    // Validate at least one proxy is configured
    if (Object.keys(proxies).length === 0) {
      throw new Error("At least one MITMproxy instance must be configured");
    }

    // Ensure "default" exists or use first proxy as default
    if (!proxies.default) {
      const firstKey = Object.keys(proxies)[0];
      this.proxies.default = proxies[firstKey];
    }
  }

  /**
   * Register a service for potential interception
   * @param service - Service configuration
   */
  register(service: ServiceRegistration): void {
    const routeId = `mitm_${service.id}`;

    this.services.set(service.id, {
      registration: service,
      enabled: false,
      activeProxy: null,
      routeId,
    });
  }

  /**
   * Unregister a service
   * @param serviceId - Service ID to unregister
   * @returns true if service was found and unregistered
   */
  unregister(serviceId: string): boolean {
    return this.services.delete(serviceId);
  }

  /**
   * Get a registered service state
   * @param serviceId - Service ID
   * @returns Service state or undefined
   */
  private getService(serviceId: string): ServiceState | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get a proxy instance configuration
   * @param proxyName - Proxy name (default: "default")
   * @returns Proxy configuration
   */
  private getProxy(proxyName = "default"): MitmproxyInstance {
    const proxy = this.proxies[proxyName];
    if (!proxy) {
      throw new Error(
        `Unknown proxy: ${proxyName}. Available: ${Object.keys(this.proxies).join(", ")}`
      );
    }
    return proxy;
  }

  /**
   * Build a direct route for a service (no interception)
   */
  private buildDirectRoute(service: ServiceRegistration, routeId: string): CaddyRoute {
    const dial = `${service.backend.host}:${service.backend.port}`;

    if (service.host) {
      // Host-based routing
      return {
        "@id": routeId,
        match: [{ host: [service.host] }],
        handle: [buildReverseProxyHandler(dial)],
        terminal: true,
      };
    } else {
      // Path-based routing
      return {
        "@id": routeId,
        match: [{ path: [`${service.pathPrefix}/*`] }],
        handle: [buildRewriteHandler(service.pathPrefix), buildReverseProxyHandler(dial)],
        terminal: true,
      };
    }
  }

  /**
   * Build an intercepted route for a service (through MITMproxy)
   */
  private buildProxiedRoute(
    service: ServiceRegistration,
    proxy: MitmproxyInstance,
    routeId: string
  ): CaddyRoute {
    const dial = `${proxy.host}:${proxy.port}`;

    if (service.host) {
      // Host-based routing
      return {
        "@id": routeId,
        match: [{ host: [service.host] }],
        handle: [buildReverseProxyHandler(dial)],
        terminal: true,
      };
    } else {
      // Path-based routing
      return {
        "@id": routeId,
        match: [{ path: [`${service.pathPrefix}/*`] }],
        handle: [buildRewriteHandler(service.pathPrefix), buildReverseProxyHandler(dial)],
        terminal: true,
      };
    }
  }

  /**
   * Enable interception for a service
   * @param serviceId - Service ID to enable interception for
   * @param options - Enable options (proxy selection)
   */
  async enable(serviceId: string, options: EnableOptions = {}): Promise<void> {
    const service = this.getService(serviceId);
    if (!service) {
      throw new Error(`Service not registered: ${serviceId}`);
    }

    const proxyName = options.proxy ?? "default";
    const proxy = this.getProxy(proxyName);
    const { registration, routeId } = service;

    // Build the proxied route
    const proxiedRoute = this.buildProxiedRoute(registration, proxy, routeId);

    // Remove existing route if any, then add proxied route
    await this.caddy.removeRouteById(registration.serverId, routeId).catch(() => {
      // Route might not exist yet, that's fine
    });
    await this.caddy.addRoute(registration.serverId, proxiedRoute);

    // Update state
    service.enabled = true;
    service.activeProxy = proxyName;
  }

  /**
   * Disable interception for a service (restore direct routing)
   * @param serviceId - Service ID to disable interception for
   */
  async disable(serviceId: string): Promise<void> {
    const service = this.getService(serviceId);
    if (!service) {
      throw new Error(`Service not registered: ${serviceId}`);
    }

    const { registration, routeId } = service;

    // Build the direct route
    const directRoute = this.buildDirectRoute(registration, routeId);

    // Remove existing route if any, then add direct route
    await this.caddy.removeRouteById(registration.serverId, routeId).catch(() => {
      // Route might not exist yet, that's fine
    });
    await this.caddy.addRoute(registration.serverId, directRoute);

    // Update state
    service.enabled = false;
    service.activeProxy = null;
  }

  /**
   * Enable interception for all registered services
   * @param options - Enable options (proxy selection)
   */
  async enableAll(options: EnableOptions = {}): Promise<void> {
    const promises = Array.from(this.services.keys()).map((id) => this.enable(id, options));
    await Promise.all(promises);
  }

  /**
   * Disable interception for all registered services
   */
  async disableAll(): Promise<void> {
    const promises = Array.from(this.services.keys()).map((id) => this.disable(id));
    await Promise.all(promises);
  }

  /**
   * Check if interception is enabled for a service
   * @param serviceId - Service ID to check
   * @returns true if enabled
   */
  isEnabled(serviceId: string): boolean {
    const service = this.getService(serviceId);
    return service?.enabled ?? false;
  }

  /**
   * Get status of all registered services
   * @returns Map of service ID to status
   */
  getStatus(): Record<string, ServiceStatus> {
    const status: Record<string, ServiceStatus> = {};

    for (const [id, state] of this.services) {
      status[id] = {
        enabled: state.enabled,
        proxy: state.activeProxy,
        service: state.registration,
      };
    }

    return status;
  }

  /**
   * Get status of a specific service
   * @param serviceId - Service ID
   * @returns Service status or undefined
   */
  getServiceStatus(serviceId: string): ServiceStatus | undefined {
    const state = this.getService(serviceId);
    if (!state) return undefined;

    return {
      enabled: state.enabled,
      proxy: state.activeProxy,
      service: state.registration,
    };
  }

  /**
   * Get list of registered service IDs
   */
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get list of available proxy instances
   */
  getAvailableProxies(): string[] {
    return Object.keys(this.proxies);
  }

  /**
   * Get proxy instance configuration
   * @param proxyName - Proxy name
   */
  getProxyConfig(proxyName: string): MitmproxyInstance | undefined {
    return this.proxies[proxyName];
  }
}
