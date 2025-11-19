# @asd/caddy-api-client

TypeScript client for Caddy Admin API with MITMproxy integration.

## Features

- ✅ **Type-safe Caddy API client** - Full TypeScript support with Zod validation
- ✅ **Route builders** - Composable functions for building Caddy routes
- ✅ **Domain management** - TLS automation with Let's Encrypt
- ✅ **Load balancing** - Health checks and multiple upstream support
- ✅ **MITMweb integration** - Traffic inspection for tunnels
- ✅ **Zero runtime dependencies** - Only peer dependency: `zod`

## Installation

```bash
npm install @asd/caddy-api-client zod
# or
bun add @asd/caddy-api-client zod
```

## Quick Start

```typescript
import { CaddyClient, buildServiceRoutes } from "@asd/caddy-api-client/caddy";

// Create client
const client = new CaddyClient({
  adminUrl: "http://127.0.0.1:2019",
});

// Build routes with type-safe builders
const routes = buildServiceRoutes({
  host: "api.localhost",
  dial: "127.0.0.1:3000",
  securityHeaders: {
    enableHsts: true,
    frameOptions: "DENY",
  },
});

// Add routes to Caddy (simplified - no loop needed!)
await client.addRoutes("https_server", routes);
```

> **⚠️ Important:** Always use our type-safe builder functions instead of constructing raw Caddy JSON objects. Our builders provide:
>
> - ✅ Full TypeScript type checking and IDE autocomplete
> - ✅ Runtime Zod schema validation
> - ✅ Protection against common configuration errors
> - ✅ Clear documentation and examples
>
> **Raw Caddy JSON is error-prone and breaks easily.** Our builders are tested, validated, and prevent mistakes.

## Usage

### Basic Route Management

```typescript
import { CaddyClient, buildServiceRoutes } from "@asd/caddy-api-client/caddy";

const client = new CaddyClient();

// Build host-based route
const routes = buildServiceRoutes({
  host: "api.localhost",
  dial: "127.0.0.1:3000",
  serviceId: "my-api",
});

// Add routes
for (const route of routes) {
  await client.addRoute("https_server", route);
}

// Get all routes
const allRoutes = await client.getRoutes("https_server");

// Remove routes by hostname
const removed = await client.removeRoutesByHost("old-api.localhost");
```

### Path-based Routes

```typescript
import { buildServiceRoutes } from "@asd/caddy-api-client/caddy";

const routes = buildServiceRoutes({
  path: "/api",
  pathRouteHost: "example.localhost",
  dial: "127.0.0.1:3000",
  stripPrefix: true, // Strip /api before forwarding
});
```

### Load Balancing

```typescript
import { CaddyClient, buildLoadBalancerRoute } from "@asd/caddy-api-client/caddy";

const client = new CaddyClient();

const lbRoute = buildLoadBalancerRoute({
  host: "api.localhost",
  upstreams: ["127.0.0.1:3000", "127.0.0.1:3001", "127.0.0.1:3002"],
  policy: "round_robin", // or "first", "random", "least_conn"
  healthCheckPath: "/health",
  healthCheckInterval: "10s",
});

await client.addRoute("https_server", lbRoute);
```

### Security Headers

```typescript
import { buildServiceRoutes } from "@asd/caddy-api-client/caddy";

const routes = buildServiceRoutes({
  host: "secure.localhost",
  dial: "127.0.0.1:3000",
  securityHeaders: {
    enableHsts: true,
    hstsMaxAge: 31536000, // 1 year
    frameOptions: "DENY",
    enableCompression: true,
  },
});
```

### Basic Authentication

```typescript
import { buildServiceRoutes } from "@asd/caddy-api-client/caddy";

const routes = buildServiceRoutes({
  host: "admin.localhost",
  dial: "127.0.0.1:3000",
  basicAuth: {
    enabled: true,
    username: "admin",
    passwordHash: "$2y$10$...", // bcrypt hash
    realm: "Admin Area",
  },
});
```

### MITMproxy Integration

Transparently inspect HTTP traffic for debugging production services **without modifying client or backend code, and without service restarts.**

#### Quick Start

```bash
# 1. Start MITMproxy in Docker
docker run -d \
  -p 8082:8080 \
  -p 8081:8081 \
  --name mitmproxy \
  mitmproxy/mitmproxy:10.4.2 \
  mitmweb \
  --mode reverse:http://your-backend:3000 \
  --web-host 0.0.0.0 \
  --listen-host 0.0.0.0 \
  --no-web-open-browser \
  --set keep_host_header=true
```

```typescript
// 2. Enable traffic inspection (zero downtime)
import { CaddyClient, buildMitmproxyRoute } from "@asd/caddy-api-client/caddy";

const client = new CaddyClient({ adminUrl: "http://localhost:2019" });

const route = buildMitmproxyRoute({
  host: "api.example.com",
  mitmproxyHost: "localhost",
  mitmproxyPort: 8082,
});

await client.addRoute("https_server", route, "api_debug");

// 3. View captured traffic at http://localhost:8081

// 4. Disable when done (zero downtime)
await client.removeRouteById("https_server", "api_debug");
```

#### Hot-Swapping Between Direct and Proxied Routing

Use `buildMitmproxyRoutePair()` to easily toggle traffic inspection on/off:

```typescript
import { CaddyClient, buildMitmproxyRoutePair } from "@asd/caddy-api-client/caddy";

const client = new CaddyClient({ adminUrl: "http://localhost:2019" });

// Create both direct and proxied routes
const routes = buildMitmproxyRoutePair({
  host: "api.example.com",
  backendHost: "api-service",
  backendPort: 3000,
  mitmproxyHost: "localhost",
  mitmproxyPort: 8082,
  routeId: "api_route",
});

// Start with direct routing (no inspection)
await client.addRoute("https_server", routes.direct, routes.direct["@id"]);

// Hot-swap to enable inspection (zero downtime)
await client.removeRouteById("https_server", routes.direct["@id"]);
await client.addRoute("https_server", routes.proxied, routes.proxied["@id"]);

// Hot-swap back to disable inspection
await client.removeRouteById("https_server", routes.proxied["@id"]);
await client.addRoute("https_server", routes.direct, routes.direct["@id"]);
```

#### Load Balancing with MITMproxy

Route some traffic through MITMproxy while keeping the rest direct:

```typescript
import { CaddyClient, buildLoadBalancerRoute } from "@asd/caddy-api-client/caddy";

const client = new CaddyClient();
const lbRoute = buildLoadBalancerRoute({
  host: "api.localhost",
  upstreams: [
    "localhost:8082", // MITMproxy (captures traffic)
    "localhost:3000", // Direct to backend
  ],
  policy: "round_robin",
});

await client.addRoute("https_server", lbRoute);
```

#### Docker Compose Setup

```yaml
services:
  mitmproxy:
    image: mitmproxy/mitmproxy:10.4.2
    ports:
      - "8082:8080" # Proxy port
      - "8081:8081" # Web UI
    command: >
      mitmweb
      --mode reverse:http://backend:3000
      --web-host 0.0.0.0
      --web-port 8081
      --listen-host 0.0.0.0
      --listen-port 8080
      --no-web-open-browser
      --set keep_host_header=true
    restart: unless-stopped

  backend:
    image: your-backend-image
    ports:
      - "3000:3000"
```

**Features:**

- ✅ Zero client/backend code changes
- ✅ Zero service restarts required
- ✅ Hot-swappable at runtime
- ✅ Complete request/response inspection
- ✅ Web UI for viewing captured traffic
- ✅ Production-safe (tested with concurrent requests)

**Troubleshooting:** See [docs/mitmproxy-troubleshooting.md](docs/mitmproxy-troubleshooting.md) for common issues and solutions.

### Domain Management

```typescript
import { addDomainWithAutoTls, deleteDomain } from "@asd/caddy-api-client/caddy";

// Add domain with automatic TLS (Let's Encrypt)
const domain = await addDomainWithAutoTls({
  domain: "example.com",
  target: "127.0.0.1",
  targetPort: 3000,
  enableHsts: true,
  redirectMode: "permanent",
});

// Delete domain
await deleteDomain({ domain: "example.com" });
```

## API Reference

### CaddyClient

```typescript
class CaddyClient {
  constructor(options?: CaddyClientOptions);

  // Configuration
  getConfig(): Promise<unknown>;
  reload(): Promise<void>;

  // Routes
  getRoutes(server: string): Promise<CaddyRoute[]>;
  addRoute(server: string, route: CaddyRoute): Promise<boolean>;
  patchRoutes(server: string, routes: CaddyRoute[]): Promise<void>;
  removeRoutesByHost(hostname: string, server?: string): Promise<number>;

  // Servers
  getServers(): Promise<unknown>;
  patchServer(serverConfig: Record<string, unknown>): Promise<void>;

  // Version
  getVersion(): Promise<unknown>;
}
```

### Route Builders

```typescript
// Service routes (host + path based)
buildServiceRoutes(options: ServiceRouteOptions): CaddyRoute[];

// Individual route types
buildHealthCheckRoute(options: HealthCheckRouteOptions): CaddyRoute;
buildHostRoute(options: HostRouteOptions): CaddyRoute;
buildPathRoute(options: PathRouteOptions): CaddyRoute;
buildLoadBalancerRoute(options: LoadBalancerRouteOptions): CaddyRoute;

// MITMproxy integration
buildMitmproxyRoute(options: MitmproxyRouteOptions): CaddyRoute;
buildMitmproxyRoutePair(options: MitmproxyRoutePairOptions): { direct: CaddyRoute; proxied: CaddyRoute };

// Handlers
buildReverseProxyHandler(dial: DialAddress): CaddyRouteHandler;
buildSecurityHeadersHandler(headers: SecurityHeaders): CaddyRouteHandler;
buildBasicAuthHandler(auth: BasicAuthOptions): CaddyRouteHandler;
buildRewriteHandler(prefix: string): CaddyRouteHandler;
buildIngressTagHeadersHandler(tag: string): CaddyRouteHandler;
buildIframeHeadersHandler(allowedOrigin?: string): CaddyRouteHandler;
```

### MITMweb Functions

```typescript
// Installation & status
isMitmproxyInstalled(): Promise<boolean>;
getMitmproxyVersion(): Promise<string | null>;
autoInstallMitmproxy(): Promise<boolean>;

// Process management
startMitmweb(options?: MitmwebOptions): Promise<{ pid, webUrl, proxyUrl, pidFile }>;
stopMitmweb(workingDir?: string): Promise<void>;
getMitmwebStatus(workingDir?: string): MitmwebStatus;
```

### Domain Management

```typescript
addDomainWithAutoTls(options: AddDomainWithAutoTlsOptions): Promise<DomainConfig>;
addDomainWithTls(options: AddDomainWithTlsOptions): Promise<DomainConfig>;
updateDomain(options: UpdateDomainOptions): Promise<DomainConfig>;
deleteDomain(options: DeleteDomainOptions): Promise<void>;
getDomainConfig(domain: Domain, adminUrl?: string): Promise<DomainConfig | null>;
```

## Error Handling

The library provides custom error classes:

```typescript
import {
  CaddyApiError,
  ValidationError,
  NetworkError,
  TimeoutError,
  DomainNotFoundError,
  MitmproxyNotInstalledError,
} from "@asd/caddy-api-client";

try {
  await client.addRoute("https_server", route);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error("Invalid route configuration:", error.errors);
  } else if (error instanceof CaddyApiError) {
    console.error(`Caddy API error (${error.statusCode}):`, error.responseBody);
  } else if (error instanceof NetworkError) {
    console.error("Network error:", error.cause);
  } else if (error instanceof TimeoutError) {
    console.error(`Request timed out after ${error.timeoutMs}ms`);
  }
}
```

## Examples

See the [`examples/`](./examples/) directory for complete examples:

- [`basic-usage.ts`](./examples/basic-usage.ts) - Basic route management
- [`load-balancer.ts`](./examples/load-balancer.ts) - Load balancing with health checks
- [`mitmproxy-integration.ts`](./examples/mitmproxy-integration.ts) - Traffic inspection with MITMproxy

## Documentation

📚 See **[docs/](docs/)** for:

- **[mitmproxy-troubleshooting.md](docs/mitmproxy-troubleshooting.md)** - MITMproxy troubleshooting guide
- **[POST_PARITY_ROADMAP.md](docs/project/POST_PARITY_ROADMAP.md)** - Roadmap for npm package and .asd CLI integration
- **[python-api-parity.md](docs/project/python-api-parity.md)** - Feature comparison with Python client

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Test
bun run test

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format
```

## License

MIT
