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

### MITMweb Integration

```typescript
import { startMitmweb, stopMitmweb, isMitmproxyInstalled } from "@asd/caddy-api-client/mitm";
import { CaddyClient, buildLoadBalancerRoute } from "@asd/caddy-api-client/caddy";

// Check if installed
if (!(await isMitmproxyInstalled())) {
  console.log("Please install mitmproxy: pip install mitmproxy");
  process.exit(1);
}

// Start mitmweb
const mitm = await startMitmweb({
  webPort: 8081,
  proxyPort: 8080,
  openBrowser: true,
});

// Create load balancer with optional mitmproxy
const client = new CaddyClient();
const lbRoute = buildLoadBalancerRoute({
  host: "service.localhost",
  upstreams: [
    "127.0.0.1:8080", // MITMproxy (optional)
    "127.0.0.1:3000", // Service (always available)
  ],
  policy: "first", // Try mitmproxy first, fallback to service
});

await client.addRoute("https_server", lbRoute);

// Inspect traffic at http://127.0.0.1:8081

// Stop when done
await stopMitmweb();
```

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
- [`mitmweb-integration.ts`](./examples/mitmweb-integration.ts) - Traffic inspection

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
