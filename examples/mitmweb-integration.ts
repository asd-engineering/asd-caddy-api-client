/**
 * MITMweb integration example for tunnel inspection
 */
import {
  startMitmweb,
  stopMitmweb,
  getMitmwebStatus,
  isMitmproxyInstalled,
  autoInstallMitmproxy,
} from "@accelerated-software-development/caddy-api-client/mitm";
import {
  CaddyClient,
  buildLoadBalancerRoute,
} from "@accelerated-software-development/caddy-api-client/caddy";

async function main() {
  // Check if mitmproxy is installed
  const installed = await isMitmproxyInstalled();
  if (!installed) {
    console.log("MITMproxy not installed. Installing...");
    const success = await autoInstallMitmproxy();
    if (!success) {
      console.error("Failed to install mitmproxy");
      return;
    }
  }

  // Start mitmweb
  console.log("Starting mitmweb...");
  const mitm = await startMitmweb({
    webPort: 8081,
    proxyPort: 8080,
    listenAddress: "127.0.0.1",
    openBrowser: true,
  });

  console.log(`✅ Mitmweb started (PID: ${mitm.pid})`);
  console.log(`   Web UI: ${mitm.webUrl}`);
  console.log(`   Proxy: ${mitm.proxyUrl}`);

  // Create Caddy load balancer with mitmproxy as optional upstream
  const client = new CaddyClient();

  const lbRoute = buildLoadBalancerRoute({
    host: "service.localhost",
    upstreams: [
      "127.0.0.1:8080", // MITMproxy (optional)
      "127.0.0.1:3000", // Service (always available)
    ],
    policy: "first", // Try mitmproxy first, fallback to service
    healthCheckPath: "/health",
    healthCheckInterval: "10s",
  });

  await client.addRoute("https_server", lbRoute);
  console.log("✅ Load balancer route added (with optional mitmproxy)");

  // Keep running for 30 seconds
  console.log("\nInspecting traffic for 30 seconds...");
  console.log(`Visit ${mitm.webUrl} to see traffic`);

  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Stop mitmweb
  console.log("\nStopping mitmweb...");
  await stopMitmweb();

  // Check status
  const status = getMitmwebStatus();
  console.log(`Mitmweb status: ${status.running ? "running" : "stopped"}`);

  // Clean up Caddy route
  await client.removeRoutesByHost("service.localhost");
  console.log("✅ Cleanup complete");
}

main().catch(console.error);
