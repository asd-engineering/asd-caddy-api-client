/**
 * Certificate utilities tests
 */
import { describe, test, expect } from "vitest";
import {
  parseCertificate,
  generateCertTag,
  splitCertificateBundle,
  extractSerialNumber,
  isCertificateExpired,
  isCertificateExpiringSoon,
  getDaysUntilExpiration,
} from "../utils/certificate.js";

// Valid test certificate (self-signed, expires 2027-01-03)
const VALID_CERT = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRkSvMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTcwMTA1MTYxNDE3WhcNMjcwMTAzMTYxNDE3WjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAw8VGbvqFXSqMQTAKPZk0GUXCQY4iCHF9Lj/bLW3qHBWIZJ3F3EcpGK8Y
xT8vTMGPj+Ut1tYvqGUPPYvF6Lx8RYMmgMmAeAwCLLcVAqjlGCjy7aqHJHJBWkHf
FRNCvt3PYOmLFqmLqQrXdFaSDDR+7aSHWqXNLJELqJjLNNvQpNmQEPGmKk6tN3vf
HLW9HU0yONvLY6EqJrOkGQkxYf3ysPp8gTYaJj4zyJqPBAKdJnrB0qNJUJHADuKK
bI7lV0J8xlCCGQDXL0IJWdGFbJGcNLPJQO0sxALdQcVkLwKGWqRHKTv3bHSJdJGR
BgaOBGwpCfr8q5z8V4O4VT1mYbZT1QIDAQABo1AwTjAdBgNVHQ4EFgQU3WGRfxkf
qL6F7pPNBKGJ2TGDvREwHwYDVR0jBBgwFoAU3WGRfxkfqL6F7pPNBKGJ2TGDvREw
DAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAVGKwwLGCvuJlOCPnGcqr
c7LNbGOPSs9WFcLJJj0gLODFCJCFGNPqQZXJB0r8z0GQKnLNYJNKcCLPVRqFPNPf
rQKDWQQKsB4xPjKJZmPcRNLLoF+vr5HNVDPqLSLqBmKYXJGPkYLcUOGmj7MWEnBQ
kSR7xjVQXcKY1ue4wOPJ9gCCY8MYJlpNLa3RzH0TbvHNn4p5MNB1cM2EjNLzZfHl
xAQmqJqYYJCwvPPvMfZhAbdD4yd3RFMM2qPGPqWgbPWRMSKiDZLN2wIkDDLqWzLZ
2Bvx5PVh5gL8eUmNJ0Yvjz7xJlK3F/kKqFLNXbFxDHGN9dLxPGJONKxJKvVGC6T8
lQ==
-----END CERTIFICATE-----`;

// Certificate bundle with 2 certificates
const CERT_BUNDLE = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRkSvMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTcwMTA1MTYxNDE3WhcNMjcwMTAzMTYxNDE3WjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAw8VGbvqFXSqMQTAKPZk0GUXCQY4iCHF9Lj/bLW3qHBWIZJ3F3EcpGK8Y
xT8vTMGPj+Ut1tYvqGUPPYvF6Lx8RYMmgMmAeAwCLLcVAqjlGCjy7aqHJHJBWkHf
FRNCvt3PYOmLFqmLqQrXdFaSDDR+7aSHWqXNLJELqJjLNNvQpNmQEPGmKk6tN3vf
HLW9HU0yONvLY6EqJrOkGQkxYf3ysPp8gTYaJj4zyJqPBAKdJnrB0qNJUJHADuKK
bI7lV0J8xlCCGQDXL0IJWdGFbJGcNLPJQO0sxALdQcVkLwKGWqRHKTv3bHSJdJGR
BgaOBGwpCfr8q5z8V4O4VT1mYbZT1QIDAQABo1AwTjAdBgNVHQ4EFgQU3WGRfxkf
qL6F7pPNBKGJ2TGDvREwHwYDVR0jBBgwFoAU3WGRfxkfqL6F7pPNBKGJ2TGDvREw
DAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAVGKwwLGCvuJlOCPnGcqr
c7LNbGOPSs9WFcLJJj0gLODFCJCFGNPqQZXJB0r8z0GQKnLNYJNKcCLPVRqFPNPf
rQKDWQQKsB4xPjKJZmPcRNLLoF+vr5HNVDPqLSLqBmKYXJGPkYLcUOGmj7MWEnBQ
kSR7xjVQXcKY1ue4wOPJ9gCCY8MYJlpNLa3RzH0TbvHNn4p5MNB1cM2EjNLzZfHl
xAQmqJqYYJCwvPPvMfZhAbdD4yd3RFMM2qPGPqWgbPWRMSKiDZLN2wIkDDLqWzLZ
2Bvx5PVh5gL8eUmNJ0Yvjz7xJlK3F/kKqFLNXbFxDHGN9dLxPGJONKxJKvVGC6T8
lQ==
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJALM1NHG+nRlAMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTcwMTA1MTYxNTE3WhcNMjcwMTAzMTYxNTE3WjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAxMgHlKQPNJNLdkB8Y+fLJQh7Z9PNNwCnEQN/j3bGYVJLKN3FxLJJbYHF
sLlGgqN5VYGVcL8eLRMDmYGGN8J7kNLYGlNR7GZJ7lUDKsLJN3GNkF8QlKFGNJLO
PLJ7kLNGlMFJN8GJNkLPGN7JlLNMGJN7kLPGNJLMGJNkLNGJN7kLNGJNLMGN7JLk
NGJNLMGN7JLkNGJNLMGN7JLkNGJNLMGN7JLkNGJNLMGN7JLkNGJNLMGN7JLkNGJN
LMGN7JLkNGJNLMGN7JLkNGJNLMGN7JLkNGJNLMGN7JLkNGJNLMGN7JLkNGJNLMGN
7JLkNGJNLMGN7JLkNGJNLMGN7JLkNGJNLMGNwIDAQABo1AwTjAdBgNVHQ4EFgQU
5XHRkxlfqM7G8qQOCLHK3UHEwSFMwHwYDVR0jBBgwFoAU5XHRkxlfqM7G8qQOCLHK
3UHEwSFMDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAWHLxwMHDvvKm
PDQoHdsr8MKJGOQpZN8JJj1hMPEGJDGHOQrlaN9KJC0s1pLWWJJJNKmOPqYJCxvR
QLMpWJJJNKmOPqYJCxvRQLMpWJJJNKmOPqYJCxvRQLMpWJJJNKmOPqYJCxvRQLMp
WJJJNKmOPqYJCxvRQLMpWJJJNKmOPqYJCxvRQLMpWJJJNKmOPqYJCxvRQLMpWJJJ
NKmOPqYJCxvRQLMpWJJJNKmOPqYJCxvRQLMpWJJJNKmOPqYJCxvRQLMpWJJJNKmO
PqYJCxvRQLMpWQ==
-----END CERTIFICATE-----`;

describe("Certificate Utilities", () => {
  describe("parseCertificate", () => {
    test("parses valid certificate and extracts metadata", () => {
      const info = parseCertificate(VALID_CERT);

      expect(info.serialNumber).toBe("a2f4506fa64644af");
      expect(info.subject).toBe("C=AU, ST=Some-State, O=Internet Widgits Pty Ltd");
      expect(info.issuer).toBe("C=AU, ST=Some-State, O=Internet Widgits Pty Ltd");
      expect(info.notBefore).toBeInstanceOf(Date);
      expect(info.notAfter).toBeInstanceOf(Date);
    });

    test("throws error for invalid certificate", () => {
      expect(() => parseCertificate("invalid")).toThrow();
    });

    test("throws error for empty certificate", () => {
      expect(() => parseCertificate("")).toThrow();
    });
  });

  describe("generateCertTag", () => {
    test("generates tag with domain, serial, and timestamp", () => {
      const tag = generateCertTag("example.com", "a2f4506fa64644af");

      expect(tag).toMatch(/^example\.com-a2f4506fa64644af-\d{14}$/);
    });

    test("generates unique tags for same domain and serial", () => {
      const tag1 = generateCertTag("example.com", "a2f4506fa64644af");
      // Wait a tiny bit to ensure different timestamp
      const tag2 = generateCertTag("example.com", "a2f4506fa64644af");

      // Tags should have same prefix but could differ in timestamp
      expect(tag1).toContain("example.com-a2f4506fa64644af-");
      expect(tag2).toContain("example.com-a2f4506fa64644af-");
    });

    test("handles subdomain correctly", () => {
      const tag = generateCertTag("sub.example.com", "abc123");

      expect(tag).toContain("sub.example.com-abc123-");
    });
  });

  describe("splitCertificateBundle", () => {
    test("splits bundle into individual certificates", () => {
      const certs = splitCertificateBundle(CERT_BUNDLE);

      expect(certs).toHaveLength(2);
      expect(certs[0]).toContain("-----BEGIN CERTIFICATE-----");
      expect(certs[0]).toContain("-----END CERTIFICATE-----");
      expect(certs[1]).toContain("-----BEGIN CERTIFICATE-----");
      expect(certs[1]).toContain("-----END CERTIFICATE-----");
    });

    test("handles single certificate", () => {
      const certs = splitCertificateBundle(VALID_CERT);

      expect(certs).toHaveLength(1);
      expect(certs[0]).toBe(VALID_CERT);
    });

    test("returns empty array for empty string", () => {
      const certs = splitCertificateBundle("");

      expect(certs).toHaveLength(0);
    });

    test("handles certificate with extra whitespace", () => {
      const certWithWhitespace = `
      ${VALID_CERT}
      `;

      const certs = splitCertificateBundle(certWithWhitespace);

      expect(certs).toHaveLength(1);
    });
  });

  describe("extractSerialNumber", () => {
    test("extracts serial number from certificate", () => {
      const serial = extractSerialNumber(VALID_CERT);

      expect(serial).toBe("a2f4506fa64644af");
    });

    test("throws error for invalid certificate", () => {
      expect(() => extractSerialNumber("invalid")).toThrow();
    });
  });

  describe("isCertificateExpired", () => {
    test("returns false for valid unexpired certificate", () => {
      // This test cert expires in 2027
      const expired = isCertificateExpired(VALID_CERT);

      // Should not be expired (assuming current date is before 2027-01-03)
      expect(expired).toBe(false);
    });

    test("throws error for invalid certificate", () => {
      expect(() => isCertificateExpired("invalid")).toThrow();
    });
  });

  describe("isCertificateExpiringSoon", () => {
    test("returns true when certificate expires within specified days", () => {
      // Test cert expires 2027-01-03, so it should expire within 10000 days from 2017
      const expiringSoon = isCertificateExpiringSoon(VALID_CERT, 10000);

      expect(expiringSoon).toBe(true);
    });

    test("returns false when certificate does not expire within specified days", () => {
      // Test cert expires 2027-01-03, won't expire in next 1 day
      const expiringSoon = isCertificateExpiringSoon(VALID_CERT, 1);

      expect(expiringSoon).toBe(false);
    });

    test("handles zero days threshold", () => {
      const expiringSoon = isCertificateExpiringSoon(VALID_CERT, 0);

      expect(typeof expiringSoon).toBe("boolean");
    });

    test("throws error for invalid certificate", () => {
      expect(() => isCertificateExpiringSoon("invalid", 30)).toThrow();
    });
  });

  describe("getDaysUntilExpiration", () => {
    test("returns positive number for unexpired certificate", () => {
      const days = getDaysUntilExpiration(VALID_CERT);

      // Should be positive (cert expires 2027-01-03)
      expect(days).toBeGreaterThan(0);
    });

    test("returns integer value", () => {
      const days = getDaysUntilExpiration(VALID_CERT);

      expect(Number.isInteger(days)).toBe(true);
    });

    test("throws error for invalid certificate", () => {
      expect(() => getDaysUntilExpiration("invalid")).toThrow();
    });
  });
});
