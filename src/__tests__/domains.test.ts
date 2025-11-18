/**
 * Unit tests for domain management functions
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  addDomainWithAutoTls,
  addDomainWithTls,
  updateDomain,
  deleteDomain,
  getDomainConfig,
  rotateCertificate,
  removeOldCertificates,
} from "../caddy/domains.js";
import { DomainNotFoundError, DomainAlreadyExistsError } from "../errors.js";

// Mock fs/promises module
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

describe("Domain Management", () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    // Reset readFile mock
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockReset();
  });

  describe("addDomainWithAutoTls", () => {
    test("adds domain with automatic TLS and security headers", async () => {
      // Mock getDomainConfig (domain doesn't exist)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ "other.com": {} }),
      } as Response);

      // Mock getConfig (for TLS automation)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            tls: {
              automation: { policies: [] },
            },
          },
        }),
      } as Response);

      // Mock patchServer
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const result = await addDomainWithAutoTls({
        domain: "example.com",
        target: "192.168.1.100",
        targetPort: 8080,
        enableSecurityHeaders: true,
        enableHsts: true,
        hstsMaxAge: 63072000,
        frameOptions: "SAMEORIGIN",
        adminUrl: "http://127.0.0.1:2019",
      });

      expect(result).toMatchObject({
        domain: "example.com",
        target: "192.168.1.100",
        targetPort: 8080,
        tlsEnabled: true,
        autoTls: true,
        securityHeaders: {
          enableHsts: true,
          hstsMaxAge: 63072000,
          frameOptions: "SAMEORIGIN",
          enableCompression: true,
        },
      });

      // Verify patchServer was called with correct configuration
      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:2019/config/apps/http/servers",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"example.com"'),
        })
      );
    });

    test("throws DomainAlreadyExistsError if domain exists", async () => {
      // Mock getDomainConfig (domain exists)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [
              {
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "127.0.0.1:3000" }],
                  },
                ],
              },
            ],
          },
        }),
      } as Response);

      await expect(
        addDomainWithAutoTls({
          domain: "example.com",
          target: "127.0.0.1",
          targetPort: 3000,
          adminUrl: "http://127.0.0.1:2019",
        })
      ).rejects.toThrow(DomainAlreadyExistsError);
    });

    test("validates input schema", async () => {
      await expect(
        addDomainWithAutoTls({
          domain: "", // Invalid empty domain
          target: "127.0.0.1",
          targetPort: 3000,
        })
      ).rejects.toThrow();
    });
  });

  describe("addDomainWithTls", () => {
    test("adds domain with custom TLS certificate", async () => {
      // Mock certificate file reading
      const { readFile } = await import("fs/promises");
      vi.mocked(readFile).mockResolvedValueOnce(`-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----`);

      // Mock getDomainConfig (domain doesn't exist)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      // Mock getConfig (for TLS certificates)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            tls: {
              certificates: { load_files: [] },
            },
          },
        }),
      } as Response);

      // Mock POST to /config/apps/tls (for adding certificates)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      // Mock patchServer
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const result = await addDomainWithTls({
        domain: "secure.example.com",
        target: "127.0.0.1",
        targetPort: 8443,
        certFile: "/etc/ssl/certs/example.crt",
        keyFile: "/etc/ssl/private/example.key",
        enableSecurityHeaders: true,
        adminUrl: "http://127.0.0.1:2019",
      });

      expect(result).toMatchObject({
        domain: "secure.example.com",
        target: "127.0.0.1",
        targetPort: 8443,
        tlsEnabled: true,
        autoTls: false,
        certFile: "/etc/ssl/certs/example.crt",
        keyFile: "/etc/ssl/private/example.key",
      });
    });

    test("throws DomainAlreadyExistsError if domain exists", async () => {
      // Mock getDomainConfig (domain exists)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "secure.example.com": {
            routes: [],
          },
        }),
      } as Response);

      await expect(
        addDomainWithTls({
          domain: "secure.example.com",
          target: "127.0.0.1",
          targetPort: 3000,
          certFile: "/etc/ssl/certs/example.crt",
          keyFile: "/etc/ssl/private/example.key",
        })
      ).rejects.toThrow(DomainAlreadyExistsError);
    });
  });

  describe("getDomainConfig", () => {
    test("returns null if domain doesn't exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      const result = await getDomainConfig("nonexistent.com");
      expect(result).toBeNull();
    });

    test("parses domain configuration with reverse proxy target and port", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            listen: [":443"],
            routes: [
              {
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "192.168.1.100:8080" }],
                  },
                ],
              },
            ],
            automatic_https: { disable: false },
          },
        }),
      } as Response);

      const result = await getDomainConfig("example.com");

      expect(result).toMatchObject({
        domain: "example.com",
        target: "192.168.1.100",
        targetPort: 8080,
        tlsEnabled: true,
        autoTls: true,
      });
    });

    test("parses security headers from configuration", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [
              {
                handle: [
                  {
                    handler: "headers",
                    headers: {
                      response: {
                        set: {
                          "Strict-Transport-Security": ["max-age=63072000; includeSubDomains"],
                          "X-Frame-Options": ["SAMEORIGIN"],
                        },
                      },
                    },
                  },
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "127.0.0.1:3000" }],
                  },
                ],
              },
            ],
          },
        }),
      } as Response);

      const result = await getDomainConfig("example.com");

      expect(result?.securityHeaders).toMatchObject({
        enableHsts: true,
        hstsMaxAge: 63072000,
        frameOptions: "SAMEORIGIN",
      });
    });

    test("detects disabled automatic HTTPS", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [
              {
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "127.0.0.1:3000" }],
                  },
                ],
              },
            ],
            automatic_https: { disable: true },
          },
        }),
      } as Response);

      const result = await getDomainConfig("example.com");
      expect(result?.autoTls).toBe(false);
    });

    test("returns null on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getDomainConfig("example.com");
      expect(result).toBeNull();
    });
  });

  describe("updateDomain", () => {
    test("updates existing domain configuration", async () => {
      // Mock getDomainConfig (domain exists) - called by updateDomain
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [
              {
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "127.0.0.1:3000" }],
                  },
                ],
              },
            ],
            automatic_https: { disable: false },
          },
        }),
      } as Response);

      // Mock getDomainConfig (domain exists) - called by deleteDomain
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [
              {
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "127.0.0.1:3000" }],
                  },
                ],
              },
            ],
          },
        }),
      } as Response);

      // Mock deleteDomain - getConfig
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            http: {
              servers: {
                "example.com": {},
              },
            },
            tls: {
              certificates: { load_files: [] },
              automation: { policies: [] },
            },
          },
        }),
      } as Response);

      // Mock deleteDomain - POST updated config
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      // Mock addDomainWithAutoTls - getDomainConfig (doesn't exist after delete)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      // Mock addDomainWithAutoTls - getConfig
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            tls: {
              automation: { policies: [] },
            },
          },
        }),
      } as Response);

      // Mock addDomainWithAutoTls - patchServer
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const result = await updateDomain({
        domain: "example.com",
        target: "192.168.1.200",
        targetPort: 8080,
        adminUrl: "http://127.0.0.1:2019",
      });

      expect(result).toMatchObject({
        domain: "example.com",
        target: "192.168.1.200",
        targetPort: 8080,
      });
    });

    test("throws DomainNotFoundError if domain doesn't exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await expect(
        updateDomain({
          domain: "nonexistent.com",
          target: "127.0.0.1",
          targetPort: 3000,
        })
      ).rejects.toThrow(DomainNotFoundError);
    });

    test("merges security headers with existing configuration", async () => {
      // Mock getDomainConfig - called by updateDomain
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [
              {
                handle: [
                  {
                    handler: "headers",
                    headers: {
                      response: {
                        set: {
                          "X-Frame-Options": ["DENY"],
                        },
                      },
                    },
                  },
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: "127.0.0.1:3000" }],
                  },
                ],
              },
            ],
            automatic_https: { disable: false },
          },
        }),
      } as Response);

      // Mock getDomainConfig - called by deleteDomain
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [],
          },
        }),
      } as Response);

      // Mock deleteDomain calls
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            http: { servers: { "example.com": {} } },
            tls: { certificates: { load_files: [] }, automation: { policies: [] } },
          },
        }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      // Mock addDomainWithAutoTls calls
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: { tls: { automation: { policies: [] } } } }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const result = await updateDomain({
        domain: "example.com",
        enableHsts: true,
        hstsMaxAge: 63072000,
      });

      expect(result.securityHeaders).toMatchObject({
        enableHsts: true,
        hstsMaxAge: 63072000,
        frameOptions: "DENY", // Preserved from existing config
      });
    });
  });

  describe("deleteDomain", () => {
    test("deletes domain and cleans up TLS certificates", async () => {
      // Mock getDomainConfig (domain exists)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [],
          },
        }),
      } as Response);

      // Mock getConfig with certificates to clean up
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            http: {
              servers: {
                "example.com": {},
                "other.com": {},
              },
            },
            tls: {
              certificates: {
                load_files: [
                  {
                    certificate: "/etc/ssl/certs/example.com.crt",
                    key: "/etc/ssl/private/example.com.key",
                    tags: ["manual"],
                  },
                  {
                    certificate: "/etc/ssl/certs/other.com.crt",
                    key: "/etc/ssl/private/other.com.key",
                    tags: ["manual"],
                  },
                ],
              },
              automation: {
                policies: [{ subjects: ["example.com"] }, { subjects: ["other.com"] }],
              },
            },
          },
        }),
      } as Response);

      // Mock POST to apply cleaned config
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      await deleteDomain({
        domain: "example.com",
        adminUrl: "http://127.0.0.1:2019",
      });

      // Verify config was updated with certificates and policies removed
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall?.[0]).toBe("http://127.0.0.1:2019/config/");
      expect(lastCall?.[1]).toMatchObject({ method: "POST" });

      const postedConfig = JSON.parse((lastCall?.[1] as RequestInit)?.body as string);

      // Domain should be removed from servers
      expect(postedConfig.apps.http.servers).not.toHaveProperty("example.com");
      expect(postedConfig.apps.http.servers).toHaveProperty("other.com");

      // Certificate for example.com should be removed
      expect(postedConfig.apps.tls.certificates.load_files).toHaveLength(1);
      expect(postedConfig.apps.tls.certificates.load_files[0].certificate).toContain("other.com");

      // TLS automation policy for example.com should be removed
      expect(postedConfig.apps.tls.automation.policies).toHaveLength(1);
      expect(postedConfig.apps.tls.automation.policies[0].subjects).toEqual(["other.com"]);
    });

    test("cleans up certificates by domain tags", async () => {
      // Mock getDomainConfig
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ "example.com": {} }),
      } as Response);

      // Mock getConfig with tagged certificates
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            http: { servers: { "example.com": {} } },
            tls: {
              certificates: {
                load_files: [
                  {
                    certificate: "/etc/ssl/cert.crt",
                    key: "/etc/ssl/key.key",
                    tags: ["example.com", "manual"],
                  },
                ],
                load_pem: [
                  {
                    certificate: "-----BEGIN CERTIFICATE-----",
                    key: "-----BEGIN PRIVATE KEY-----",
                    tags: ["example.com"],
                  },
                ],
              },
              automation: { policies: [] },
            },
          },
        }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      await deleteDomain({ domain: "example.com" });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const postedConfig = JSON.parse((lastCall?.[1] as RequestInit)?.body as string);

      // Both load_files and load_pem should be empty
      expect(postedConfig.apps.tls.certificates.load_files).toHaveLength(0);
      expect(postedConfig.apps.tls.certificates.load_pem).toHaveLength(0);
    });

    test("throws DomainNotFoundError if domain doesn't exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await expect(
        deleteDomain({
          domain: "nonexistent.com",
        })
      ).rejects.toThrow(DomainNotFoundError);
    });

    test("handles missing TLS configuration gracefully", async () => {
      // Mock getDomainConfig
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ "example.com": {} }),
      } as Response);

      // Mock getConfig without TLS section
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            http: {
              servers: { "example.com": {} },
            },
          },
        }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      await expect(deleteDomain({ domain: "example.com" })).resolves.not.toThrow();
    });
  });

  describe("rotateCertificate", () => {
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

    test("rotates certificate for existing domain", async () => {
      // Mock certificate file reading
      const { readFile } = await import("fs/promises");
      vi.mocked(readFile).mockResolvedValueOnce(VALID_CERT);

      // Mock getDomainConfig (domain exists)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [{ handle: [{ handler: "reverse_proxy" }] }],
          },
        }),
      } as Response);

      // Mock getConfig (for TLS certificates)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            tls: {
              certificates: {
                load_files: [
                  {
                    certificate: "/old/cert.crt",
                    key: "/old/cert.key",
                    tags: ["example.com-oldserial-20251118000000", "manual"],
                  },
                ],
              },
            },
          },
        }),
      } as Response);

      // Mock PATCH request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const certTag = await rotateCertificate(
        "example.com",
        "/new/cert.crt",
        "/new/cert.key",
        "http://127.0.0.1:2019"
      );

      expect(certTag).toMatch(/^example\.com-a2f4506fa64644af-\d{14}$/);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test("throws DomainNotFoundError if domain does not exist", async () => {
      // Mock getDomainConfig (domain doesn't exist)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await expect(
        rotateCertificate("nonexistent.com", "/new/cert.crt", "/new/cert.key")
      ).rejects.toThrow(DomainNotFoundError);
    });

    test("handles missing TLS configuration", async () => {
      // Mock certificate file reading
      const { readFile } = await import("fs/promises");
      vi.mocked(readFile).mockResolvedValueOnce(VALID_CERT);

      // Mock getDomainConfig (domain exists)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [{ handle: [{ handler: "reverse_proxy" }] }],
          },
        }),
      } as Response);

      // Mock getConfig (no TLS config)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      // Mock PATCH request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const certTag = await rotateCertificate("example.com", "/new/cert.crt", "/new/cert.key");

      expect(certTag).toMatch(/^example\.com-a2f4506fa64644af-\d{14}$/);
    });

    test("throws error for invalid certificate", async () => {
      // Mock certificate file reading with invalid cert
      const { readFile } = await import("fs/promises");
      vi.mocked(readFile).mockResolvedValueOnce("invalid certificate");

      // Mock getDomainConfig (domain exists)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "example.com": {
            routes: [{ handle: [{ handler: "reverse_proxy" }] }],
          },
        }),
      } as Response);

      await expect(
        rotateCertificate("example.com", "/invalid/cert.crt", "/invalid/cert.key")
      ).rejects.toThrow();
    });
  });

  describe("removeOldCertificates", () => {
    test("removes old certificates and keeps specified one", async () => {
      // Mock getConfig with multiple certificates
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            tls: {
              certificates: {
                load_files: [
                  {
                    certificate: "/old/cert1.crt",
                    key: "/old/cert1.key",
                    tags: ["example.com-serial1-20251118000000", "manual"],
                  },
                  {
                    certificate: "/old/cert2.crt",
                    key: "/old/cert2.key",
                    tags: ["example.com-serial2-20251118000001", "manual"],
                  },
                  {
                    certificate: "/new/cert.crt",
                    key: "/new/cert.key",
                    tags: ["example.com-serial3-20251118000002", "manual"],
                  },
                  {
                    certificate: "/other/cert.crt",
                    key: "/other/cert.key",
                    tags: ["other.com-serial4-20251118000003", "manual"],
                  },
                ],
              },
            },
          },
        }),
      } as Response);

      // Mock PATCH request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const removedCount = await removeOldCertificates(
        "example.com",
        "example.com-serial3-20251118000002"
      );

      expect(removedCount).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("returns 0 if no certificates to remove", async () => {
      // Mock getConfig with only the certificate to keep
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            tls: {
              certificates: {
                load_files: [
                  {
                    certificate: "/new/cert.crt",
                    key: "/new/cert.key",
                    tags: ["example.com-serial3-20251118000002", "manual"],
                  },
                ],
              },
            },
          },
        }),
      } as Response);

      const removedCount = await removeOldCertificates(
        "example.com",
        "example.com-serial3-20251118000002"
      );

      expect(removedCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("returns 0 if no TLS configuration exists", async () => {
      // Mock getConfig with no TLS config
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      const removedCount = await removeOldCertificates(
        "example.com",
        "example.com-serial3-20251118000002"
      );

      expect(removedCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("only removes certificates for specified domain", async () => {
      // Mock getConfig with certificates for multiple domains
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: {
            tls: {
              certificates: {
                load_files: [
                  {
                    certificate: "/example/old.crt",
                    key: "/example/old.key",
                    tags: ["example.com-serial1-20251118000000", "manual"],
                  },
                  {
                    certificate: "/example/new.crt",
                    key: "/example/new.key",
                    tags: ["example.com-serial2-20251118000001", "manual"],
                  },
                  {
                    certificate: "/other/cert.crt",
                    key: "/other/cert.key",
                    tags: ["other.com-serial3-20251118000002", "manual"],
                  },
                ],
              },
            },
          },
        }),
      } as Response);

      // Mock PATCH request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const removedCount = await removeOldCertificates(
        "example.com",
        "example.com-serial2-20251118000001"
      );

      // Should only remove 1 certificate (the old example.com one)
      expect(removedCount).toBe(1);
    });
  });
});
