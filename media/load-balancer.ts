/**
 * Load balancer example with health checks
 */
import {
  CaddyClient,
  buildLoadBalancerRoute,
} from "@accelerated-software-development/caddy-api-client/caddy";

async function main() {
  const client = new CaddyClient();

  // Create load balancer route with multiple upstreams
  const lbRoute = buildLoadBalancerRoute({
    host: "api.localhost",
    upstreams: ["127.0.0.1:3000", "127.0.0.1:3001", "127.0.0.1:3002"],
    policy: "round_robin",
    healthCheckPath: "/health",
    healthCheckInterval: "10s",
    priority: 100,
  });

  // Add load balancer route
  await client.addRoute("https_server", lbRoute);
  console.log("✅ Load balancer route added");

  // Verify routes
  const routes = await client.getRoutes("https_server");
  console.log(`Total routes: ${routes.length}`);
}

main().catch(console.error);
