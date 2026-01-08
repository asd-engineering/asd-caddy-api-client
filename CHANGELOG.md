# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-01-08

### Added

- **MITMproxy Traffic Inspection Demo** - Interactive demo showcasing dynamic route switching via Caddy Admin API
  - Real-time traffic interception toggle between direct and proxy modes
  - Visual flow diagram control (`Browser → Caddy → MITM → Service`)
  - Support for multiple services (Elasticsearch, Node API)
  - Elasticsearch debugging challenges with guided walkthroughs

- **MitmproxyManager class** (`src/mitm/manager.ts`) - Multi-service traffic interception manager
  - Enable/disable interception per service dynamically
  - Route switching without service restarts
  - Status tracking for multiple proxy endpoints

- **Demo Docker Compose Stack** (`demo/docker-compose.yml`)
  - Caddy reverse proxy with Admin API
  - Elasticsearch 8.11 backend with sample product data
  - MITMproxy instances for ES and Node API traffic
  - Demo API server (Bun + caddy-api-client)
  - Automated seed data loading

- **Interactive Dashboard** (`demo/app/dashboard.html`)
  - Light header with centered flow diagram intercept control
  - Pulsing green glow effect when intercepting traffic
  - Tabbed interface for ES and Node API inspection
  - Collapsible debugging challenges panel
  - Resizable split-pane layout

- **Elasticsearch Debugging Challenges** (5 automated + 1 guide)
  - Bulk indexing failures (malformed NDJSON detection)
  - Zero-hits search debugging (Query DSL field name/case issues)
  - Mapping type mismatch (`document_parsing_exception`)
  - Aggregation on text field (fielddata disabled error)
  - Index not found 404 (typo in index name)
  - Response modification walkthrough (manual MITMproxy guide)

- **Response Manipulation Challenges** (4 interactive feature flag demos)
  - Theme Hacking - Intercept `/node/config` to change app colors
  - Unlock Secret Banner - Inject `secretMessage` to show rainbow banner
  - Enable Admin Mode - Set `adminMode: true` to reveal debug panel
  - Apply Fake Discount - Set `discountPercent` to show sale prices

- **Feature Flag System** for demo app manipulation
  - `showPrices` - Toggle price visibility
  - `showDescriptions` - Toggle product descriptions
  - `discountPercent` - Apply percentage discount with strikethrough styling
  - `secretMessage` - Display animated rainbow banner
  - `adminMode` - Show terminal-style debug panel
  - Theme presets: `dark`, `light`, `neon`, `hacker`
  - `_manipulation_hints` - In-response hints for MITMproxy users

- **Demo API Endpoints** (`demo/api/server.ts`)
  - `/api/monitoring/enable/:service` - Enable MITMproxy interception
  - `/api/monitoring/disable/:service` - Disable interception (direct mode)
  - `/api/monitoring/status` - Get current interception status
  - `/api/challenge/*` - Debugging challenge triggers

### Changed

- Demo app uses clean, minimal UI design with muted colors
- Flow diagram replaces toggle switch as primary intercept control
- Improved panel resize handle with visual feedback (drag indicator, blue highlight)
- Challenge instructions now include detailed steps for MITMproxy Options → intercept setup
- Challenge instructions updated with "Resume All" workflow (replaces keyboard shortcut 'a')
- MITMproxy iframe auto-refreshes when interception is enabled
- Note: MITMproxy flow list may require manual refresh when accessed through Caddy proxy

## [0.2.0] - 2026-01-06

### Added

- **New CaddyClient API methods**:
  - `stop()` - Gracefully stop the Caddy server
  - `getUpstreams()` - Get reverse proxy upstream server status (health, request counts)
  - `adapt()` - Convert Caddyfile or other formats to JSON configuration
- **UpstreamStatus type** - Type definition for upstream server status
- **Extended Caddy types** - Re-export of 591 comprehensive type definitions from [caddy-json-types](https://github.com/CafuChino/caddy-json-types) via `/caddy-types` entry point. Includes DNS providers, Layer 4 proxy, PKI/CA, storage backends, and all HTTP handlers/matchers.
- **Advanced Zod schemas** - New validated schemas for advanced Caddy configurations:
  - `CaddyDurationSchema` - Go duration strings ("10s", "1m30s") and nanoseconds
  - `ActiveHealthChecksSchema` - Full active health check options (uri, interval, timeout, expect_status, etc.)
  - `PassiveHealthChecksSchema` - Passive health monitoring (fail_duration, max_fails, unhealthy_status)
  - `HealthChecksSchema` - Combined active + passive health checks
  - `LoadBalancingSchema` - Selection policies (ip_hash, uri_hash, cookie, header) + retry options
  - `UpstreamSchema` - Upstream config with max_requests
  - `ExtendedRouteMatcherSchema` - client_ip, remote_ip, path_regexp, header_regexp, protocol, expression, not
  - `ReverseProxyHandlerSchema` - Full reverse proxy config with health checks, load balancing, headers
- **GitHub Pages API documentation** - Auto-generated TypeDoc at [asd-engineering.github.io/asd-caddy-api-client](https://asd-engineering.github.io/asd-caddy-api-client)
- **Automated npm publishing** - GitHub Actions workflow with provenance attestation
- **VERSIONING.md** - Comprehensive versioning and release guide
- **LICENSE** - MIT license file
- **TypeDoc configuration** - API documentation generation (`bun run docs:build`)
- **Release automation** - standard-version for changelog generation and version bumping
- **Version auto-sync** - VERSION export now reads from package.json automatically
- **Justfile commands** - `just release`, `just release-dry`, `just verify-package`
- **.npmignore** - Proper npm package file filtering

### Changed

- Package name: `@asd/caddy-api-client` → `@accelerated-software-development/caddy-api-client`
- Repository URL: `github.com/asd/caddy-api-client` → `github.com/asd-engineering/asd-caddy-api-client`
- Homepage now points to GitHub Pages documentation
- Examples updated to use new package name
- Roadmap cleaned up (removed time estimates, updated team references)
- README simplified (removed redundant documentation section)

### Fixed

- Incorrect GitHub URLs throughout documentation
- Broken documentation links in README (now use absolute GitHub URLs)

## [0.1.0] - 2025-11-18

### Added

- Initial release of @accelerated-software-development/caddy-api-client
- **CaddyClient class** - Full TypeScript client for Caddy Admin API
  - Configuration management (getConfig, reload)
  - Route management (getRoutes, addRoute, patchRoutes, removeRoutesByHost)
  - Server management (getServers, patchServer)
  - Version information (getVersion)
- **Route builder functions**
  - `buildServiceRoutes` - Generate host-based and path-based routes
  - `buildHealthCheckRoute` - Health check endpoints
  - `buildHostRoute` - Host-based routing
  - `buildPathRoute` - Path-based routing with prefix stripping
  - `buildLoadBalancerRoute` - Load balancing with health checks
  - Handler builders (reverse proxy, security headers, basic auth, rewrite, etc.)
- **Domain management**
  - `addDomainWithAutoTls` - Automatic TLS with Let's Encrypt
  - `addDomainWithTls` - Custom TLS certificates
  - `updateDomain` - Update existing domains
  - `deleteDomain` - Remove domains
  - `getDomainConfig` - Retrieve domain configuration
- **MITMweb integration**
  - `startMitmweb` - Start mitmweb proxy
  - `stopMitmweb` - Stop mitmweb proxy
  - `getMitmwebStatus` - Check mitmweb status
  - `isMitmproxyInstalled` - Check installation
  - `getMitmproxyVersion` - Get version information
  - `autoInstallMitmproxy` - Automatic installation with pipx/pip
- **Type safety**
  - Full TypeScript type definitions
  - Zod schemas for runtime validation
  - Custom error classes for better error handling
- **Examples**
  - Basic usage example
  - Load balancer example
  - MITMweb integration example
- **Documentation**
  - Comprehensive README with API reference
  - Usage examples for all major features
  - Error handling guide

### Python API Parity

Full feature parity with [caddy-api-client](https://github.com/migetapp/caddy-api-client) (Python) v0.2.4:

- ✅ All core domain management (add, update, delete)
- ✅ Certificate rotation with zero-downtime
- ✅ Redirect modes (www ↔ domain, configurable status codes)
- ✅ Security headers (HSTS, X-Frame-Options, etc.)
- ✅ HTTP Basic Authentication
- ✅ Path rewriting
- ✅ Load balancing with health checks
- ✅ Compression support (gzip, zstd, brotli)
- ✅ TLS connection policies
- ✅ Route ordering system
- ✅ High-level helper functions
- ✅ 294 unit tests + 51 integration tests
- ✅ > 95% code coverage

### Features

- ✅ Zero runtime dependencies (only peer dependency: zod)
- ✅ Dual ESM/CJS output for compatibility
- ✅ Type-safe with full TypeScript support
- ✅ Idempotent route operations
- ✅ Automatic timeout handling
- ✅ Rich error messages with context
- ✅ 100% test coverage for route builders and schemas

[0.3.0]: https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/asd-engineering/asd-caddy-api-client/releases/tag/v0.1.0
