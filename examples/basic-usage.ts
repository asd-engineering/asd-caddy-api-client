/**
 * Basic usage examples for @asd/caddy-api-client
 */
import { CaddyClient, buildServiceRoutes } from "@asd/caddy-api-client/caddy";

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

  // Add routes to Caddy
  for (const route of routes) {
    const added = await client.addRoute("https_server", route);
    if (added) {
      console.log("✅ Route added");
    } else {
      console.log("ℹ️  Route already exists");
    }
  }

  // Get all routes
  const existingRoutes = await client.getRoutes("https_server");
  console.log(`Total routes: ${existingRoutes.length}`);

  // Remove routes by hostname
  const removed = await client.removeRoutesByHost("old-api.localhost", "https_server");
  console.log(`Removed ${removed} route(s)`);
}

main().catch(console.error);
