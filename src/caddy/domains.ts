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
  DomainSchema,
} from "../schemas.js";
import { CaddyClient } from "./client.js";
import { DomainNotFoundError, DomainAlreadyExistsError } from "../errors.js";
import { validateOrThrow } from "../utils/validation.js";
import {
  extractSerialNumber,
  generateCertTag,
  splitCertificateBundle,
  parseCertificate,
} from "../utils/certificate.js";
import { buildRedirectRoute, buildCompressionHandler, buildWwwRedirect } from "./routes.js";

/**
 * Add a domain with automatic TLS (Let's Encrypt)
 * @param options - Domain configuration
 * @returns Domain configuration
 * @throws {ValidationError} If options fail validation
 * @throws {DomainAlreadyExistsError} If domain already exists
 * @throws {CaddyApiError} If Caddy API returns an error
 */
export async function addDomainWithAutoTls(
  options: AddDomainWithAutoTlsOptions
): Promise<DomainConfig> {
  const validated = validateOrThrow(
    AddDomainWithAutoTlsOptionsSchema,
    options,
    "addDomainWithAutoTls options"
  );
  const client = new CaddyClient({ adminUrl: validated.adminUrl });

  // Check if domain already exists
  const existing = await getDomainConfig(validated.domain, validated.adminUrl);
  if (existing) {
    throw new DomainAlreadyExistsError(validated.domain);
  }

  // Build routes array
  const routes = [];

  // Add redirect route if specified (using new buildWwwRedirect)
  if (validated.redirectMode === "www_to_domain") {
    routes.push(
      buildWwwRedirect({
        domain: validated.domain,
        mode: "www-to-domain",
        permanent: true,
      })
    );
  } else if (validated.redirectMode === "domain_to_www") {
    routes.push(
      buildWwwRedirect({
        domain: validated.domain,
        mode: "domain-to-www",
        permanent: true,
      })
    );
  }

  // Add main domain route
  const handlers = [];

  // Add security headers if enabled
  if (validated.enableSecurityHeaders) {
    handlers.push({
      handler: "headers",
      response: {
        set: {
          "X-Frame-Options": [validated.frameOptions ?? "DENY"],
          "X-Content-Type-Options": ["nosniff"],
          ...(validated.enableHsts
            ? {
                "Strict-Transport-Security": [`max-age=${validated.hstsMaxAge}; includeSubDomains`],
              }
            : {}),
        },
      },
    });
  }

  // Add compression handler if enabled
  if (validated.enableCompression !== false) {
    handlers.push(buildCompressionHandler());
  }

  // Add reverse proxy handler
  handlers.push({
    handler: "reverse_proxy",
    upstreams: [{ dial: `${validated.target}:${validated.targetPort}` }],
  });

  routes.push({
    "@id": validated.domain,
    handle: handlers,
  });

  // Build server configuration for the domain
  const serverConfig = {
    [validated.domain]: {
      listen: [":443"],
      routes,
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
 * @throws {ValidationError} If options fail validation
 * @throws {DomainAlreadyExistsError} If domain already exists
 * @throws {CaddyApiError} If Caddy API returns an error
 */
export async function addDomainWithTls(options: AddDomainWithTlsOptions): Promise<DomainConfig> {
  const validated = validateOrThrow(
    AddDomainWithTlsOptionsSchema,
    options,
    "addDomainWithTls options"
  );
  const client = new CaddyClient({ adminUrl: validated.adminUrl });

  // Check if domain already exists
  const existing = await getDomainConfig(validated.domain, validated.adminUrl);
  if (existing) {
    throw new DomainAlreadyExistsError(validated.domain);
  }

  // Build routes array
  const routes2 = [];

  // Add redirect route if specified
  if (validated.redirectMode === "www_to_domain") {
    routes2.push(
      buildRedirectRoute({
        fromHost: `www.${validated.domain}`,
        toHost: validated.domain,
        permanent: true,
        statusCode: validated.redirectStatusCode,
        id: `${validated.domain}-redirect`,
      })
    );
  } else if (validated.redirectMode === "domain_to_www") {
    routes2.push(
      buildRedirectRoute({
        fromHost: validated.domain,
        toHost: `www.${validated.domain}`,
        permanent: true,
        statusCode: validated.redirectStatusCode,
        id: `${validated.domain}-redirect`,
      })
    );
  }

  // Add main domain route
  const handlers2 = [];

  // Add security headers if enabled
  if (validated.enableSecurityHeaders) {
    handlers2.push({
      handler: "headers",
      response: {
        set: {
          "X-Frame-Options": [validated.frameOptions ?? "DENY"],
          "X-Content-Type-Options": ["nosniff"],
          ...(validated.enableHsts
            ? {
                "Strict-Transport-Security": [`max-age=${validated.hstsMaxAge}; includeSubDomains`],
              }
            : {}),
        },
      },
    });
  }

  // Add compression handler if enabled
  if (validated.enableCompression !== false) {
    handlers2.push(buildCompressionHandler());
  }

  // Add reverse proxy handler
  handlers2.push({
    handler: "reverse_proxy",
    upstreams: [{ dial: `${validated.target}:${validated.targetPort}` }],
  });

  routes2.push({
    "@id": validated.domain,
    match: [{ host: [validated.domain] }],
    handle: handlers2,
    terminal: true,
  });

  // Build server configuration
  const serverConfig = {
    [validated.domain]: {
      listen: [":443"],
      routes: routes2,
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

  // Read certificate to extract serial number for tagging
  const fs = await import("fs/promises");
  const certPem = await fs.readFile(validated.certFile, "utf-8");
  const certBlocks = splitCertificateBundle(certPem);
  const mainCert = certBlocks[0]; // Use first cert in chain
  const serialNumber = extractSerialNumber(mainCert);
  const certTag = generateCertTag(validated.domain, serialNumber);

  config.apps.tls.certificates.load_files.push({
    certificate: validated.certFile,
    key: validated.keyFile,
    tags: [certTag, "manual"],
  });

  // Apply TLS certificate configuration - use POST to ensure TLS app is initialized
  await client.request("/config/apps/tls", {
    method: "POST",
    body: JSON.stringify(config.apps.tls),
  });

  // Apply server configuration
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
 * @throws {ValidationError} If options fail validation
 * @throws {DomainNotFoundError} If domain does not exist
 * @throws {CaddyApiError} If Caddy API returns an error
 */
export async function updateDomain(options: UpdateDomainOptions): Promise<DomainConfig> {
  const validated = validateOrThrow(UpdateDomainOptionsSchema, options, "updateDomain options");

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
 * @throws {ValidationError} If options fail validation
 * @throws {DomainNotFoundError} If domain does not exist
 * @throws {CaddyApiError} If Caddy API returns an error
 */
export async function deleteDomain(options: DeleteDomainOptions): Promise<void> {
  const validated = validateOrThrow(DeleteDomainOptionsSchema, options, "deleteDomain options");
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
  const validatedDomain = validateOrThrow(DomainSchema, domain, "domain");
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

    const serverConfig = servers[validatedDomain];
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
      domain: validatedDomain,
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

/**
 * Rotate TLS certificate for a domain
 * Adds new certificate while keeping the old one temporarily for zero-downtime rotation
 * @param domain - Domain name
 * @param newCertFile - Path to new certificate file
 * @param newKeyFile - Path to new private key file
 * @param adminUrl - Caddy Admin API URL
 * @returns Certificate tag of the newly added certificate
 */
export async function rotateCertificate(
  domain: Domain,
  newCertFile: string,
  newKeyFile: string,
  adminUrl?: string
): Promise<string> {
  const validatedDomain = validateOrThrow(DomainSchema, domain, "domain");
  const client = new CaddyClient({ adminUrl });

  // Check if domain exists
  const existing = await getDomainConfig(validatedDomain, adminUrl);
  if (!existing) {
    throw new DomainNotFoundError(validatedDomain);
  }

  // Get current TLS configuration
  const tlsConfig = (await client.getConfig()) as {
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

  // Read new certificate to extract serial number
  const fs = await import("fs/promises");
  const certPem = await fs.readFile(newCertFile, "utf-8");
  const certBlocks = splitCertificateBundle(certPem);
  const mainCert = certBlocks[0];
  const serialNumber = extractSerialNumber(mainCert);
  const newCertTag = generateCertTag(validatedDomain, serialNumber);

  // Parse certificate info for validation
  parseCertificate(mainCert); // Validates certificate is parseable

  // Ensure TLS certificates structure exists
  tlsConfig.apps ??= {};
  tlsConfig.apps.tls ??= {};
  tlsConfig.apps.tls.certificates ??= { load_files: [] };
  tlsConfig.apps.tls.certificates.load_files ??= [];

  // Add new certificate
  tlsConfig.apps.tls.certificates.load_files.push({
    certificate: newCertFile,
    key: newKeyFile,
    tags: [newCertTag, "manual"],
  });

  // Apply updated TLS configuration
  await client.request("/config/apps/tls/certificates", {
    method: "PATCH",
    body: JSON.stringify(tlsConfig.apps.tls.certificates),
  });

  return newCertTag;
}

/**
 * Remove old certificates for a domain after rotation
 * Call this after verifying the new certificate is working
 * @param domain - Domain name
 * @param keepCertTag - Certificate tag to keep (usually the newest)
 * @param adminUrl - Caddy Admin API URL
 * @returns Number of certificates removed
 */
export async function removeOldCertificates(
  domain: Domain,
  keepCertTag: string,
  adminUrl?: string
): Promise<number> {
  const validatedDomain = validateOrThrow(DomainSchema, domain, "domain");
  const client = new CaddyClient({ adminUrl });

  // Get current TLS configuration
  const config = (await client.getConfig()) as {
    apps?: {
      tls?: {
        certificates?: {
          load_files?: {
            certificate?: string;
            key?: string;
            tags?: string[];
          }[];
        };
      };
    };
  };

  if (!config.apps?.tls?.certificates?.load_files) {
    return 0;
  }

  const originalCount = config.apps.tls.certificates.load_files.length;

  // Keep only the specified certificate tag for this domain
  config.apps.tls.certificates.load_files = config.apps.tls.certificates.load_files.filter(
    (cert) => {
      const hasDomainTag = cert.tags?.some((tag) => tag.includes(validatedDomain));
      const isKeepCert = cert.tags?.includes(keepCertTag);

      // Keep if: not a domain cert OR is the cert to keep
      return !hasDomainTag || isKeepCert;
    }
  );

  const removedCount = originalCount - config.apps.tls.certificates.load_files.length;

  if (removedCount > 0) {
    // Apply updated configuration
    await client.request("/config/apps/tls/certificates", {
      method: "PATCH",
      body: JSON.stringify(config.apps.tls.certificates),
    });
  }

  return removedCount;
}

/**
 * List all configured domains across all servers
 * Extracts unique hostnames from all routes in all servers
 *
 * @param adminUrl - Caddy admin API URL (optional, defaults to http://127.0.0.1:2019)
 * @returns Array of unique domain names
 *
 * @example
 * const domains = await listDomains();
 * console.log(domains); // ["example.com", "www.example.com", "api.example.com"]
 */
export async function listDomains(adminUrl?: string): Promise<string[]> {
  const client = new CaddyClient({ adminUrl });

  try {
    const servers = (await client.getServers()) as Record<
      string,
      {
        routes?: {
          match?: {
            host?: string[];
          }[];
        }[];
      }
    >;

    const domains = new Set<string>();

    // Extract all hostnames from all routes in all servers
    for (const serverConfig of Object.values(servers)) {
      if (!serverConfig.routes) continue;

      for (const route of serverConfig.routes) {
        if (!route.match) continue;

        for (const matcher of route.match) {
          if (!matcher.host) continue;

          for (const host of matcher.host) {
            domains.add(host);
          }
        }
      }
    }

    return Array.from(domains).sort();
  } catch {
    // If Caddy isn't running or has no servers, return empty array
    return [];
  }
}
