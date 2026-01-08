/**
 * Demo API Server
 *
 * Showcases @accelerated-software-development/caddy-api-client library for:
 * - Dynamic route management via Caddy Admin API
 * - Hot-swappable MITMproxy traffic interception using MitmproxyManager
 * - Multiple services with independent monitoring control
 */

import {
  CaddyClient,
  MitmproxyManager,
  buildReverseProxyHandler,
  buildRewriteHandler,
  buildIframeProxyRoute,
  buildWebSocketProxyRoute,
} from "../dist/index.js";
import type { CaddyRoute } from "../dist/index.js";

const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL || "http://localhost:2019";
const SERVER_NAME = "srv0";

// Initialize Caddy client from the library
const caddy = new CaddyClient({ adminUrl: CADDY_ADMIN_URL });

// Initialize MitmproxyManager with two proxy instances
const mitmManager = new MitmproxyManager(caddy, {
  default: { host: "mitmproxy", port: 8080, webPort: 8081 },      // For Elasticsearch
  nodeproxy: { host: "mitmproxy-node", port: 8080, webPort: 8081 }, // For Node API
});

// Register Elasticsearch service (uses default proxy)
mitmManager.register({
  id: "elasticsearch",
  serverId: SERVER_NAME,
  pathPrefix: "/es",
  backend: { host: "elasticsearch", port: 9200 },
});

// Register Node API service (uses nodeproxy)
mitmManager.register({
  id: "nodeapi",
  serverId: SERVER_NAME,
  pathPrefix: "/node",
  backend: { host: "demo-api", port: 3000 },
});

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

  // Define all route IDs for cleanup
  const routeIds = [
    "mitmproxy_ws_route",
    "mitmproxy_node_ws_route",
    "api_route",
    "app_route",
    "mitmproxy_ui_route",
    "mitmproxy_node_ui_route",
    "mitm_elasticsearch",
    "mitm_nodeapi",
    "dashboard_route",
    "root_redirect",
  ];

  // Remove existing routes first (idempotent setup)
  console.log("  → Cleaning up existing routes...");
  for (const id of routeIds) {
    await caddy.removeRouteById(SERVER_NAME, id);
  }

  // Build routes array
  const routes: CaddyRoute[] = [];

  // 0. MITMproxy WebSocket routes for both proxies
  routes.push(
    buildWebSocketProxyRoute({
      path: "/updates",
      upstreamHost: "mitmproxy",
      upstreamPort: 8081,
      routeId: "mitmproxy_ws_route",
      overrideHost: "127.0.0.1:8081",
    })
  );
  routes.push(
    buildWebSocketProxyRoute({
      path: "/updates-node",
      upstreamHost: "mitmproxy-node",
      upstreamPort: 8081,
      routeId: "mitmproxy_node_ws_route",
      overrideHost: "127.0.0.1:8081",
    })
  );

  // 1. API route - proxies to demo-api (internal, not intercepted)
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

  // 3. MITMproxy Web UI routes for both proxies
  routes.push(
    buildIframeProxyRoute({
      pathPrefix: "/mitmproxy",
      upstreamHost: "mitmproxy",
      upstreamPort: 8081,
      routeId: "mitmproxy_ui_route",
      iframeEmbed: true,
      overrideHost: "127.0.0.1:8081",
    })
  );
  routes.push(
    buildIframeProxyRoute({
      pathPrefix: "/mitmproxy-node",
      upstreamHost: "mitmproxy-node",
      upstreamPort: 8081,
      routeId: "mitmproxy_node_ui_route",
      iframeEmbed: true,
      overrideHost: "127.0.0.1:8081",
    })
  );

  // 4. Dashboard route
  routes.push({
    "@id": "dashboard_route",
    match: [{ path: ["/dashboard"] }],
    handle: [buildReverseProxyHandler("demo-api:3000")],
    terminal: true,
  });

  // 5. Root redirect to dashboard
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

  // Apply routes using the library's addRoute method
  for (const route of routes) {
    const routeId = route["@id"] as string;
    const added = await caddy.addRoute(SERVER_NAME, route);
    if (added) {
      console.log(`  ✓ Added route: ${routeId}`);
    } else {
      console.log(`  ⚠ Route already exists: ${routeId}`);
    }
  }

  // Initialize service routes via MitmproxyManager (start disabled/direct)
  await mitmManager.disable("elasticsearch");
  console.log("  ✓ Added route: mitm_elasticsearch (direct)");

  await mitmManager.disable("nodeapi");
  console.log("  ✓ Added route: mitm_nodeapi (direct)");

  console.log("Routes configured!");
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
      // === Node API endpoints (interceptable via /node/*) ===
      if (path === "/node/echo" || path === "/echo") {
        const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
        return Response.json(
          {
            service: "node-api",
            timestamp: new Date().toISOString(),
            method: req.method,
            echo: body,
            headers: Object.fromEntries(req.headers.entries()),
          },
          { headers: corsHeaders }
        );
      }

      if (path === "/node/random" || path === "/random") {
        return Response.json(
          {
            service: "node-api",
            timestamp: new Date().toISOString(),
            random: Math.random(),
            uuid: crypto.randomUUID(),
          },
          { headers: corsHeaders }
        );
      }

      // ============================================
      // CHALLENGE ENDPOINTS - Real ES Debugging Scenarios
      // ============================================

      // Challenge 1: Bulk Indexing with broken NDJSON
      // Real symptom: _bulk returns 400 or partial failures
      if (path === "/api/challenge/bulk-broken" && req.method === "POST") {
        // Simulate sending broken NDJSON to Elasticsearch
        // Problem: Pretty-printed JSON instead of NDJSON, missing newlines
        const brokenBulkPayload = `{"index":{"_index":"products"}}
{
  "name": "Broken Product",
  "price": 99.99,
  "category": "Electronics"
}
{"index":{"_index":"products"}}{"name":"Missing Newline","price":49.99}{"index":{"_index":"products"}}
{"name": "Also Broken", "price": 29.99}`;

        // Send to ES via the /es route (which may go through MITM)
        try {
          const esResponse = await fetch(`http://localhost:9080/es/_bulk`, {
            method: "POST",
            headers: { "Content-Type": "application/x-ndjson" },
            body: brokenBulkPayload,
          });
          const result = await esResponse.json();
          return Response.json(
            {
              challenge: "bulk-indexing",
              description: "Bulk request sent with formatting issues",
              hint: "In MITMproxy: Check the request body - see the pretty-printed JSON and missing newlines?",
              mitmAction: "Edit the request body to fix NDJSON format: each line must be compact JSON",
              esResponse: result,
            },
            { headers: corsHeaders }
          );
        } catch (e) {
          return Response.json(
            { error: "Failed to send bulk request", details: String(e) },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // Challenge 2: Search returns 0 hits - Query DSL mismatch
      // Real symptom: _search returns empty hits when you expect results
      if (path === "/api/challenge/search-zero-hits" && req.method === "POST") {
        // Send a query with common mistakes:
        // - Using 'match' on a 'keyword' field (should use 'term')
        // - Wrong field name
        const brokenQuery = {
          query: {
            bool: {
              must: [
                { match: { category: "electronics" } }, // Problem: category is keyword, needs exact match "Electronics"
                { match: { product_name: "keyboard" } }, // Problem: field is "name", not "product_name"
              ],
            },
          },
        };

        try {
          const esResponse = await fetch(`http://localhost:9080/es/products/_search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(brokenQuery),
          });
          const result = await esResponse.json();
          return Response.json(
            {
              challenge: "query-dsl-mismatch",
              description: "Search returned 0 hits - but we know keyboards exist!",
              sentQuery: brokenQuery,
              hint: "In MITMproxy: Inspect the request body - the Query DSL has issues",
              problems: [
                "1. 'category' is a keyword field - needs exact case: 'Electronics' not 'electronics'",
                "2. Field name is 'name', not 'product_name'",
              ],
              mitmAction: "Edit request: change 'product_name' to 'name', change 'electronics' to 'Electronics'",
              esResponse: result,
            },
            { headers: corsHeaders }
          );
        } catch (e) {
          return Response.json(
            { error: "Failed to send search", details: String(e) },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // Challenge 3: 429 Rate Limiting / Rejection Storm
      // Real symptom: Under load, ES returns 429s and retries make it worse
      if (path === "/api/challenge/rate-limit-storm" && req.method === "POST") {
        const results: Array<{ request: number; status: number; time: number }> = [];
        const startTime = Date.now();

        // Fire 10 rapid requests to simulate burst traffic
        const promises = Array.from({ length: 10 }, async (_, i) => {
          const reqStart = Date.now() - startTime;
          try {
            const response = await fetch(`http://localhost:9080/es/products/_search`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: { match_all: {} },
                size: 100,
                _source: true,
              }),
            });
            results.push({ request: i + 1, status: response.status, time: reqStart });
          } catch {
            results.push({ request: i + 1, status: 0, time: reqStart });
          }
        });

        await Promise.all(promises);

        return Response.json(
          {
            challenge: "rate-limit-burst",
            description: "Fired 10 rapid requests - watch for patterns in MITMproxy",
            hint: "In MITMproxy: Sort by timing, look for status codes and request patterns",
            mitmInsights: [
              "• See burst timing - all requests within milliseconds",
              "• In production, 429s would appear here during overload",
              "• Retries would show as duplicate requests",
              "• This is how you diagnose 'retry storm' problems",
            ],
            results: results.sort((a, b) => a.time - b.time),
            totalTime: Date.now() - startTime,
          },
          { headers: corsHeaders }
        );
      }

      // Challenge 4: Fix broken JSON response (original, enhanced)
      if (path === "/node/broken" || path === "/broken") {
        // Returns intentionally broken JSON - fix it in MITMproxy!
        const brokenJson = `{
  "status": "broken",
  "message": "Fix me in MITMproxy!"
  "missing_comma": true,
  "hint": "Add a comma after the message field"
  "timestamp": "${new Date().toISOString()}"
}`;
        return new Response(brokenJson, {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Challenge 5: 500 Error (original, enhanced)
      if (path === "/node/error500" || path === "/error500") {
        // Returns 500 error - change to 200 in MITMproxy!
        return Response.json(
          {
            error: "Internal Server Error",
            message: "Change my status to 200 in MITMproxy!",
            hint: "Edit the response status code",
            timestamp: new Date().toISOString(),
          },
          { status: 500, headers: corsHeaders }
        );
      }

      // Theme config - intercept and change to see visual effects!
      if (path === "/node/config" || path === "/config") {
        return Response.json(
          {
            theme: "dark",
            primaryColor: "#3b82f6",
            accentColor: "#f59e0b",
            backgroundColor: "#0f172a",
            cardColor: "#1e293b",
            textColor: "#e2e8f0",
            borderRadius: "0.5rem",
            appName: "Product Search",
            showPrices: true,
            currency: "USD",
            currencySymbol: "$",
            maxResults: 20,
            _hint: "Change theme to 'light' or modify colors!",
          },
          { headers: corsHeaders }
        );
      }

      // === Monitoring API endpoints ===

      // Get status for all services
      if (path === "/api/monitoring/status") {
        const status = mitmManager.getStatus();
        return Response.json(
          {
            services: Object.fromEntries(
              Object.entries(status).map(([id, s]) => [
                id,
                {
                  enabled: s.enabled,
                  proxy: s.proxy,
                  backend: `${s.service.backend.host}:${s.service.backend.port}`,
                  pathPrefix: s.service.pathPrefix,
                },
              ])
            ),
          },
          { headers: corsHeaders }
        );
      }

      // Enable monitoring for a specific service
      if (path.startsWith("/api/monitoring/enable/") && req.method === "POST") {
        const serviceId = path.split("/").pop();
        if (!serviceId || !mitmManager.getServiceStatus(serviceId)) {
          return Response.json(
            { error: `Unknown service: ${serviceId}` },
            { status: 404, headers: corsHeaders }
          );
        }
        // Use correct proxy for each service
        const proxyName = serviceId === "nodeapi" ? "nodeproxy" : "default";
        await mitmManager.enable(serviceId, { proxy: proxyName });
        return Response.json(
          {
            success: true,
            service: serviceId,
            enabled: true,
            proxy: proxyName,
            message: `Traffic monitoring enabled for ${serviceId}`,
          },
          { headers: corsHeaders }
        );
      }

      // Disable monitoring for a specific service
      if (path.startsWith("/api/monitoring/disable/") && req.method === "POST") {
        const serviceId = path.split("/").pop();
        if (!serviceId || !mitmManager.getServiceStatus(serviceId)) {
          return Response.json(
            { error: `Unknown service: ${serviceId}` },
            { status: 404, headers: corsHeaders }
          );
        }
        await mitmManager.disable(serviceId);
        return Response.json(
          {
            success: true,
            service: serviceId,
            enabled: false,
            message: `Traffic monitoring disabled for ${serviceId}`,
          },
          { headers: corsHeaders }
        );
      }

      // Legacy endpoints for backwards compatibility
      if (path === "/api/monitoring/enable" && req.method === "POST") {
        await mitmManager.enable("elasticsearch");
        return Response.json(
          { success: true, enabled: true, message: "Traffic monitoring enabled for elasticsearch" },
          { headers: corsHeaders }
        );
      }

      if (path === "/api/monitoring/disable" && req.method === "POST") {
        await mitmManager.disable("elasticsearch");
        return Response.json(
          { success: true, enabled: false, message: "Traffic monitoring disabled for elasticsearch" },
          { headers: corsHeaders }
        );
      }

      // Clear MITMproxy flows
      if (path === "/api/monitoring/clear" && req.method === "POST") {
        const results: Record<string, boolean> = {};

        // Clear flows from both MITMproxy instances
        try {
          await fetch("http://mitmproxy:8081/flows", { method: "DELETE" });
          results.elasticsearch = true;
        } catch {
          results.elasticsearch = false;
        }

        try {
          await fetch("http://mitmproxy-node:8081/flows", { method: "DELETE" });
          results.nodeapi = true;
        } catch {
          results.nodeapi = false;
        }

        return Response.json(
          { success: true, cleared: results, message: "MITMproxy flows cleared" },
          { headers: corsHeaders }
        );
      }

      // Health check
      if (path === "/api/health") {
        return Response.json(
          {
            status: "ok",
            library: "@asd/caddy-api-client",
            services: mitmManager.getRegisteredServices(),
            proxies: mitmManager.getAvailableProxies(),
          },
          { headers: corsHeaders }
        );
      }

      // Serve static files from public directory (mapped from demo/app/ in Dockerfile)
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
console.log("MitmproxyManager configured with services:", mitmManager.getRegisteredServices());
