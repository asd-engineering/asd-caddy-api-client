/**
 * Domain management with TLS automation
 */
import type {
  AddDomainWithAutoTlsOptions,
  AddDomainWithTlsOptions,
  UpdateDomainOptions,
  DeleteDomainOptions,
  DomainConfig,
  Domain,
} from "../types.js";
import {
  AddDomainWithAutoTlsOptionsSchema,
  AddDomainWithTlsOptionsSchema,
  UpdateDomainOptionsSchema,
  DeleteDomainOptionsSchema,
} from "../schemas.js";
import { CaddyClient } from "./client.js";
import { DomainNotFoundError, DomainAlreadyExistsError } from "../errors.js";

/**
 * Add a domain with automatic TLS (Let's Encrypt)
 * @param options - Domain configuration
 * @returns Domain configuration
 */
export async function addDomainWithAutoTls(
  options: AddDomainWithAutoTlsOptions
): Promise<DomainConfig> {
  const validated = AddDomainWithAutoTlsOptionsSchema.parse(options);
  const client = new CaddyClient({ adminUrl: validated.adminUrl });

  // Check if domain already exists
  const existing = await getDomainConfig(validated.domain, validated.adminUrl);
  if (existing) {
    throw new DomainAlreadyExistsError(validated.domain);
  }

  // Build server configuration for the domain
  const serverConfig = {
    [validated.domain]: {
      listen: [":443"],
      routes: [
        {
          handle: [
            ...(validated.enableSecurityHeaders
              ? [
                  {
                    handler: "headers",
                    response: {
                      set: {
                        "X-Frame-Options": [validated.frameOptions ?? "DENY"],
                        "X-Content-Type-Options": ["nosniff"],
                        ...(validated.enableHsts
                          ? {
                              "Strict-Transport-Security": [
                                `max-age=${validated.hstsMaxAge}; includeSubDomains`,
                              ],
                            }
                          : {}),
                      },
                    },
                  },
                ]
              : []),
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: `${validated.target}:${validated.targetPort}` }],
            },
          ],
        },
      ],
      automatic_https: {
        disable: false,
      },
    },
  };

  // Add TLS automation policy
  const tlsConfig = await client.getConfig();
  const config = tlsConfig as {
    apps?: {
      tls?: {
        automation?: {
          policies?: {
            subjects?: string[];
            issuers?: { module: string; email?: string }[];
          }[];
        };
      };
    };
  };

  config.apps ??= {};
  config.apps.tls ??= {};
  config.apps.tls.automation ??= { policies: [] };
  config.apps.tls.automation.policies ??= [];

  config.apps.tls.automation.policies.push({
    subjects: [validated.domain],
    issuers: [
      {
        module: "acme",
      },
    ],
  });

  // Apply server configuration
  await client.patchServer(serverConfig);

  // Return domain config
  return {
    domain: validated.domain,
    target: validated.target,
    targetPort: validated.targetPort,
    tlsEnabled: true,
    autoTls: true,
    securityHeaders: {
      enableHsts: validated.enableHsts ?? false,
      hstsMaxAge: validated.hstsMaxAge ?? 31536000,
      frameOptions: validated.frameOptions ?? "DENY",
      enableCompression: validated.enableCompression ?? true,
    },
    redirectMode: validated.redirectMode ?? "none",
  };
}

/**
 * Add a domain with custom TLS certificate
 * @param options - Domain configuration with cert files
 * @returns Domain configuration
 */
export async function addDomainWithTls(options: AddDomainWithTlsOptions): Promise<DomainConfig> {
  const validated = AddDomainWithTlsOptionsSchema.parse(options);
  const client = new CaddyClient({ adminUrl: validated.adminUrl });

  // Check if domain already exists
  const existing = await getDomainConfig(validated.domain, validated.adminUrl);
  if (existing) {
    throw new DomainAlreadyExistsError(validated.domain);
  }

  // Build server configuration
  const serverConfig = {
    [validated.domain]: {
      listen: [":443"],
      routes: [
        {
          handle: [
            ...(validated.enableSecurityHeaders
              ? [
                  {
                    handler: "headers",
                    response: {
                      set: {
                        "X-Frame-Options": [validated.frameOptions ?? "DENY"],
                        "X-Content-Type-Options": ["nosniff"],
                        ...(validated.enableHsts
                          ? {
                              "Strict-Transport-Security": [
                                `max-age=${validated.hstsMaxAge}; includeSubDomains`,
                              ],
                            }
                          : {}),
                      },
                    },
                  },
                ]
              : []),
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: `${validated.target}:${validated.targetPort}` }],
            },
          ],
        },
      ],
      tls_connection_policies: [
        {
          certificate_selection: {
            any_tag: ["manual"],
          },
        },
      ],
    },
  };

  // Add certificate
  const tlsConfig = await client.getConfig();
  const config = tlsConfig as {
    apps?: {
      tls?: {
        certificates?: {
          load_files?: {
            certificate: string;
            key: string;
            tags?: string[];
          }[];
        };
      };
    };
  };

  config.apps ??= {};
  config.apps.tls ??= {};
  config.apps.tls.certificates ??= { load_files: [] };
  config.apps.tls.certificates.load_files ??= [];

  config.apps.tls.certificates.load_files.push({
    certificate: validated.certFile,
    key: validated.keyFile,
    tags: ["manual"],
  });

  // Apply configuration
  await client.patchServer(serverConfig);

  // Return domain config
  return {
    domain: validated.domain,
    target: validated.target,
    targetPort: validated.targetPort,
    tlsEnabled: true,
    autoTls: false,
    certFile: validated.certFile,
    keyFile: validated.keyFile,
    securityHeaders: {
      enableHsts: validated.enableHsts ?? false,
      hstsMaxAge: validated.hstsMaxAge ?? 31536000,
      frameOptions: validated.frameOptions ?? "DENY",
      enableCompression: validated.enableCompression ?? true,
    },
    redirectMode: validated.redirectMode ?? "none",
  };
}

/**
 * Update an existing domain
 * @param options - Update options
 * @returns Updated domain configuration
 */
export async function updateDomain(options: UpdateDomainOptions): Promise<DomainConfig> {
  const validated = UpdateDomainOptionsSchema.parse(options);

  // Check if domain exists
  const existing = await getDomainConfig(validated.domain, validated.adminUrl);
  if (!existing) {
    throw new DomainNotFoundError(validated.domain);
  }

  // Merge with existing configuration
  const updated: DomainConfig = {
    ...existing,
    ...(validated.target && { target: validated.target }),
    ...(validated.targetPort && { targetPort: validated.targetPort }),
    securityHeaders: {
      ...existing.securityHeaders,
      ...(validated.enableHsts !== undefined && { enableHsts: validated.enableHsts }),
      ...(validated.hstsMaxAge !== undefined && { hstsMaxAge: validated.hstsMaxAge }),
      ...(validated.frameOptions !== undefined && { frameOptions: validated.frameOptions }),
      ...(validated.enableCompression !== undefined && {
        enableCompression: validated.enableCompression,
      }),
    },
    ...(validated.redirectMode !== undefined && { redirectMode: validated.redirectMode }),
  };

  // Re-add domain with updated configuration
  await deleteDomain({ domain: validated.domain, adminUrl: validated.adminUrl });

  if (updated.autoTls) {
    return addDomainWithAutoTls({
      domain: updated.domain,
      target: updated.target,
      targetPort: updated.targetPort,
      enableSecurityHeaders: true,
      enableHsts: updated.securityHeaders.enableHsts,
      hstsMaxAge: updated.securityHeaders.hstsMaxAge,
      frameOptions: updated.securityHeaders.frameOptions,
      enableCompression: updated.securityHeaders.enableCompression,
      redirectMode: updated.redirectMode,
      adminUrl: validated.adminUrl,
    });
  } else if (updated.certFile && updated.keyFile) {
    return addDomainWithTls({
      domain: updated.domain,
      target: updated.target,
      targetPort: updated.targetPort,
      certFile: updated.certFile,
      keyFile: updated.keyFile,
      enableSecurityHeaders: true,
      enableHsts: updated.securityHeaders.enableHsts,
      hstsMaxAge: updated.securityHeaders.hstsMaxAge,
      frameOptions: updated.securityHeaders.frameOptions,
      enableCompression: updated.securityHeaders.enableCompression,
      redirectMode: updated.redirectMode,
      adminUrl: validated.adminUrl,
    });
  }

  return updated;
}

/**
 * Delete a domain and clean up associated certificates
 * @param options - Delete options
 */
export async function deleteDomain(options: DeleteDomainOptions): Promise<void> {
  const validated = DeleteDomainOptionsSchema.parse(options);
  const client = new CaddyClient({ adminUrl: validated.adminUrl });

  // Check if domain exists
  const existing = await getDomainConfig(validated.domain, validated.adminUrl);
  if (!existing) {
    throw new DomainNotFoundError(validated.domain);
  }

  // Get full config to clean up TLS certificates
  const config = (await client.getConfig()) as {
    apps?: {
      http?: {
        servers?: Record<string, unknown>;
      };
      tls?: {
        certificates?: {
          load_files?: {
            certificate?: string;
            key?: string;
            tags?: string[];
          }[];
          load_pem?: {
            certificate?: string;
            key?: string;
            tags?: string[];
          }[];
        };
        automation?: {
          policies?: {
            subjects?: string[];
            [key: string]: unknown;
          }[];
        };
      };
    };
  };

  // Remove the domain server
  if (config.apps?.http?.servers?.[validated.domain]) {
    delete config.apps.http.servers[validated.domain];
  }

  // Clean up TLS certificates for this domain
  if (config.apps?.tls?.certificates) {
    // Remove from load_files
    if (config.apps.tls.certificates.load_files) {
      config.apps.tls.certificates.load_files = config.apps.tls.certificates.load_files.filter(
        (cert) => {
          // Remove certs with domain in tags or certificate path
          const hasDomainTag = cert.tags?.some((tag) => tag.includes(validated.domain));
          const hasDomainInPath =
            cert.certificate?.includes(validated.domain) ?? cert.key?.includes(validated.domain);
          return !hasDomainTag && !hasDomainInPath;
        }
      );
    }

    // Remove from load_pem
    if (config.apps.tls.certificates.load_pem) {
      config.apps.tls.certificates.load_pem = config.apps.tls.certificates.load_pem.filter(
        (cert) => {
          const hasDomainTag = cert.tags?.some((tag) => tag.includes(validated.domain));
          return !hasDomainTag;
        }
      );
    }
  }

  // Clean up TLS automation policies
  if (config.apps?.tls?.automation?.policies) {
    config.apps.tls.automation.policies = config.apps.tls.automation.policies.filter(
      (policy) => !policy.subjects?.includes(validated.domain)
    );
  }

  // Apply updated configuration
  await client.request("/config/", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

/**
 * Get domain configuration
 * @param domain - Domain name
 * @param adminUrl - Caddy Admin API URL
 * @returns Domain configuration or null if not found
 */
export async function getDomainConfig(
  domain: Domain,
  adminUrl?: string
): Promise<DomainConfig | null> {
  const client = new CaddyClient({ adminUrl });

  try {
    const servers = (await client.getServers()) as Record<
      string,
      {
        routes?: {
          handle?: {
            handler?: string;
            upstreams?: { dial?: string }[];
            headers?: { response?: { set?: Record<string, string[]> } };
          }[];
          automatic_https?: { disable?: boolean };
        }[];
        automatic_https?: { disable?: boolean };
      }
    >;

    const serverConfig = servers[domain];
    if (!serverConfig) {
      return null;
    }

    // Parse target and port from reverse_proxy handler
    let target = "127.0.0.1";
    let targetPort = 3000;
    let enableHsts = false;
    let frameOptions: "DENY" | "SAMEORIGIN" = "DENY";
    let hstsMaxAge = 31536000;

    if (serverConfig.routes && serverConfig.routes.length > 0) {
      for (const route of serverConfig.routes) {
        if (!route.handle) continue;

        for (const handler of route.handle) {
          // Parse reverse_proxy to get target
          if (handler.handler === "reverse_proxy" && handler.upstreams?.[0]?.dial) {
            const dial = handler.upstreams[0].dial;
            const match = /^(.+):(\d+)$/.exec(dial);
            if (match) {
              target = match[1];
              targetPort = parseInt(match[2], 10);
            }
          }

          // Parse security headers
          if (handler.handler === "headers" && handler.headers?.response?.set) {
            const headers = handler.headers.response.set;
            if (headers["Strict-Transport-Security"]) {
              enableHsts = true;
              const hstsHeader = headers["Strict-Transport-Security"][0];
              const maxAgeMatch = /max-age=(\d+)/.exec(hstsHeader);
              if (maxAgeMatch) {
                hstsMaxAge = parseInt(maxAgeMatch[1], 10);
              }
            }
            if (headers["X-Frame-Options"]) {
              const frameOpt = headers["X-Frame-Options"][0];
              if (frameOpt === "SAMEORIGIN" || frameOpt === "DENY") {
                frameOptions = frameOpt;
              }
            }
          }
        }
      }
    }

    // Determine if auto TLS is enabled
    const autoTls = serverConfig.automatic_https?.disable !== true;

    return {
      domain,
      target,
      targetPort,
      tlsEnabled: true, // Assume TLS if server exists on :443
      autoTls,
      securityHeaders: {
        enableHsts,
        hstsMaxAge,
        frameOptions,
        enableCompression: true, // Can't detect from config easily
      },
      redirectMode: "none", // TODO: Detect redirect routes
    };
  } catch {
    return null;
  }
}
