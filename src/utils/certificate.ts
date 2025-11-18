/**
 * Certificate parsing and management utilities
 */
import { X509Certificate } from "@peculiar/x509";

export interface CertificateInfo {
  serialNumber: string;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
}

/**
 * Parse PEM certificate and extract metadata
 * @param pemCert - PEM-encoded certificate
 * @returns Certificate metadata
 */
export function parseCertificate(pemCert: string): CertificateInfo {
  const cert = new X509Certificate(pemCert);

  return {
    serialNumber: cert.serialNumber,
    subject: cert.subject,
    issuer: cert.issuer,
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
  };
}

/**
 * Generate unique certificate tag for tracking in Caddy
 * Format: {domain}-{serial}-{timestamp}
 * @param domain - Domain name
 * @param serialNumber - Certificate serial number (hex)
 * @returns Unique certificate tag
 */
export function generateCertTag(domain: string, serialNumber: string): string {
  const timestamp = new Date().toISOString().replace(/[:-]/g, "").replace("T", "").slice(0, 14);
  return `${domain}-${serialNumber}-${timestamp}`;
}

/**
 * Split certificate bundle into individual certificates
 * Handles multi-certificate PEM files (certificate chains)
 * @param bundle - PEM bundle containing one or more certificates
 * @returns Array of individual PEM certificates
 */
export function splitCertificateBundle(bundle: string): string[] {
  const certBlocks: string[] = [];
  const lines = bundle.split("\n");
  let currentBlock: string[] = [];
  let inCert = false;

  for (const line of lines) {
    if (line.includes("-----BEGIN CERTIFICATE-----")) {
      inCert = true;
      currentBlock = [line];
    } else if (line.includes("-----END CERTIFICATE-----")) {
      currentBlock.push(line);
      certBlocks.push(currentBlock.join("\n"));
      currentBlock = [];
      inCert = false;
    } else if (inCert) {
      currentBlock.push(line);
    }
  }

  return certBlocks;
}

/**
 * Extract certificate serial number as hex string
 * @param pemCert - PEM-encoded certificate
 * @returns Serial number in hexadecimal format
 */
export function extractSerialNumber(pemCert: string): string {
  const cert = new X509Certificate(pemCert);
  return cert.serialNumber;
}

/**
 * Check if certificate is expired
 * @param pemCert - PEM-encoded certificate
 * @returns True if certificate is expired
 */
export function isCertificateExpired(pemCert: string): boolean {
  const cert = new X509Certificate(pemCert);
  const now = new Date();
  return now > cert.notAfter;
}

/**
 * Check if certificate expires within the specified days
 * @param pemCert - PEM-encoded certificate
 * @param days - Number of days to check
 * @returns True if certificate expires within the specified days
 */
export function isCertificateExpiringSoon(pemCert: string, days: number): boolean {
  const cert = new X509Certificate(pemCert);
  const expiryThreshold = new Date();
  expiryThreshold.setDate(expiryThreshold.getDate() + days);
  return cert.notAfter <= expiryThreshold;
}

/**
 * Get days until certificate expiration
 * @param pemCert - PEM-encoded certificate
 * @returns Days until expiration (negative if expired)
 */
export function getDaysUntilExpiration(pemCert: string): number {
  const cert = new X509Certificate(pemCert);
  const now = new Date();
  const diffMs = cert.notAfter.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
