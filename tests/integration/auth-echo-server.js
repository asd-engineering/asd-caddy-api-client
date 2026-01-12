/**
 * Auth-Aware Echo Server
 *
 * A simple HTTP server that:
 * 1. Echoes back request information
 * 2. Decodes and returns JWT claims from Authorization header
 * 3. Returns X-Auth-* headers injected by caddy-security
 *
 * This allows tests to verify that authentication is working correctly
 * by checking what claims/headers the backend actually receives.
 *
 * Run: node auth-echo-server.js
 * Port: 5690 (configurable via PORT env)
 */

const http = require("http");

const PORT = process.env.PORT || 5690;

/**
 * Decode JWT payload (no verification - just decode)
 */
function decodeJwtPayload(token) {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;

    // Handle both standard and URL-safe base64
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const payload = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Extract auth information from request
 */
function extractAuthInfo(req) {
  const authHeader = req.headers["authorization"];
  const authInfo = {
    hasAuthHeader: !!authHeader,
    authType: null,
    token: null,
    claims: null,
    caddySecurityHeaders: {},
  };

  // Parse Authorization header
  if (authHeader) {
    const [type, token] = authHeader.split(" ");
    authInfo.authType = type;
    authInfo.token = token ? token.substring(0, 50) + "..." : null; // Truncate for safety

    if (token && type?.toLowerCase() === "bearer") {
      authInfo.claims = decodeJwtPayload(token);
    }
  }

  // Extract caddy-security injected headers (X-Token-*, X-User-*, etc.)
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      key.startsWith("x-token-") ||
      key.startsWith("x-user-") ||
      key.startsWith("x-auth-") ||
      key.startsWith("x-forwarded-")
    ) {
      authInfo.caddySecurityHeaders[key] = value;
    }
  }

  return authInfo;
}

const server = http.createServer((req, res) => {
  // CORS headers for browser testing
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const authInfo = extractAuthInfo(req);

  const response = {
    timestamp: new Date().toISOString(),
    request: {
      method: req.method,
      url: req.url,
      path: new URL(req.url, `http://${req.headers.host}`).pathname,
      query: Object.fromEntries(new URL(req.url, `http://${req.headers.host}`).searchParams),
    },
    auth: authInfo,
    headers: {
      host: req.headers.host,
      userAgent: req.headers["user-agent"],
      contentType: req.headers["content-type"],
    },
    backend: {
      name: "auth-echo-server",
      port: PORT,
    },
  };

  // Special endpoints
  const path = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  if (path === "/whoami") {
    // Return only auth-related info
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          authenticated: authInfo.hasAuthHeader,
          claims: authInfo.claims,
          injectedHeaders: authInfo.caddySecurityHeaders,
        },
        null,
        2
      )
    );
    return;
  }

  if (path === "/claims") {
    // Return just the claims
    if (authInfo.claims) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(authInfo.claims, null, 2));
    } else {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No valid token claims found" }));
    }
    return;
  }

  if (path === "/protected") {
    // Simulate a protected endpoint
    if (!authInfo.hasAuthHeader) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Authorization required" }));
      return;
    }
  }

  // Default: return full echo
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response, null, 2));
});

server.listen(PORT, () => {
  console.log(`Auth-echo server listening on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET /health  - Health check`);
  console.log(`  GET /whoami  - Returns auth info`);
  console.log(`  GET /claims  - Returns JWT claims only`);
  console.log(`  GET /*       - Echo full request with auth info`);
});
