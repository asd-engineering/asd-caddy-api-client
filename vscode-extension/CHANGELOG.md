# Changelog

All notable changes to the Caddy Configuration Tools extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-11

### Added

- **First published release** — this and all prior versions (`0.1.0`–`0.1.5`) were built and packaged locally only (`.vsix` files checked into this directory) and never actually published to the Visual Studio Marketplace or Open VSX. This release adds the publish pipeline (`.github/workflows/release-vscode.yml`) and is the first version publicly installable from either registry.
- Autocomplete for `path_regexp`, `header_regexp`, `client_ip`, `remote_ip`, `tls`, `not`, and `expression` matcher fields, and for the `CONNECT`/`TRACE` HTTP methods — previously offered no completions at all.

### Fixed

- **Completion provider rewritten** to use `jsonc-parser` (the same library VS Code's own JSON language service uses) for exact JSON-path tracking, replacing whole-document bracket/brace counting. That counting approach stayed "inside match"/"inside handler" for the rest of the document once any array anywhere was still open — nearly always true past the first few lines — so it regularly offered wrong-context suggestions (e.g. matcher fields inside an unrelated handler's nested object) and produced malformed double-quoted inserts.
- `caddy-server.json` no longer rejects `@id` — it's a Caddy-wide admin-API addressing convention stripped before Go struct decoding, so it never appeared in any generated schema; now declared explicitly at every level (root, `apps.http`, each server, nested routes).
- Typo'd handler fields (e.g. `upstream` instead of `upstreams`) are now flagged instead of silently accepted, since `handle` items validate against the strict per-handler schema rather than a permissive passthrough one.
- The `method` matcher no longer rejects non-standard HTTP methods (e.g. `CONNECT`, `TRACE`, or a custom verb) — real Caddy accepts any string there.

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
