/**
 * Certificate Management Abstraction
 *
 * Provides a unified interface for all certificate operations,
 * bundling certificate utilities and domain TLS management.
 *
 * @module caddy/certificates
 */

import type { CaddyClient } from "./client";
import {
  parseCertificate,
  generateCertTag,
  isCertificateExpired,
  isCertificateExpiringSoon,
  getDaysUntilExpiration,
} from "../utils/certificate";
import type { CertificateInfo } from "../utils/certificate";

/**
 * Certificate metadata with additional context
 */
export interface CertificateWithMetadata extends CertificateInfo {
  /** Certificate tag in Caddy config */
  tag: string;
  /** Whether certificate is expired */
  isExpired: boolean;
  /** Whether certificate expires soon (within threshold) */
  expiringSoon: boolean;
  /** Days until expiration (negative if expired) */
  daysUntilExpiration: number;
}

/**
 * Options for certificate rotation
 */
export interface RotateCertificateOptions {
  /** Domain name */
  domain: string;
  /** Path to new certificate file */
  certPath: string;
  /** Path to new private key file */
  keyPath: string;
  /** Caddy admin API URL (optional, defaults to client URL) */
  adminUrl?: string;
  /** Whether to remove old certificates after rotation */
  cleanupOld?: boolean;
}

/**
 * Result of certificate rotation operation
 */
export interface RotationResult {
  /** New certificate tag */
  tag: string;
  /** Number of old certificates removed (if cleanup enabled) */
  removedCount?: number;
}

/**
 * Certificate expiration check result
 */
export interface ExpirationCheckResult {
  /** Whether any certificates are expiring soon */
  hasExpiring: boolean;
  /** Certificates that are expiring or expired */
  expiringCertificates: CertificateWithMetadata[];
  /** All certificates for the domain */
  allCertificates: CertificateWithMetadata[];
}

/**
 * Certificate Manager
 *
 * Unified interface for certificate operations.
 * Bundles certificate inspection, rotation, cleanup, and monitoring.
 *
 * @example
 * const manager = new CertificateManager(client);
 *
 * // Inspect certificate
 * const info = await manager.inspect(certPem);
 *
 * // Rotate certificate
 * const result = await manager.rotate({
 *   domain: "example.com",
 *   certPath: "/path/to/new-cert.pem",
 *   keyPath: "/path/to/new-key.pem",
 *   cleanupOld: true,
 * });
 *
 * // Check expiration
 * const check = await manager.checkExpiration("example.com", 30);
 * if (check.hasExpiring) {
 *   console.log(`${check.expiringCertificates.length} certs expiring soon`);
 * }
 */
export class CertificateManager {
  constructor(private client: CaddyClient) {}

  /**
   * Inspect certificate metadata from PEM string
   *
   * @param certPem - PEM-encoded certificate
   * @returns Certificate information
   *
   * @example
   * const info = await manager.inspect(certPem);
   * console.log(`Serial: ${info.serialNumber}`);
   * console.log(`Expires: ${info.notAfter}`);
   */
  inspect(certPem: string): Promise<CertificateInfo> {
    return Promise.resolve(parseCertificate(certPem));
  }

  /**
   * Rotate certificate with zero downtime
   *
   * Process:
   * 1. Load new certificate and key
   * 2. Generate unique tag
   * 3. Add new certificate to Caddy
   * 4. Update domain's TLS automation to use new certificate
   * 5. Optionally remove old certificates
   *
   * @param options - Rotation options
   * @returns Rotation result with new tag and cleanup count
   *
   * @example
   * const result = await manager.rotate({
   *   domain: "example.com",
   *   certPath: "/certs/new-cert.pem",
   *   keyPath: "/certs/new-key.pem",
   *   cleanupOld: true,
   * });
   * console.log(`New tag: ${result.tag}`);
   * console.log(`Removed ${result.removedCount} old certificates`);
   */
  async rotate(options: RotateCertificateOptions): Promise<RotationResult> {
    const { domain, certPath, keyPath, adminUrl, cleanupOld = false } = options;

    // Import rotation function from domains module
    const { rotateCertificate } = await import("./domains.js");

    // Perform rotation
    const newTag = await rotateCertificate(domain, certPath, keyPath, adminUrl);

    const result: RotationResult = { tag: newTag };

    // Clean up old certificates if requested
    if (cleanupOld) {
      result.removedCount = await this.cleanupOld(domain, newTag, adminUrl);
    }

    return result;
  }

  /**
   * Remove old certificates after rotation
   *
   * Removes all certificates for the domain except the one with the specified tag.
   *
   * @param domain - Domain name
   * @param keepTag - Certificate tag to keep
   * @param adminUrl - Optional Caddy admin URL
   * @returns Number of certificates removed
   *
   * @example
   * const removed = await manager.cleanupOld("example.com", "example.com-abc123-1234567890");
   * console.log(`Removed ${removed} old certificates`);
   */
  async cleanupOld(domain: string, keepTag: string, adminUrl?: string): Promise<number> {
    const { removeOldCertificates } = await import("./domains.js");
    return removeOldCertificates(domain, keepTag, adminUrl);
  }

  /**
   * List all certificates for a domain
   *
   * Queries Caddy configuration to find all certificates tagged with the domain.
   *
   * @param domain - Domain name
   * @returns Array of certificates with metadata
   *
   * @example
   * const certs = await manager.list("example.com");
   * for (const cert of certs) {
   *   console.log(`Tag: ${cert.tag}, Expires: ${cert.notAfter}`);
   * }
   */
  async list(domain: string): Promise<CertificateWithMetadata[]> {
    // Get Caddy config
    const config = (await this.client.getConfig()) as {
      apps?: {
        tls?: {
          certificates?: {
            load_files?: {
              tags?: string[];
              certificate?: string;
            }[];
          };
        };
      };
    };

    // Extract TLS app config
    const tlsApp = config.apps?.tls;
    if (!tlsApp) {
      return [];
    }

    // Get certificates loaded from files
    const loadedCerts = tlsApp.certificates?.load_files ?? [];

    // Filter certificates by domain tag
    const domainCerts: CertificateWithMetadata[] = [];

    for (const certConfig of loadedCerts) {
      const tags = certConfig.tags ?? [];

      // Check if any tag starts with the domain
      const domainTag = tags.find((tag: string) => tag.startsWith(`${domain}-`));
      if (!domainTag) {
        continue;
      }

      // Read and parse certificate
      const certPath = certConfig.certificate;
      if (typeof certPath === "string") {
        try {
          const fs = await import("fs/promises");
          const certPem = await fs.readFile(certPath, "utf-8");
          const info = await this.inspect(certPem);

          const daysUntilExpiration = getDaysUntilExpiration(certPem);

          domainCerts.push({
            ...info,
            tag: domainTag,
            isExpired: isCertificateExpired(certPem),
            expiringSoon: isCertificateExpiringSoon(certPem, 30),
            daysUntilExpiration,
          });
        } catch {
          // Skip certificates we can't read
          continue;
        }
      }
    }

    return domainCerts;
  }

  /**
   * Check if any certificates are expiring soon
   *
   * @param domain - Domain name
   * @param thresholdDays - Days before expiration to consider "expiring soon" (default: 30)
   * @returns Expiration check result
   *
   * @example
   * const check = await manager.checkExpiration("example.com", 30);
   * if (check.hasExpiring) {
   *   for (const cert of check.expiringCertificates) {
   *     console.log(`Certificate ${cert.tag} expires in ${cert.daysUntilExpiration} days`);
   *   }
   * }
   */
  async checkExpiration(domain: string, thresholdDays = 30): Promise<ExpirationCheckResult> {
    const allCertificates = await this.list(domain);

    const expiringCertificates = allCertificates.filter(
      (cert) => cert.isExpired || cert.daysUntilExpiration <= thresholdDays
    );

    return {
      hasExpiring: expiringCertificates.length > 0,
      expiringCertificates,
      allCertificates,
    };
  }

  /**
   * Generate a certificate tag for a domain
   *
   * Tags are in format: `{domain}-{serial}-{timestamp}`
   *
   * @param domain - Domain name
   * @param certPem - PEM-encoded certificate
   * @returns Certificate tag
   *
   * @example
   * const tag = await manager.generateTag("example.com", certPem);
   * // Returns: "example.com-abc123def456-1234567890"
   */
  generateTag(domain: string, certPem: string): Promise<string> {
    return Promise.resolve(generateCertTag(domain, certPem));
  }

  /**
   * Check if certificate is expired
   *
   * @param certPem - PEM-encoded certificate
   * @returns True if certificate is expired
   *
   * @example
   * const isExpired = await manager.isExpired(certPem);
   * if (isExpired) {
   *   console.log("Certificate is expired!");
   * }
   */
  async isExpired(certPem: string): Promise<boolean> {
    return Promise.resolve(isCertificateExpired(certPem));
  }

  /**
   * Check if certificate expires soon
   *
   * @param certPem - PEM-encoded certificate
   * @param thresholdDays - Days before expiration (default: 30)
   * @returns True if certificate expires within threshold
   *
   * @example
   * const expiringSoon = await manager.isExpiringSoon(certPem, 30);
   * if (expiringSoon) {
   *   console.log("Certificate expires soon!");
   * }
   */
  async isExpiringSoon(certPem: string, thresholdDays = 30): Promise<boolean> {
    return Promise.resolve(isCertificateExpiringSoon(certPem, thresholdDays));
  }

  /**
   * Get days until certificate expiration
   *
   * @param certPem - PEM-encoded certificate
   * @returns Days until expiration (negative if expired)
   *
   * @example
   * const days = await manager.getDaysUntilExpiration(certPem);
   * console.log(`Certificate expires in ${days} days`);
   */
  async getDaysUntilExpiration(certPem: string): Promise<number> {
    return Promise.resolve(getDaysUntilExpiration(certPem));
  }
}

/**
 * Create a new CertificateManager instance
 *
 * @param client - CaddyClient instance
 * @returns CertificateManager
 *
 * @example
 * import { CaddyClient, createCertificateManager } from "caddy-api-client";
 *
 * const client = new CaddyClient();
 * const manager = createCertificateManager(client);
 *
 * const result = await manager.rotate({
 *   domain: "example.com",
 *   certPath: "/certs/cert.pem",
 *   keyPath: "/certs/key.pem",
 * });
 */
export function createCertificateManager(client: CaddyClient): CertificateManager {
  return new CertificateManager(client);
}
