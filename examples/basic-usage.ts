/**
 * Basic usage examples for @accelerated-software-development/caddy-api-client
 */
import {
  CaddyClient,
  buildServiceRoutes,
} from "@accelerated-software-development/caddy-api-client/caddy";

async function main() {
  // Create a Caddy API client
  const client = new CaddyClient({
    adminUrl: "http://127.0.0.1:2019",
    timeout: 5000,
  });

  // Get current Caddy configuration
  const config = await client.getConfig();
  console.log("Current config:", config);

  // Build service routes
  const routes = buildServiceRoutes({
    host: "api.localhost",
    dial: "127.0.0.1:3000",
    serviceId: "my-api",
    securityHeaders: {
      enableHsts: true,
      hstsMaxAge: 31536000,
      frameOptions: "DENY",
    },
  });

  // Add routes to Caddy (new simplified method - no loop needed!)
  const result = await client.addRoutes("https_server", routes);
  console.log(`✅ Added ${result.added} route(s), skipped ${result.skipped} (already exist)`);

  // Get all routes
  const existingRoutes = await client.getRoutes("https_server");
  console.log(`Total routes: ${existingRoutes.length}`);

  // Remove routes by hostname
  const removed = await client.removeRoutesByHost("old-api.localhost", "https_server");
  console.log(`Removed ${removed} route(s)`);
}

main().catch(console.error);
