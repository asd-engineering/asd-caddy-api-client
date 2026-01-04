/**
 * Simple domain setup example - Python-like simplicity!
 *
 * This example shows how to set up a production-ready domain
 * with just a few lines of code, similar to the Python caddy-api-client.
 */
import {
  CaddyClient,
  addDomainWithAutoTls,
  updateDomain,
  listDomains,
  deleteDomain,
  buildWwwRedirect,
} from "@accelerated-software-development/caddy-api-client/caddy";

async function main() {
  const client = new CaddyClient({
    adminUrl: "http://127.0.0.1:2019",
  });

  // ========================================
  // Example 1: Add a domain with Auto TLS (Let's Encrypt)
  // ========================================
  console.log("\n=== Adding domain with Auto TLS ===");

  await addDomainWithAutoTls({
    domain: "example.com",
    target: "nginx",
    targetPort: 80,
    redirectMode: "domain_to_www", // Redirect example.com → www.example.com
    enableSecurityHeaders: true,
    enableHsts: true,
    hstsMaxAge: 31536000, // 1 year
    frameOptions: "DENY",
    enableCompression: true,
  });

  console.log("✅ Added example.com with Auto TLS");

  // ========================================
  // Example 2: Add WWW redirect only (standalone)
  // ========================================
  console.log("\n=== Adding standalone WWW redirect ===");

  const wwwRedirect = buildWwwRedirect({
    domain: "api.example.com",
    mode: "www-to-domain", // www.api.example.com → api.example.com
    permanent: true,
  });

  await client.addRoute("https_server", wwwRedirect);
  console.log("✅ Added www redirect for api.example.com");

  // ========================================
  // Example 3: Add multiple routes at once (no loop!)
  // ========================================
  console.log("\n=== Adding multiple routes with addRoutes() ===");

  const routes = [
    buildWwwRedirect({
      domain: "blog.example.com",
      mode: "www-to-domain",
      permanent: true,
    }),
    // Add more routes as needed...
  ];

  const result = await client.addRoutes("https_server", routes);
  console.log(`✅ Added ${result.added} routes, skipped ${result.skipped} (already exist)`);

  // ========================================
  // Example 4: List all configured domains
  // ========================================
  console.log("\n=== Listing all domains ===");

  const domains = await listDomains();
  console.log("Configured domains:", domains);

  // ========================================
  // Example 5: Update an existing domain
  // ========================================
  console.log("\n=== Updating domain configuration ===");

  await updateDomain({
    domain: "example.com",
    target: "new-backend",
    targetPort: 8080,
    redirectMode: "www_to_domain", // Change redirect direction
    enableHsts: true,
  });

  console.log("✅ Updated example.com configuration");

  // ========================================
  // Example 6: Delete a domain
  // ========================================
  console.log("\n=== Deleting domain ===");

  await deleteDomain({ domain: "example.com" });
  console.log("✅ Deleted example.com");

  // ========================================
  // Comparison: Before vs After
  // ========================================
  console.log("\n=== API Comparison ===");
  console.log(`
BEFORE (Verbose):
  const routes = buildServiceRoutes({ host: "example.com", dial: "nginx:80" });
  for (const route of routes) {
    await client.addRoute("https_server", route);
  }
  // Still missing: www redirect, Auto TLS configuration

AFTER (Simple):
  await addDomainWithAutoTls({
    domain: "example.com",
    target: "nginx",
    targetPort: 80,
    redirectMode: "domain_to_www",
    enableSecurityHeaders: true,
    enableHsts: true,
  });

  // Or with multiple routes:
  await client.addRoutes("https_server", routes); // No loop needed!
`);
}

main().catch(console.error);
