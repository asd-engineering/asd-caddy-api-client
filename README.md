# @accelerated-software-development/caddy-api-client

TypeScript client for Caddy Admin API with MITMproxy integration.

## Features

- ✅ **Type-safe Caddy API client** - Full TypeScript support with Zod validation
- ✅ **Route builders** - Composable functions for building Caddy routes
- ✅ **Domain management** - TLS automation with Let's Encrypt
- ✅ **Load balancing** - Health checks and multiple upstream support
- ✅ **MITMweb integration** - Traffic inspection for tunnels
- ✅ **Minimal dependencies** - Only peer dependency: `zod` for runtime validation

## Live Demo

Experience the library in action with our interactive demo showing dynamic MITMproxy traffic inspection via Caddy Admin API:

**[Launch Demo Dashboard](https://demo-oha3.cicd.eu1.asd.engineer/dashboard)** ← Hot-swap traffic inspection in real-time

The demo showcases:

- **Split-screen view**: Interactive search UI + MITMproxy Web UI
- **Zero-downtime route switching**: Toggle monitoring without restarts
- **Library-powered routing**: All route configuration via `caddy-api-client`

Run locally: `docker compose -f demo/docker-compose.yml up -d` → http://localhost:9080/dashboard

## Installation

```bash
npm install @accelerated-software-development/caddy-api-client zod
# or
bun add @accelerated-software-development/caddy-api-client zod
```

## Quick Start

```typescript
import {
  CaddyClient,
  buildServiceRoutes,
} from "@accelerated-software-development/caddy-api-client/caddy";

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

// Add routes to Caddy
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
import {
  CaddyClient,
  buildServiceRoutes,
} from "@accelerated-software-development/caddy-api-client/caddy";

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
import { buildServiceRoutes } from "@accelerated-software-development/caddy-api-client/caddy";

const routes = buildServiceRoutes({
  path: "/api",
  pathRouteHost: "example.localhost",
  dial: "127.0.0.1:3000",
  stripPrefix: true, // Strip /api before forwarding
});
```

### Load Balancing

```typescript
import {
  CaddyClient,
  buildLoadBalancerRoute,
} from "@accelerated-software-development/caddy-api-client/caddy";

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
import { buildServiceRoutes } from "@accelerated-software-development/caddy-api-client/caddy";

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
import { buildServiceRoutes } from "@accelerated-software-development/caddy-api-client/caddy";

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
import {
  CaddyClient,
  buildMitmproxyRoute,
} from "@accelerated-software-development/caddy-api-client/caddy";

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
import {
  CaddyClient,
  buildMitmproxyRoutePair,
} from "@accelerated-software-development/caddy-api-client/caddy";

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
import {
  CaddyClient,
  buildLoadBalancerRoute,
} from "@accelerated-software-development/caddy-api-client/caddy";

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

**Troubleshooting:** See the [MITMproxy Troubleshooting Guide](https://github.com/asd-engineering/asd-caddy-api-client/blob/main/docs/mitmproxy-troubleshooting.md) for common issues and solutions.

### Domain Management

```typescript
import {
  addDomainWithAutoTls,
  deleteDomain,
} from "@accelerated-software-development/caddy-api-client/caddy";

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
  stop(): Promise<void>; // Gracefully stop Caddy server
  adapt(config: string, adapter?: string): Promise<unknown>; // Convert Caddyfile to JSON

  // Routes
  getRoutes(server: string): Promise<CaddyRoute[]>;
  addRoute(server: string, route: CaddyRoute): Promise<boolean>;
  addRoutes(server: string, routes: CaddyRoute[]): Promise<{ added: number; skipped: number }>;
  patchRoutes(server: string, routes: CaddyRoute[]): Promise<void>;
  insertRoute(
    server: string,
    route: CaddyRoute,
    position?: "beginning" | "end" | "after-health-checks"
  ): Promise<void>;
  replaceRouteById(server: string, id: string, newRoute: CaddyRoute): Promise<boolean>;
  removeRouteById(server: string, id: string): Promise<boolean>;
  removeRoutesByHost(hostname: string, server?: string): Promise<number>;

  // Servers
  getServers(): Promise<unknown>;
  getServerConfig(server: string): Promise<Record<string, unknown>>;
  patchServer(serverConfig: Record<string, unknown>): Promise<void>;

  // Upstreams (reverse proxy status)
  getUpstreams(): Promise<UpstreamStatus[]>; // Get health/status of upstream servers

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

// New handler routes (v0.3.0)
buildFileServerRoute(options: FileServerRouteOptions): CaddyRoute;
buildTemplatesRoute(options: TemplatesRouteOptions): CaddyRoute;
buildErrorRoute(options: ErrorRouteOptions): CaddyRoute;

// MITMproxy integration
buildMitmproxyRoute(options: MitmproxyRouteOptions): CaddyRoute;
buildMitmproxyRoutePair(options: MitmproxyRoutePairOptions): { direct: CaddyRoute; proxied: CaddyRoute };

// Handlers
buildReverseProxyHandler(dial: DialAddress): CaddyRouteHandler;
buildSecurityHeadersHandler(headers: SecurityHeaders): CaddyRouteHandler;
buildBasicAuthHandler(auth: BasicAuthOptions): CaddyRouteHandler;
buildRewriteHandler(prefix: string): CaddyRouteHandler;
buildCompressionHandler(options?: CompressionOptions): CaddyRouteHandler;
buildIngressTagHeadersHandler(tag: string): CaddyRouteHandler;
buildIframeHeadersHandler(allowedOrigin?: string): CaddyRouteHandler;

// New handlers (v0.3.0)
buildRequestBodyHandler(options: RequestBodyHandlerOptions): CaddyRouteHandler;
buildVarsHandler(options: VarsHandlerOptions): CaddyRouteHandler;
buildMapHandler(options: MapHandlerOptions): CaddyRouteHandler;
buildTracingHandler(options?: TracingHandlerOptions): CaddyRouteHandler;
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

### Advanced Schemas

Zod-validated schemas for advanced Caddy configurations:

```typescript
import {
  // Duration (Go format)
  CaddyDurationSchema, // "10s", "1m30s", or nanoseconds

  // Health checks
  ActiveHealthChecksSchema, // uri, interval, timeout, expect_status, expect_body
  PassiveHealthChecksSchema, // fail_duration, max_fails, unhealthy_status
  HealthChecksSchema, // Combined active + passive

  // Load balancing
  LoadBalancingSchema, // selection_policy, retries, try_duration
  UpstreamSchema, // dial, max_requests

  // Route matching
  ExtendedRouteMatcherSchema, // client_ip, remote_ip, path_regexp, expression, not

  // Handler
  ReverseProxyHandlerSchema, // Full reverse proxy with health checks + load balancing
} from "@accelerated-software-development/caddy-api-client";
```

### Handler Types (v0.3.0)

Full TypeScript support for all 20 Caddy HTTP handlers with Zod validation:

```typescript
import {
  // File serving
  FileServerHandlerSchema,    // Static files with browse, precompressed
  TemplatesHandlerSchema,     // Server-side template rendering

  // Request manipulation
  RewriteHandlerSchema,       // URI rewriting
  RequestBodyHandlerSchema,   // Body size limits
  VarsHandlerSchema,          // Set request variables
  MapHandlerSchema,           // Variable mapping

  // Response handling
  StaticResponseHandlerSchema, // Return static content
  HeadersHandlerSchema,       // Modify headers
  EncodeHandlerSchema,        // Compression (gzip, zstd, br)
  ErrorHandlerSchema,         // Trigger error handling

  // Proxy & routing
  ReverseProxyHandlerSchema,  // Proxy to upstreams
  SubrouteHandlerSchema,      // Nested routes
  InvokeHandlerSchema,        // Call named routes

  // Interception
  InterceptHandlerSchema,     // Response interception
  CopyResponseHandlerSchema,  // Copy subrequest response
  CopyResponseHeadersHandlerSchema, // Copy headers

  // Utilities
  AuthenticationHandlerSchema, // HTTP basic auth
  PushHandlerSchema,          // HTTP/2 server push
  TracingHandlerSchema,       // Distributed tracing
  LogAppendHandlerSchema,     // Custom log fields
} from "@accelerated-software-development/caddy-api-client";
```

**Route builders for common patterns:**

```typescript
import {
  buildFileServerRoute,      // Serve static files
  buildTemplatesRoute,       // Template processing
  buildErrorRoute,           // Error responses
  buildRequestBodyHandler,   // Body limits
  buildVarsHandler,          // Set variables
  buildMapHandler,           // Variable mapping
  buildTracingHandler,       // Tracing spans
} from "@accelerated-software-development/caddy-api-client/caddy";

// Example: Serve static files with browsing
const fileRoute = buildFileServerRoute({
  path: "/static/*",
  root: "/var/www/static",
  browse: true,
  hidePatterns: [".git", ".env"],
  precompressed: true,
});

// Example: Template rendering
const templateRoute = buildTemplatesRoute({
  path: "/*.html",
  fileRoot: "/var/www/templates",
  mimeTypes: ["text/html"],
});

// Example: Variable mapping for routing
const mapHandler = buildMapHandler({
  source: "{http.request.uri.path}",
  destinations: ["{backend}"],
  mappings: [
    { input: "/api/*", outputs: ["api-server"] },
    { input: "/admin/*", outputs: ["admin-server"] },
  ],
  defaults: ["default-server"],
});
```

### Extended Caddy Types

For advanced configurations beyond our Zod-validated builders, we re-export comprehensive type definitions from [caddy-json-types](https://github.com/CafuChino/caddy-json-types):

```typescript
import type {
  IConfig,
  IModulesCaddyhttpRoute,
  IModulesCaddyhttpReverseproxyHandler,
  IModulesCaddytlsConnectionPolicy,
} from "@accelerated-software-development/caddy-api-client/caddy-types";
```

**Includes 591 types covering:**

- Full Caddy JSON configuration structure
- 50+ DNS providers for ACME challenges
- Layer 4 (TCP/UDP) proxy configuration
- PKI/CA management types
- Storage backends (Redis, S3, DynamoDB, etc.)
- All HTTP handlers, matchers, and encoders

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
} from "@accelerated-software-development/caddy-api-client";

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

### Tested Examples (Always Current)

Our **integration tests** serve as comprehensive, tested examples that are verified in CI:

- **[caddy-mitmproxy-flow.integration.test.ts](./src/__tests__/integration/caddy-mitmproxy-flow.integration.test.ts)** - Complete MITMproxy integration patterns
- **[asd-scenarios.integration.test.ts](./src/__tests__/integration/asd-scenarios.integration.test.ts)** - Production routing scenarios (load balancing, multi-host, path-based)
- **[critical-modules.integration.test.ts](./src/__tests__/integration/critical-modules.integration.test.ts)** - All route builders, domain management, TLS

**Run examples locally:**

```bash
# Start services
docker compose -f docker-compose.test.yml up -d

# Run all integration tests (86+ examples)
INTEGRATION_TEST=true bun test src/__tests__/integration/

# Run specific example file
INTEGRATION_TEST=true bun test src/__tests__/integration/caddy-mitmproxy-flow.integration.test.ts
```

### Standalone Examples

See the [`examples/`](./examples/) directory for standalone examples (require published package):

- [`basic-usage.ts`](./examples/basic-usage.ts) - Basic route management
- [`load-balancer.ts`](./examples/load-balancer.ts) - Load balancing with health checks
- [`mitmproxy-integration.ts`](./examples/mitmproxy-integration.ts) - Traffic inspection with MITMproxy

## API Documentation

📚 **[View Full API Documentation](https://asd-engineering.github.io/asd-caddy-api-client/)** ← Auto-generated from source code

Full API documentation is generated using TypeDoc and hosted on GitHub Pages. It includes detailed information for all exported functions, classes, and types with examples.

**Generate locally:**

```bash
bun run docs:build      # Generate docs
bun run docs:serve      # Generate and open in browser
```

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

## Contributing

Contributions are welcome! Please [open an issue](https://github.com/asd-engineering/asd-caddy-api-client/issues) or submit a pull request if you have any improvements or fixes.

1. Fork the repository
2. Create a new branch (`git checkout -b my-feature-branch`)
3. Make your changes
4. Commit your changes (`git commit -am 'Add new feature'`)
5. Push to the branch (`git push origin my-feature-branch`)
6. Create a new Pull Request

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgements

This project is not affiliated with or endorsed by the Caddy project. It is an independent project created to improve the developer experience when working with Caddy JSON configurations in TypeScript.

For more information on Caddy and its configuration options, please visit the [official Caddy documentation](https://caddyserver.com/docs/).
