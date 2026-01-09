# MITMproxy Traffic Inspection Demo

This demo showcases the `@accelerated-software-development/caddy-api-client` library's ability to dynamically insert MITMproxy between services **without restarts**.

## What This Demo Shows

1. **Direct routing**: `Client → Caddy → Elasticsearch`
2. **Click "Enable Monitoring"**: Library calls Caddy Admin API
3. **Proxied routing**: `Client → Caddy → MITMproxy → Elasticsearch`
4. **Watch traffic**: See requests appear in MITMproxy web UI
5. **Click "Disable Monitoring"**: Instant switch back to direct

**Zero downtime. No service restarts. Just API calls.**

## Quick Start

```bash
# From the project root
just demo start

# Open in browser
http://localhost:9080/dashboard

# Stop when done
just demo stop
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  localhost:9080/dashboard (split-screen view)               │
│  ┌─────────────────────────┐  ┌───────────────────────────┐ │
│  │   Demo Search App       │  │  MITMproxy Web UI         │
│  │   /app/                 │  │  /mitmproxy/              │
│  │                         │  │                           │
│  │   [Enable Monitoring]   │  │  Shows captured traffic   │
│  └─────────────────────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────┐
│  Caddy (localhost:9080, Admin API: localhost:9019)        │
│                                                           │
│  /es/* route dynamically switches between:                │
│  - Direct:   elasticsearch:9200                           │
│  - Proxied:  mitmproxy:8080 → elasticsearch:9200          │
└───────────────────────────────────────────────────────────┘
```

## Library Usage

The demo uses the library to configure Caddy routes programmatically:

```typescript
import {
  CaddyClient,
  buildReverseProxyHandler,
  buildRewriteHandler,
} from "@accelerated-software-development/caddy-api-client";

const caddy = new CaddyClient({ adminUrl: "http://caddy:2019" });

// Add route with iframe-permissive headers for MITMproxy Web UI
const route = {
  "@id": "mitmproxy_ui_route",
  match: [{ path: ["/mitmproxy/*"] }],
  handle: [
    buildRewriteHandler("/mitmproxy"),
    {
      handler: "headers",
      response: {
        deferred: true,
        delete: ["X-Frame-Options", "Content-Security-Policy"],
        set: { "Access-Control-Allow-Origin": ["*"] },
      },
    },
    buildReverseProxyHandler("mitmproxy:8081"),
  ],
  terminal: true,
};

await caddy.request("/config/apps/http/servers/srv0/routes", {
  method: "POST",
  body: JSON.stringify(route),
});

// Hot-swap ES route upstream (direct ↔ proxied)
await caddy.request(`/config/apps/http/servers/srv0/routes/${index}`, {
  method: "PATCH",
  body: JSON.stringify(newRoute),
});
```

## Services

| Service       | Port | Description                          |
| ------------- | ---- | ------------------------------------ |
| Caddy         | 9080 | Reverse proxy (HTTP)                 |
| Caddy Admin   | 9019 | Admin API for dynamic config         |
| Elasticsearch | 9200 | Backend data store                   |
| MITMproxy     | 9082 | Proxy port (reverse mode)            |
| MITMproxy UI  | 9081 | Web interface for traffic inspection |
| Demo API      | 3000 | Search app + monitoring toggle       |

## Manual Testing

```bash
# Check service health
curl http://localhost:9080/api/health

# Check monitoring status
curl http://localhost:9080/api/monitoring/status

# Enable monitoring
curl -X POST http://localhost:9080/api/monitoring/enable

# Disable monitoring
curl -X POST http://localhost:9080/api/monitoring/disable

# Search products (goes through Caddy /es/ route)
curl -X POST http://localhost:9080/es/products/_search \
  -H "Content-Type: application/json" \
  -d '{"query":{"match":{"name":"keyboard"}}}'
```

## Cleanup

```bash
just demo stop
```
