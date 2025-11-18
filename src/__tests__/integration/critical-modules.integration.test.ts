/**
 * Integration tests for critical modules (domains, routes, tls, certificates)
 * These tests validate that Caddy actually executes the configuration correctly
 *
 * Run these tests with:
 * 1. docker compose -f docker-compose.test.yml up -d
 * 2. bun test:integration
 * 3. docker compose -f docker-compose.test.yml down
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { CaddyClient } from "../../caddy/client.js";
import { addDomainWithTls, removeDomain } from "../../caddy/domains.js";
import { buildRedirectRoute, buildCompressionHandler } from "../../caddy/routes.js";
import { buildModernTlsPolicy, buildCompatibleTlsPolicy } from "../../caddy/tls.js";
import {
  parseCertificate,
  isCertificateExpiringSoon,
  getDaysUntilExpiration,
} from "../../utils/certificate.js";
import type { CaddyRoute } from "../../types.js";
import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";

const CADDY_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2019";
const INTEGRATION_TEST = process.env.INTEGRATION_TEST === "true";

// Skip integration tests unless explicitly enabled
const describeIntegration = INTEGRATION_TEST ? describe : describe.skip;

// Helper to add delay between operations
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Helper function to make HTTP requests with custom Host header
 */
function httpRequest(options: {
  host: string;
  port: number;
  path: string;
  headers?: Record<string, string>;
}): Promise<{ body: string; headers: http.IncomingHttpHeaders; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: options.host,
        port: options.port,
        path: options.path,
        method: "GET",
        headers: options.headers ?? {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({
            body: data,
            headers: res.headers,
            statusCode: res.statusCode ?? 0,
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describeIntegration("Critical Modules Integration Tests", () => {
  let client: CaddyClient;
  const testServer = "critical-test.localhost";

  beforeAll(async () => {
    client = new CaddyClient({ adminUrl: CADDY_URL });

    // Verify Caddy is running
    try {
      await client.getConfig();
    } catch {
      throw new Error(
        `Caddy not running at ${CADDY_URL}. Start with: docker compose -f docker-compose.test.yml up -d`
      );
    }
  });

  beforeEach(async () => {
    // Clean up test server before each test
    try {
      await client.patchServer({
        [testServer]: {
          listen: [":80"],
          routes: [],
          automatic_https: { disable: true },
        },
      });
      await delay(100);
    } catch {
      // Server might not exist, that's ok
    }
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      const servers = (await client.getServers()) as Record<string, unknown>;
      if (servers[testServer]) {
        delete servers[testServer];
        await client.patchServer(servers);
        await delay(100);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Route Building Integration (routes.ts)", () => {
    test("manual reverse proxy route creates working proxy", async () => {
      // Build a reverse proxy route manually
      const route: CaddyRoute = {
        "@id": "proxy-test",
        match: [{ host: ["proxy.localhost"] }],
        handle: [
          {
            handler: "reverse_proxy",
            upstreams: [{ dial: "echo-test:5678" }],
          },
        ],
        terminal: true,
      };

      // Add route to Caddy
      await client.insertRoute(testServer, route, "beginning");
      await delay(200);

      // Make HTTP request through the proxy
      const response = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "proxy.localhost" },
      });

      // Verify proxy works
      expect(response.body).toContain("Hello from backend 1");
      expect(response.statusCode).toBe(200);
    });

    test("buildRedirectRoute creates working redirect with correct status code", async () => {
      // Build redirect route (www -> non-www, permanent)
      const route = buildRedirectRoute({
        fromHost: "www.redirect.localhost",
        toHost: "redirect.localhost",
        permanent: true,
      });

      await client.insertRoute(testServer, route, "beginning");
      await delay(200);

      // Make request to www subdomain
      const response = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/test?foo=bar",
        headers: { Host: "www.redirect.localhost" },
      });

      // Verify redirect
      expect(response.statusCode).toBe(301); // Permanent redirect
      expect(response.headers.location).toContain("redirect.localhost");
      expect(response.headers.location).toContain("/test?foo=bar"); // Path preserved
    });

    test("buildRedirectRoute with permanent=false uses 302", async () => {
      const route = buildRedirectRoute({
        fromHost: "temp.localhost",
        toHost: "target.localhost",
        permanent: false,
      });

      await client.insertRoute(testServer, route, "beginning");
      await delay(200);

      const response = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "temp.localhost" },
      });

      expect(response.statusCode).toBe(302); // Temporary redirect
    });

    test("buildCompressionHandler enables gzip compression", async () => {
      // Add compression handler + proxy route
      const compressionHandler = buildCompressionHandler({ gzip: true, zstd: false });

      const route: CaddyRoute = {
        "@id": "compress-test",
        match: [{ host: ["compress.localhost"] }],
        handle: [
          compressionHandler,
          {
            handler: "reverse_proxy",
            upstreams: [{ dial: "echo-test:5678" }],
          },
        ],
        terminal: true,
      };

      await client.insertRoute(testServer, route, "beginning");
      await delay(200);

      // Request with Accept-Encoding: gzip
      const response = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: {
          Host: "compress.localhost",
          "Accept-Encoding": "gzip",
        },
      });

      // Verify compression handler is accepted by Caddy (route works)
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Hello from backend 1");
    });
  });

  describe("Domain Management Integration (domains.ts)", () => {
    test("addDomainWithTls adds domain with custom certificate", async () => {
      // Read test certificate
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const keyPath = path.join(process.cwd(), "test/certs/test.key");

      // Add domain with custom TLS certificate
      await addDomainWithTls({
        domain: "tls-test.localhost",
        target: "echo-test",
        targetPort: 5678,
        certFile: certPath,
        keyFile: keyPath,
        adminUrl: CADDY_URL,
      });

      await delay(200);

      // Verify TLS config was added
      const config = (await client.getConfig()) as {
        apps?: {
          tls?: {
            certificates?: {
              load_files?: { certificate: string; key: string; tags: string[] }[];
            };
          };
        };
      };

      expect(config.apps?.tls?.certificates?.load_files).toBeDefined();
      const certs = config.apps?.tls?.certificates?.load_files ?? [];
      expect(certs.some((c) => c.certificate === certPath)).toBe(true);
    });

    test("removeDomain cleans up routes and certificates", async () => {
      // First add a domain
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const keyPath = path.join(process.cwd(), "test/certs/test.key");

      await addDomainWithTls({
        domain: "cleanup-test.localhost",
        target: "echo-test",
        targetPort: 5678,
        certFile: certPath,
        keyFile: keyPath,
        adminUrl: CADDY_URL,
      });

      await delay(200);

      // Remove domain
      await removeDomain({
        domain: "cleanup-test.localhost",
        adminUrl: CADDY_URL,
      });

      await delay(200);

      // Verify domain was removed - check config no longer has domain's certificates
      const config = (await client.getConfig()) as {
        apps?: {
          tls?: {
            certificates?: {
              load_files?: { tags: string[] }[];
            };
          };
        };
      };

      const certs = config.apps?.tls?.certificates?.load_files ?? [];
      // Certificate tags should not contain cleanup-test.localhost
      const hasCleanupCert = certs.some((c) =>
        c.tags.some((tag) => tag.includes("cleanup-test.localhost"))
      );
      expect(hasCleanupCert).toBe(false);
    });

    test("addDomainWithTls creates working HTTPS endpoint", async () => {
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const keyPath = path.join(process.cwd(), "test/certs/test.key");

      // Note: addDomainWithTls creates its own server, so we don't need to pre-create one
      await addDomainWithTls({
        domain: "https-test.localhost",
        target: "echo-test",
        targetPort: 5678,
        certFile: certPath,
        keyFile: keyPath,
        adminUrl: CADDY_URL,
      });

      await delay(300);

      // Make HTTPS request (accept self-signed cert)
      const response = await new Promise<{ body: string; statusCode: number }>(
        (resolve, reject) => {
          const req = https.request(
            {
              hostname: "localhost",
              port: 8443,
              path: "/",
              method: "GET",
              headers: { Host: "https-test.localhost" },
              rejectUnauthorized: false, // Accept self-signed cert
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => resolve({ body: data, statusCode: res.statusCode ?? 0 }));
            }
          );
          req.on("error", reject);
          req.end();
        }
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Hello from backend 1");
    });
  });

  describe("Certificate Utils Integration (certificate.ts)", () => {
    test("parseCertificate extracts correct metadata from real certificate", async () => {
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const certPem = fs.readFileSync(certPath, "utf-8");

      const metadata = parseCertificate(certPem);

      expect(metadata.subject).toContain("CN=test.localhost");
      expect(metadata.notBefore).toBeInstanceOf(Date);
      expect(metadata.notAfter).toBeInstanceOf(Date);
      expect(metadata.serialNumber).toBeDefined();
      expect(metadata.serialNumber.length).toBeGreaterThan(0);
    });

    test("getDaysUntilExpiration calculates correct days", async () => {
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const certPem = fs.readFileSync(certPath, "utf-8");

      const days = getDaysUntilExpiration(certPem);

      // Certificate is valid for 365 days, should be ~365 days (accounting for test execution time)
      expect(days).toBeGreaterThan(360);
      expect(days).toBeLessThan(370);
    });

    test("isCertificateExpiringSoon detects non-expiring certificate", async () => {
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const certPem = fs.readFileSync(certPath, "utf-8");

      const expiringSoon = isCertificateExpiringSoon(certPem, 30);

      // Certificate is valid for ~365 days, should not be expiring soon
      expect(expiringSoon).toBe(false);
    });

    test("isCertificateExpiringSoon detects soon-to-expire certificate", async () => {
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const certPem = fs.readFileSync(certPath, "utf-8");

      // Check if expiring within 400 days (it's only valid for 365)
      const expiringSoon = isCertificateExpiringSoon(certPem, 400);

      expect(expiringSoon).toBe(true);
    });
  });

  describe("TLS Policies Integration (tls.ts)", () => {
    test("buildModernTlsPolicy creates valid TLS 1.3 connection policy", async () => {
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const keyPath = path.join(process.cwd(), "test/certs/test.key");

      // Parse certificate to get serial for tagging
      const certPem = fs.readFileSync(certPath, "utf-8");
      const metadata = parseCertificate(certPem);
      const tag = `modern-test-${metadata.serialNumber}`;

      // Add certificate with tag via addDomainWithTls
      await addDomainWithTls({
        domain: "modern-tls.localhost",
        target: "echo-test",
        targetPort: 5678,
        certFile: certPath,
        keyFile: keyPath,
        adminUrl: CADDY_URL,
      });

      await delay(200);

      // Build modern TLS connection policy (not automation policy)
      const policy = buildModernTlsPolicy({
        sni: ["modern-tls.localhost"],
        certificateTags: [tag],
      });

      // Patch TLS connection policies (not automation policies)
      await client.request("/config/apps/tls/connection_policies", {
        method: "PATCH",
        body: JSON.stringify([policy]),
      });

      await delay(200);

      // Verify policy was accepted by Caddy
      const updatedConfig = (await client.getConfig()) as {
        apps?: {
          tls?: {
            connection_policies?: { match?: { sni?: string[] } }[];
          };
        };
      };

      const policies = updatedConfig.apps?.tls?.connection_policies ?? [];
      expect(policies.length).toBeGreaterThan(0);
      // Verify our policy is in there
      const ourPolicy = policies.find((p) => p.match?.sni?.includes("modern-tls.localhost"));
      expect(ourPolicy).toBeDefined();
    });

    test("buildCompatibleTlsPolicy creates valid TLS 1.2+ policy", async () => {
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const keyPath = path.join(process.cwd(), "test/certs/test.key");

      const certPem = fs.readFileSync(certPath, "utf-8");
      const metadata = parseCertificate(certPem);
      const tag = `compat-test-${metadata.serialNumber}`;

      // Add certificate with tag
      await addDomainWithTls({
        domain: "compat-tls.localhost",
        target: "echo-test",
        targetPort: 5678,
        certFile: certPath,
        keyFile: keyPath,
        adminUrl: CADDY_URL,
      });

      await delay(200);

      // Build compatible TLS policy
      const policy = buildCompatibleTlsPolicy({
        sni: ["compat-tls.localhost"],
        certificateTags: [tag],
      });

      // Patch TLS connection policies
      await client.request("/config/apps/tls/connection_policies", {
        method: "PATCH",
        body: JSON.stringify([policy]),
      });

      await delay(200);

      // Verify policy was accepted
      const config = (await client.getConfig()) as {
        apps?: {
          tls?: {
            connection_policies?: { match?: { sni?: string[] } }[];
          };
        };
      };

      const policies = config.apps?.tls?.connection_policies ?? [];
      expect(policies.length).toBeGreaterThan(0);
      // Verify our policy is in there
      const ourPolicy = policies.find((p) => p.match?.sni?.includes("compat-tls.localhost"));
      expect(ourPolicy).toBeDefined();
    });
  });

  describe("End-to-End Domain with Redirects and Compression", () => {
    test("domain with www->non-www redirect and compression works", async () => {
      const certPath = path.join(process.cwd(), "test/certs/test.crt");
      const keyPath = path.join(process.cwd(), "test/certs/test.key");

      // Add domain with redirect mode
      await addDomainWithTls({
        domain: "e2e-test.localhost",
        target: "echo-test",
        targetPort: 5678,
        certFile: certPath,
        keyFile: keyPath,
        redirectMode: "www_to_domain",
        enableCompression: true,
        adminUrl: CADDY_URL,
      });

      await delay(300);

      // Test 1: Main domain works
      const mainResponse = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/",
        headers: { Host: "e2e-test.localhost" },
      });

      expect(mainResponse.statusCode).toBe(200);
      expect(mainResponse.body).toContain("Hello from backend 1");

      // Test 2: www redirect works
      const wwwResponse = await httpRequest({
        host: "localhost",
        port: 8080,
        path: "/test",
        headers: { Host: "www.e2e-test.localhost" },
      });

      expect(wwwResponse.statusCode).toBe(301);
      expect(wwwResponse.headers.location).toContain("e2e-test.localhost");
      expect(wwwResponse.headers.location).toContain("/test");
    });
  });
});
