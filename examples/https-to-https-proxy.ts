/**
 * HTTPS to HTTPS Proxy Example
 *
 * This example shows how to proxy from an external HTTPS domain
 * to an internal HTTPS service - a common pattern for .asd deployments.
 *
 * Scenarios covered:
 * 1. External DNS with TLS → Internal Caddy HTTPS service
 * 2. External DNS with TLS → Internal service with self-signed cert
 * 3. External DNS with TLS → Internal service with custom CA
 */
import {
  CaddyClient,
  buildReverseProxyHandler,
  buildSecurityHeadersHandler,
} from "@asd/caddy-api-client/caddy";

async function main() {
  const client = new CaddyClient({
    adminUrl: "http://127.0.0.1:2019",
  });

  // ========================================
  // Scenario 1: External HTTPS → Internal HTTPS (Trusted Certificate)
  // ========================================
  console.log("\n=== Scenario 1: External → Internal HTTPS (Trusted Cert) ===");

  // Example: external-api.example.com → internal-service.local:8443
  // The internal service has a certificate trusted by the system
  const externalToInternalRoute = {
    "@id": "external-to-internal-https",
    match: [{ host: ["external-api.example.com"] }],
    handle: [
      buildSecurityHeadersHandler({
        enableHsts: true,
        hstsMaxAge: 31536000,
        frameOptions: "DENY",
      }),
      // Simple way: just use https:// prefix
      buildReverseProxyHandler("https://internal-service.local:8443"),
    ],
    terminal: true,
  };

  await client.addRoute("https_server", externalToInternalRoute);
  console.log("✅ Route added: external-api.example.com → https://internal-service.local:8443");

  // ========================================
  // Scenario 2: External HTTPS → Internal HTTPS (Self-Signed Certificate)
  // ========================================
  console.log("\n=== Scenario 2: External → Internal HTTPS (Self-Signed) ===");

  // Example: public.example.com → studio.localhost:8443 (self-signed cert)
  // WARNING: Only use insecure_skip_verify in dev/testing or trusted networks!
  const selfSignedRoute = {
    "@id": "external-to-selfsigned",
    match: [{ host: ["public.example.com"] }],
    handle: [
      buildReverseProxyHandler("studio.localhost:8443", {
        tls: true,
        tlsInsecureSkipVerify: true, // Skip certificate verification
        tlsServerName: "studio.localhost", // Expected server name in cert
      }),
    ],
    terminal: true,
  };

  await client.addRoute("https_server", selfSignedRoute);
  console.log("✅ Route added: public.example.com → https://studio.localhost:8443 (self-signed)");

  // ========================================
  // Scenario 3: External HTTPS → Internal HTTPS (Custom CA)
  // ========================================
  console.log("\n=== Scenario 3: External → Internal HTTPS (Custom CA) ===");

  // Example: secure-api.example.com → internal-api:9443 (custom CA cert)
  // This is the RECOMMENDED approach for internal services with custom CAs
  const customCARoute = {
    "@id": "external-to-custom-ca",
    match: [{ host: ["secure-api.example.com"] }],
    handle: [
      buildReverseProxyHandler("internal-api:9443", {
        tls: true,
        tlsServerName: "internal-api.company.local",
        tlsTrustedCACerts: "/path/to/internal-ca.crt", // Path to CA certificate
      }),
    ],
    terminal: true,
  };

  await client.addRoute("https_server", customCARoute);
  console.log("✅ Route added: secure-api.example.com → https://internal-api:9443 (custom CA)");

  // ========================================
  // Scenario 4: .asd Pattern - Multiple Internal HTTPS Services
  // ========================================
  console.log("\n=== Scenario 4: .asd Pattern - Multiple Internal Services ===");

  // Typical .asd setup:
  // - External: https://test-1oti.cicd.eu1.asd.engineer (Let's Encrypt TLS)
  // - Internal: https://studio.localhost:8443 (local Caddy HTTPS)
  //
  // The external domain has public TLS, routes through SSH tunnel,
  // then proxies to internal Caddy instance running HTTPS

  const asdPatternRoutes = [
    {
      "@id": "asd-code-server",
      match: [{ host: ["test-1oti.cicd.eu1.asd.engineer"], path: ["/*"] }],
      handle: [
        buildSecurityHeadersHandler({
          enableHsts: true,
          frameOptions: "SAMEORIGIN",
        }),
        // Proxy to internal Caddy HTTPS server
        buildReverseProxyHandler("https://studio.localhost:8443", {
          tls: true,
          tlsInsecureSkipVerify: true, // Self-signed local cert
        }),
      ],
      terminal: true,
    },
    {
      "@id": "asd-api-service",
      match: [{ host: ["test-1oti.cicd.eu1.asd.engineer"], path: ["/api/*"] }],
      handle: [
        // Proxy to internal API service with HTTPS
        buildReverseProxyHandler("https://api-service:3443", {
          tls: true,
          tlsServerName: "api-service.local",
          tlsInsecureSkipVerify: true,
        }),
      ],
      terminal: true,
    },
  ];

  const result = await client.addRoutes("https_server", asdPatternRoutes);
  console.log(`✅ Added ${result.added} .asd routes (${result.skipped} skipped)`);

  // ========================================
  // Summary of TLS Options
  // ========================================
  console.log("\n=== TLS Options Summary ===");
  console.log(`
TLS Configuration Options:

1. Auto-detect from URL:
   buildReverseProxyHandler("https://backend:443")
   → Automatically enables TLS

2. Explicit TLS with server name:
   buildReverseProxyHandler("backend:443", {
     tls: true,
     tlsServerName: "backend.internal.com"
   })

3. Skip certificate verification (DEV ONLY):
   buildReverseProxyHandler("backend:443", {
     tls: true,
     tlsInsecureSkipVerify: true
   })

4. Custom CA certificate:
   buildReverseProxyHandler("backend:443", {
     tls: true,
     tlsTrustedCACerts: "/path/to/ca.crt"
   })

Common Patterns:

✅ Production: Use trusted certificates or custom CA
❌ Avoid: insecure_skip_verify in production
✅ Development: Self-signed certs with skip_verify OK
✅ .asd: Internal HTTPS services with local certs
`);

  // ========================================
  // Verify Configuration
  // ========================================
  console.log("\n=== Verifying Configuration ===");

  const routes = await client.getRoutes("https_server");
  const httpsRoutes = routes.filter((route) => {
    const handler = route.handle?.find((h) => h.handler === "reverse_proxy");
    return handler?.transport?.tls !== undefined;
  });

  console.log(`Total routes: ${routes.length}`);
  console.log(`HTTPS backend routes: ${httpsRoutes.length}`);
}

main().catch(console.error);
