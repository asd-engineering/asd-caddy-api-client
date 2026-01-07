# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-06

### Added

- **New CaddyClient API methods**:
  - `stop()` - Gracefully stop the Caddy server
  - `getUpstreams()` - Get reverse proxy upstream server status (health, request counts)
  - `adapt()` - Convert Caddyfile or other formats to JSON configuration
- **UpstreamStatus type** - Type definition for upstream server status
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

[0.2.0]: https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/asd-engineering/asd-caddy-api-client/releases/tag/v0.1.0
