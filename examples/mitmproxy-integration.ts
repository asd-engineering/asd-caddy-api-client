/**
 * MITMproxy integration example for transparent traffic inspection
 *
 * This example demonstrates how to use MITMproxy with Caddy to inspect
 * HTTP traffic without modifying client or backend code.
 *
 * Prerequisites:
 * 1. Docker installed and running
 * 2. Caddy server running at http://localhost:2019
 * 3. Backend service running at http://localhost:3000
 */
import {
  CaddyClient,
  buildMitmproxyRoute,
  buildMitmproxyRoutePair,
} from "@asd/caddy-api-client/caddy";

async function main() {
  console.log("MITMproxy Integration Example\n");

  // 1. Start MITMproxy in Docker (do this before running the script)
  console.log("Step 1: Start MITMproxy");
  console.log("  Run this command in your terminal:");
  console.log("  docker run -d \\");
  console.log("    -p 8082:8080 \\");
  console.log("    -p 8081:8081 \\");
  console.log("    --name mitmproxy \\");
  console.log("    mitmproxy/mitmproxy:10.4.2 \\");
  console.log("    mitmweb \\");
  console.log("    --mode reverse:http://host.docker.internal:3000 \\");
  console.log("    --web-host 0.0.0.0 \\");
  console.log("    --listen-host 0.0.0.0 \\");
  console.log("    --no-web-open-browser \\");
  console.log("    --set keep_host_header=true\n");

  // 2. Create Caddy client
  const client = new CaddyClient({ adminUrl: "http://localhost:2019" });

  // Example 1: Simple MITMproxy Route
  console.log("Example 1: Simple MITMproxy Route");
  const route = buildMitmproxyRoute({
    host: "api.example.com",
    mitmproxyHost: "localhost",
    mitmproxyPort: 8082,
  });

  await client.addRoute("https_server", route, "api_debug");
  console.log("✅ Added route: api.example.com → MITMproxy → Backend");
  console.log("   View traffic at: http://localhost:8081\n");

  // Wait 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Clean up
  await client.removeRouteById("https_server", "api_debug");
  console.log("✅ Removed route\n");

  // Example 2: Hot-Swappable Route Pair
  console.log("Example 2: Hot-Swappable Route Pair");
  const routes = buildMitmproxyRoutePair({
    host: "service.example.com",
    backendHost: "localhost",
    backendPort: 3000,
    mitmproxyHost: "localhost",
    mitmproxyPort: 8082,
    routeId: "service_route",
  });

  // Start with direct routing (no inspection)
  console.log("  Starting with DIRECT routing (no inspection)...");
  await client.addRoute("https_server", routes.direct, routes.direct["@id"]);
  console.log("✅ Direct route active: Client → Caddy → Backend");

  // Wait 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Hot-swap to proxied routing (enable inspection)
  console.log("\n  Hot-swapping to PROXIED routing (enable inspection)...");
  await client.removeRouteById("https_server", routes.direct["@id"]);
  await client.addRoute("https_server", routes.proxied, routes.proxied["@id"]);
  console.log("✅ Proxied route active: Client → Caddy → MITMproxy → Backend");
  console.log("   Traffic is now being captured!");
  console.log("   View at: http://localhost:8081");

  // Wait 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Hot-swap back to direct routing (disable inspection)
  console.log("\n  Hot-swapping back to DIRECT routing (disable inspection)...");
  await client.removeRouteById("https_server", routes.proxied["@id"]);
  await client.addRoute("https_server", routes.direct, routes.direct["@id"]);
  console.log("✅ Back to direct route: Client → Caddy → Backend");

  // Clean up
  await client.removeRouteById("https_server", routes.direct["@id"]);
  console.log("✅ Cleaned up routes\n");

  console.log("Example complete!");
  console.log("\nTo stop MITMproxy:");
  console.log("  docker stop mitmproxy");
  console.log("  docker rm mitmproxy");
}

main().catch(console.error);
