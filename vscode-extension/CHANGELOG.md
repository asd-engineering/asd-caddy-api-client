# Changelog

All notable changes to the Caddy Configuration Tools extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2025-01-21

### Added

- **Context-aware IntelliSense** - Completions now understand where you are in your configuration:
  - Route properties (`@id`, `match`, `handle`, `terminal`, `priority`) inside route objects
  - Match fields (`host`, `path`, `method`, `header`, `query`, `protocol`) inside match arrays
  - HTTP methods (`GET`, `POST`, `PUT`, etc.) inside method arrays
  - Handler-specific fields based on the current handler type (e.g., `upstreams` for `reverse_proxy`)
  - Enum values for `selection_policy`, `encodings`, and `protocol` fields

- **17 caddy-security templates** backed by validated tests:
  - Identity stores: Local, LDAP
  - Identity providers: GitHub, Google, Keycloak, Okta, Auth0
  - Portals: Basic, with cookie config, with SSO
  - Policies: Basic, admin-only, with bypass paths
  - Routes: Auth portal, protected routes
  - Full setups: Complete local auth, complete OIDC auth

- **58 TypeScript/JavaScript snippets** (41 builder functions + 17 templates)

- **Professional documentation** with feature tables, snippets reference, and examples

### Changed

- Snippet generation now uses templates as single source of truth
- All security snippets are validated by tests before shipping

## [0.1.0] - 2025-01-15

### Added

- Initial release
- JSON Schema validation for Caddy configuration files:
  - `*.caddy.json` - Route configurations
  - `*.caddy-server.json` - Full server configurations
  - `*.caddy-security.json` - Security plugin configurations
  - `*.caddy-security-portal.json` - Authentication portals
  - `*.caddy-security-policy.json` - Authorization policies
- Handler type completions (`reverse_proxy`, `file_server`, `static_response`, etc.)
- Hover documentation with links to official Caddy docs
- CodeLens for quick documentation access
- 11 JSON snippets for common configurations
- 41 TypeScript/JavaScript builder snippets
- Configuration wizards:
  - Route Configuration Wizard
  - Security Configuration Wizard
- Diagnostics for real-time validation errors

[0.1.5]: https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.1.0...v0.1.5
[0.1.0]: https://github.com/asd-engineering/asd-caddy-api-client/releases/tag/v0.1.0
