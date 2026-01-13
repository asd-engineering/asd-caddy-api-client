# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-01-11

### Added

- **Plugin Framework** - Infrastructure for integrating Caddy plugins with type-safe builders
  - Plugin type generation pipeline: Go source → tygo → TypeScript → Zod
  - Scripts: `npm run generate:plugin-types`, `npm run sync:plugins`
  - Template for adding new plugins documented in DEPENDENCIES.md

- **caddy-security Plugin** (`src/plugins/caddy-security/`) - First official plugin integration
  - Types generated from Go source (`local/caddy-security` v1.1.31)
  - `SecurityAuthenticatorHandler` - Portal handler (`handler: "authenticator"`)
  - `SecurityAuthorizationHandler` - Token validation via authentication handler with authorizer provider
  - Builder functions: `buildAuthenticatorHandler()`, `buildAuthorizationHandler()`
  - Zod schemas for runtime validation
  - Re-exports generated types from `src/generated/plugins/caddy-security.zod.ts`

- **Plugin Type Generation Scripts**
  - `scripts/generate-plugin-types.ts` - Generate TypeScript from plugin Go source
  - `scripts/generate-caddy-types.ts` - Unified core type generation script
  - Plugin modules array in `scripts/generate-zod-schemas.ts`

- **Generated Plugin Files** (`src/generated/plugins/`)
  - `caddy-security.ts` - TypeScript types from tygo
  - `caddy-security.zod.ts` - Zod schemas from ts-to-zod

- **Authcrunch Type Generation** - Full type coverage for go-authcrunch (caddy-security dependency)
  - 22 authcrunch modules: core, authn, authz, oauth, saml, sso, acl, ids, idp, kms, etc.
  - Cross-package type references automatically resolved
  - Name conflict handling with type aliases (e.g., `Config as OauthConfig`)

- **Cross-Reference Resolver** (`scripts/resolve-cross-refs.ts`)
  - Resolves tygo's `any /* package.Type */` patterns to proper imports
  - Maps Go stdlib types (error, time.Time, big.Int) to TypeScript equivalents
  - Adds missing unexported Go types automatically
  - Handles 130+ cross-package references

- **AGENTS.md** - AI agent guidelines for type safety
  - Strict `no-any` rule enforcement
  - ESLint `@typescript-eslint/no-explicit-any` set to error

- **VSCode Extension** (`vscode-extension/`) - `vscode-caddy-tools` v0.1.0
  - JSON validation for `caddy.json`, `caddy-security.json` files
  - TypeScript/JavaScript snippets for builder patterns
  - IntelliSense: completion provider for handler types
  - Hover documentation with links to Caddy docs
  - Diagnostics provider for real-time validation
  - Code lens for quick documentation access
  - Route Configuration Wizard - interactive multi-step route builder
  - Security Configuration Wizard - guided caddy-security setup
  - 5 commands: `caddy.showHandlerDocs`, `caddy.insertRoute`, `caddy.insertSecurityConfig`, `caddy.runRouteWizard`, `caddy.runSecurityWizard`
  - Settings: `caddy.enableHoverDocs`, `caddy.showCaddyDocsLinks`, `caddy.showCodeLens`, `caddy.enableDiagnostics`
  - 22 Playwright tests for extension functionality

- **Comprehensive Authentication Integration Tests** (`src/__tests__/playwright/`)
  - OAuth flow tests with mock-oauth2-server (token lifecycle, multiple users, error scenarios)
  - Keycloak OIDC tests (authorization code flow, token refresh, userinfo)
  - LDAP identity store tests (OpenLDAP integration, group mapping)
  - SAML flow tests (SimpleSAMLphp IdP)
  - Authentik advanced tests (full OIDC provider)
  - caddy-security portal tests (local auth, two-step login, session management)
  - Security tests: token tampering detection, refresh token rotation, concurrent sessions, CSRF
  - Claims injection tests with auth-echo backend (verifies caddy-security → backend header injection)

- **Test Infrastructure** (`tests/integration/`)
  - Docker Compose stacks for OAuth, Keycloak, LDAP, SAML, Authentik, caddy-security
  - `auth-echo-server.js` - Auth-aware backend that decodes JWTs and returns claims
  - Caddyfiles for each authentication scenario
  - npm scripts: `test:oauth`, `test:keycloak`, `test:ldap`, `test:saml`, `test:authentik`, `test:caddy-security`, `test:auth:security`, `test:auth:claims`

### Changed

- **Type Generation Architecture** - Cleaner separation of generated vs hand-written code
  - Generated types in `src/generated/` (auto-generated, do not edit)
  - Hand-written builders in `src/plugins/` (high-level API)
  - Plugin schemas re-export from generated with handler discriminators added

- **Package Scripts**
  - `generate:types` now uses `scripts/generate-caddy-types.ts`
  - Added `generate:plugin-types` for plugin-specific generation
  - Added `generate:all` to run both core and plugin generation
  - Added `sync:plugins` to update plugin sources and regenerate

### Fixed

- **Missing Unexported Go Types** - Added `substrReplacer`, `regexReplacer`, `queryOps` to caddy-rewrite types
  - These types are unexported in Go but referenced by exported types
  - Post-processing script now injects missing type definitions

- **VSCode Extension Snippet Naming** - Fixed OAuth/OIDC/LDAP snippet prefixes and descriptions
  - Prefixes now correctly use `caddy-oauth2-provider` (not `caddy-o-auth2-provider`)
  - Descriptions now use proper acronyms: "Build OAuth2 Provider" (not "Build O Auth2 Provider")
  - Fixed double spaces in generated snippet descriptions

- **Windows Build Compatibility** - VSCode extension now builds on Windows
  - Replaced Unix `cp -r` with cross-platform `shx` in `vscode-extension/package.json`

- **CI Schema Validation** - Added Ajv-based JSON schema validation tests
  - `src/__tests__/generated-schemas.test.ts` now validates all 20 generated JSON schemas
  - Tests ensure schemas stay in sync with Zod source definitions

## [0.3.0] - 2026-01-09

### Added

- **Config File Loading Utilities** (`src/caddy/config-loader.ts`)
  - `loadConfig(path, adapter?, options?)` - Load and adapt config files with auto-detection
  - `loadCaddyfile(path, options?)` - Convenience function for Caddyfile format
  - `detectAdapter(path)` - Auto-detect adapter from file extension (.json, .yaml, .nginx, etc.)
  - `CaddyAdapter` type and `LoadConfigOptions` interface exported

- **New CaddyClient Method**
  - `applyConfig(config)` - Apply full configuration to running Caddy via `/load` endpoint
  - Enables full workflow: load → modify → apply

- **Validation Error Wrapper** (`src/utils/validation.ts`)
  - `validateOrThrow(schema, data, context?)` - Wraps Zod errors in `ValidationError`
  - All user-facing validation now throws `ValidationError` instead of raw `ZodError`
  - Contextual error messages (e.g., "buildHostRoute options: dial: Invalid format")

- **Enhanced CaddyApiError**
  - Added `url` and `method` properties for debugging
  - Error messages include full request context: `POST http://127.0.0.1:2019/load - 400 Bad Request`

- **JSDoc Documentation**
  - Added `@throws` documentation to key CaddyClient methods
  - Added `@example` to user-facing schemas: `DomainSchema`, `DialAddressSchema`, `CaddyAdapterSchema`, `CaddyRouteSchema`, `UpstreamStatusSchema`
  - Updated `validate()` helper to throw `ValidationError` with example

- **New Tests**
  - `config-loader.test.ts` - Tests for `detectAdapter()` (6 tests)
  - `validation.test.ts` - Tests for `validateOrThrow()` (10 tests)
  - Added 3 tests for `CaddyApiError` URL/method properties
  - Added 45 tests for handler-specific schemas

- **Complete Handler Zod Schemas** (`src/schemas.ts`) - 100% Caddy handler coverage (20/20)
  - Core handlers: `ReverseProxyHandlerSchema`, `HeadersHandlerSchema`, `StaticResponseHandlerSchema`, `AuthenticationHandlerSchema`, `RewriteHandlerSchema`, `EncodeHandlerSchema`, `SubrouteHandlerSchema`
  - File/template handlers: `FileServerHandlerSchema`, `TemplatesHandlerSchema`
  - Request manipulation: `MapHandlerSchema`, `PushHandlerSchema`, `RequestBodyHandlerSchema`, `VarsHandlerSchema`, `RewriteHandlerSchema`
  - Response handling: `InterceptHandlerSchema`, `CopyResponseHandlerSchema`, `CopyResponseHeadersHandlerSchema`, `ErrorHandlerSchema`
  - Observability: `TracingHandlerSchema`, `LogAppendHandlerSchema`, `InvokeHandlerSchema`
  - `KnownCaddyHandlerSchema` - Discriminated union for strict validation of all 20 handlers
  - `CaddyHandlerSchema` - Union with fallback for custom/plugin handlers (backwards compatible)
  - All handler types exported for TypeScript consumers

- **Matcher Schemas** (`src/schemas.ts`)
  - `MatchQuerySchema` - Query string parameter matching with JSDoc examples
  - `MatchHeaderSchema` - HTTP header matching with JSDoc examples
  - `CaddyRouteMatcherSchema` now references these for reusability

- **Discriminated Union Handler Types** (`src/types.ts`)
  - `CaddyRouteHandler` now uses discriminated union instead of index signature
  - All 20 handler types exported for TypeScript consumers
  - Strict type checking for known handlers, extensibility via `GenericHandler` for plugins

- **Route Priority in Types**
  - `CaddyRoute.priority` now in base type and schema
  - Removed type casts in route builders

- **Error Handling Example** (`examples/error-handling.ts`)
  - Distinguishing error types (ValidationError, CaddyApiError, NetworkError, TimeoutError)
  - Retry pattern with exponential backoff
  - Idempotent vs non-idempotent operation patterns
  - Graceful degradation when Caddy is unavailable
  - Early validation before network calls

- **Self-contained Caddy Type Generation** - Eliminated external `caddy-json-types` dependency
  - Types now generated directly from local Caddy Go source (`local/caddy`)
  - Uses [tygo](https://github.com/gzuidhof/tygo) for Go-to-TypeScript conversion
  - Automatic Zod schema generation via [ts-to-zod](https://github.com/fabien0102/ts-to-zod)
  - Generated TypeScript types across 16 modules (core, http, tls + 13 handler modules)
  - Handler modules: reverseproxy, fileserver, encode, headers, rewrite, auth, templates, map, push, requestbody, intercept, tracing, logging
  - Post-processing script fixes Go-specific types (`error` → `Error`, `bigInt` → `bigint`)

- **API Response Validation** - All client methods now validate responses with Zod
  - `getConfig()` → Returns `Config` type, validated against `configSchema`
  - `getRoutes()` → Validated with `routeResponseListSchema` (preserves `@id` fields)
  - `getServers()` → Returns `Record<string, Server>`, validated
  - `getServerConfig()` → Returns `Server` type, validated
  - `getVersion()` → Typed response with `versionResponseSchema`
  - `getUpstreams()` → Validated with new `UpstreamStatusArraySchema`
  - `adapt()` → Returns validated `Config` type

- **New Zod Schemas**
  - `UpstreamStatusSchema` - Validates upstream server status from `/reverse_proxy/upstreams`
  - `UpstreamStatusArraySchema` - Array validation for upstream endpoints
  - Re-exported generated schemas: `configSchema`, `serverSchema`, `routeSchema`, `routeListSchema`, `durationSchema`, `adminConfigSchema`, `loggingSchema`

- **Type Generation Scripts**
  - `npm run generate:types` - Regenerate TypeScript types and Zod schemas from Go source
  - `npm run sync:caddy` - Pull latest Caddy source and regenerate types

- **Generated Type Files** (`src/generated/`) - 32 files total
  - Core: `caddy-core.ts`, `caddy-http.ts`, `caddy-tls.ts`
  - Handlers: `caddy-reverseproxy.ts`, `caddy-fileserver.ts`, `caddy-encode.ts`, `caddy-headers.ts`, `caddy-rewrite.ts`, `caddy-auth.ts`, `caddy-templates.ts`, `caddy-map.ts`, `caddy-push.ts`, `caddy-requestbody.ts`, `caddy-intercept.ts`, `caddy-tracing.ts`, `caddy-logging.ts`
  - Zod schemas: `caddy-*.zod.ts` for each module above

### Changed

- **Consistent Error Types** - All user-facing validation now throws `ValidationError`
  - `CaddyClient` constructor, `addRoute()`, `patchRoutes()`, `insertRoute()`, `replaceRouteById()`, `adapt()`, `applyConfig()`
  - Domain functions: `addDomainWithAutoTls()`, `addDomainWithTls()`, `updateDomain()`, `deleteDomain()`, etc.
  - Route builders: `buildServiceRoutes()`, `buildHostRoute()`, `buildPathRoute()`, `buildLoadBalancerRoute()`, etc.

- **Improved Error Messages** - Validation errors include context about which parameter failed

- **Extended `@throws` Documentation**
  - Route builders: `buildServiceRoutes()`, `buildHealthCheckRoute()`, `buildHostRoute()`, `buildPathRoute()`, `buildLoadBalancerRoute()`, `buildBasicAuthHandler()`
  - Domain functions: `addDomainWithAutoTls()`, `addDomainWithTls()`, `updateDomain()`, `deleteDomain()`

- **Improved Type Safety**
  - `CaddyRouteHandler.transport` now properly typed with TLS configuration options
  - `providers.http_basic` includes `hash.algorithm` field
  - Removed all `as any` casts in routes.ts (2 instances eliminated)

- **Schema Architecture Reorganized** (`src/schemas.ts`)
  - Clear documentation separating generated vs custom schemas
  - Generated schemas re-exported for convenience
  - Custom business logic schemas preserved

- **ESLint Configuration**
  - Added `src/generated/**` to ignores (auto-generated files)
  - Added `scripts/**` to ignores (build scripts)

### Removed

- **External dependency**: `caddy-json-types` package no longer required
  - Types are now self-contained and synced with your local Caddy version

### Migration Guide

**No breaking changes for typical usage.** The public API remains the same.

For advanced users importing from `./caddy-types`:

- Type names are cleaner: `IConfig` → `Config`, `IModulesCaddyhttpRoute` → `Route`
- Zod schemas now available for runtime validation
- Types match your exact Caddy version in `local/caddy`

To regenerate types after updating Caddy:

```bash
npm run sync:caddy
```

## [0.2.2] - 2026-01-08

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

[0.4.0]: https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.3.1...v0.4.0
[0.3.0]: https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.2.0...v0.2.2
[0.2.0]: https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/asd-engineering/asd-caddy-api-client/releases/tag/v0.1.0
