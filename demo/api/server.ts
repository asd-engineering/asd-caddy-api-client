/**
 * Demo API Server
 *
 * Showcases @accelerated-software-development/caddy-api-client library for:
 * - Dynamic route management via Caddy Admin API
 * - Hot-swappable MITMproxy traffic interception
 * - Iframe embedding with proper headers
 */

import { CaddyClient, buildReverseProxyHandler, buildRewriteHandler } from "../dist/index.js";
import type { CaddyRoute, CaddyRouteHandler } from "../dist/index.js";

const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL || "http://localhost:2019";
const ES_DIRECT = "elasticsearch:9200";
const ES_PROXIED = "mitmproxy:8080";
const SERVER_NAME = "srv0";

// Initialize Caddy client from the library
const caddy = new CaddyClient({ adminUrl: CADDY_ADMIN_URL });

// Track monitoring state
let monitoringEnabled = false;

/**
 * Build route handler with iframe-friendly headers
 * Removes X-Frame-Options and CSP headers from mitmproxy responses
 */
function buildIframePermissiveHandler(): CaddyRouteHandler {
  return {
    handler: "headers",
    response: {
      deferred: true,
      delete: ["X-Frame-Options", "Content-Security-Policy", "X-Xss-Protection"],
      set: {
        "Access-Control-Allow-Origin": ["*"],
        "X-Frame-Options": ["ALLOWALL"],
      },
    },
  } as CaddyRouteHandler;
}

/**
 * Setup initial routes using the library
 * This configures Caddy with proper routes for the demo
 */
async function setupRoutes() {
  console.log("Setting up Caddy routes using caddy-api-client library...");

  // Get current config
  const config = await caddy.getConfig();
  const httpApp = (config.apps as Record<string, unknown>)?.http as Record<string, unknown>;
  const servers = httpApp?.servers as Record<string, unknown>;
  const server = servers?.[SERVER_NAME] as Record<string, unknown>;

  // Ensure routes array exists
  if (!server?.routes) {
    console.log("  → Creating routes array...");
    await caddy.request(`/config/apps/http/servers/${SERVER_NAME}/routes`, {
      method: "PUT",
      body: JSON.stringify([]),
    });
  }

  // Build routes array
  const routes: CaddyRoute[] = [];

  // 1. API route - proxies to demo-api
  routes.push({
    "@id": "api_route",
    match: [{ path: ["/api/*"] }],
    handle: [buildReverseProxyHandler("demo-api:3000")],
    terminal: true,
  });

  // 2. App route - static files from demo-api
  routes.push({
    "@id": "app_route",
    match: [{ path: ["/app/*"] }],
    handle: [buildRewriteHandler("/app"), buildReverseProxyHandler("demo-api:3000")],
    terminal: true,
  });

  // 3. MITMproxy Web UI route - with iframe-permissive headers
  // Match both /mitmproxy and /mitmproxy/* paths
  // Set Host header to IP to bypass mitmproxy's DNS rebinding protection
  routes.push({
    "@id": "mitmproxy_ui_route",
    match: [{ path: ["/mitmproxy", "/mitmproxy/*"] }],
    handle: [
      buildRewriteHandler("/mitmproxy"),
      buildIframePermissiveHandler(),
      {
        handler: "reverse_proxy",
        transport: { protocol: "http" },
        headers: {
          request: {
            set: {
              Host: ["127.0.0.1:8081"],
            },
          },
        },
        upstreams: [{ dial: "mitmproxy:8081" }],
      } as CaddyRouteHandler,
    ],
    terminal: true,
  });

  // 4. Elasticsearch route - initially direct, can be swapped to proxied
  routes.push({
    "@id": "es_route",
    match: [{ path: ["/es/*"] }],
    handle: [buildRewriteHandler("/es"), buildReverseProxyHandler(ES_DIRECT)],
    terminal: true,
  });

  // 5. Dashboard route
  routes.push({
    "@id": "dashboard_route",
    match: [{ path: ["/dashboard"] }],
    handle: [buildReverseProxyHandler("demo-api:3000")],
    terminal: true,
  });

  // 6. Root redirect to dashboard
  routes.push({
    "@id": "root_redirect",
    match: [{ path: ["/"] }],
    handle: [
      {
        handler: "static_response",
        status_code: 302,
        headers: { Location: ["/dashboard"] },
      },
    ],
    terminal: true,
  });

  // Apply routes via Caddy Admin API
  for (const route of routes) {
    try {
      // Try to add each route
      const routeId = route["@id"] as string;
      await caddy.request(`/config/apps/http/servers/${SERVER_NAME}/routes`, {
        method: "POST",
        body: JSON.stringify(route),
      });
      console.log(`  ✓ Added route: ${routeId}`);
    } catch (error) {
      const routeId = route["@id"] as string;
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Failed to add route ${routeId}: ${errMsg}`);
    }
  }

  console.log("Routes configured!");
}

/**
 * Update the ES route upstream dynamically
 * This demonstrates hot-swapping routes without restart
 */
async function updateEsRoute(upstream: string) {
  // Build new ES route
  const route: CaddyRoute = {
    "@id": "es_route",
    match: [{ path: ["/es/*"] }],
    handle: [buildRewriteHandler("/es"), buildReverseProxyHandler(upstream)],
    terminal: true,
  };

  // Get current routes to find ES route index
  const config = await caddy.getConfig();
  const httpApp = (config.apps as Record<string, unknown>)?.http as Record<string, unknown>;
  const servers = httpApp?.servers as Record<string, unknown>;
  const server = servers?.[SERVER_NAME] as Record<string, unknown>;
  const routes = server?.routes as Array<Record<string, unknown>>;

  // Find ES route by @id
  const esRouteIndex = routes?.findIndex((r) => r["@id"] === "es_route") ?? -1;

  if (esRouteIndex === -1) {
    // Add new route
    await caddy.request(`/config/apps/http/servers/${SERVER_NAME}/routes`, {
      method: "POST",
      body: JSON.stringify(route),
    });
  } else {
    // Replace existing route
    await caddy.request(`/config/apps/http/servers/${SERVER_NAME}/routes/${esRouteIndex}`, {
      method: "PATCH",
      body: JSON.stringify(route),
    });
  }

  console.log(`ES route updated: upstream=${upstream}`);
}

// Setup routes on server start
setupRoutes().catch(console.error);

/**
 * Handle HTTP requests
 */
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // API endpoints
      if (path === "/api/monitoring/status") {
        return Response.json(
          { enabled: monitoringEnabled, upstream: monitoringEnabled ? ES_PROXIED : ES_DIRECT },
          { headers: corsHeaders }
        );
      }

      if (path === "/api/monitoring/enable" && req.method === "POST") {
        await updateEsRoute(ES_PROXIED);
        monitoringEnabled = true;
        return Response.json(
          {
            success: true,
            enabled: true,
            message: "Traffic monitoring enabled via caddy-api-client",
          },
          { headers: corsHeaders }
        );
      }

      if (path === "/api/monitoring/disable" && req.method === "POST") {
        await updateEsRoute(ES_DIRECT);
        monitoringEnabled = false;
        return Response.json(
          {
            success: true,
            enabled: false,
            message: "Traffic monitoring disabled via caddy-api-client",
          },
          { headers: corsHeaders }
        );
      }

      // Health check
      if (path === "/api/health") {
        return Response.json(
          { status: "ok", library: "@asd/caddy-api-client" },
          { headers: corsHeaders }
        );
      }

      // Serve static files from public directory
      if (path === "/" || path === "/index.html") {
        const file = Bun.file("../public/index.html");
        return new Response(file, {
          headers: { "Content-Type": "text/html", ...corsHeaders },
        });
      }

      if (path === "/dashboard" || path === "/dashboard.html") {
        const file = Bun.file("../public/dashboard.html");
        return new Response(file, {
          headers: { "Content-Type": "text/html", ...corsHeaders },
        });
      }

      if (path === "/style.css") {
        const file = Bun.file("../public/style.css");
        return new Response(file, {
          headers: { "Content-Type": "text/css", ...corsHeaders },
        });
      }

      if (path === "/main.js") {
        const file = Bun.file("../public/main.js");
        return new Response(file, {
          headers: { "Content-Type": "application/javascript", ...corsHeaders },
        });
      }

      // 404 for everything else
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error("Request error:", error);
      return Response.json(
        { error: (error as Error).message },
        { status: 500, headers: corsHeaders }
      );
    }
  },
});

console.log(`Demo API server running on http://localhost:${server.port}`);
console.log("Using @accelerated-software-development/caddy-api-client library");
