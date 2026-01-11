# Dependency Versions

This file tracks the upstream versions used to generate types and schemas.

## Core Caddy

| Component | Version | Commit   | Updated    |
| --------- | ------- | -------- | ---------- |
| Caddy     | v2.10.2 | a6da1acd | 2026-01-11 |

**Source:** `local/caddy` (git repository)
**Generated files:** `src/generated/caddy-*.ts`, `src/generated/caddy-*.zod.ts`

## Plugins

| Plugin         | Version | Source               | Updated    |
| -------------- | ------- | -------------------- | ---------- |
| caddy-security | v1.1.31 | local/caddy-security | 2026-01-11 |

**Source:** `local/caddy-security` (git repository)
**Generated files:** `src/generated/plugins/caddy-security.ts`, `src/generated/plugins/caddy-security.zod.ts`
**Hand-written builders:** `src/plugins/caddy-security/`

## Handler Name Mapping

The caddy-security plugin registers the following Caddy modules:

| Module ID                                  | Handler/Provider                     | Description                     |
| ------------------------------------------ | ------------------------------------ | ------------------------------- |
| `http.handlers.authenticator`              | `handler: "authenticator"`           | Portal handler serving login UI |
| `http.authentication.providers.authorizer` | Provider in `authentication` handler | Token validation provider       |

Note: The `authorize` directive creates a standard Caddy `authentication` handler with the caddy-security `authorizer` provider configured.

## Regenerating Types

When updating Caddy types:

1. Update `local/caddy` to target version:

   ```bash
   cd local/caddy
   git fetch --tags
   git checkout v2.x.x
   ```

2. Run type generation:

   ```bash
   npm run generate:types
   ```

3. Update this file with new version info

4. Commit all changes together

## Updating Plugins

When updating caddy-security:

1. Update `local/caddy-security` to target version:

   ```bash
   cd local/caddy-security
   git fetch --tags
   git checkout v1.x.x
   ```

2. Verify module IDs match current types:

   ```bash
   grep -rn "CaddyModule()" local/caddy-security/*.go
   ```

3. Update types/schemas in `src/plugins/caddy-security/` if needed

4. Update this file with new version info

5. Run tests to verify:

   ```bash
   npm run typecheck && npm run test
   ```

## Adding a New Plugin

1. Clone plugin source to `local/<plugin-name>`
2. Create `local/<plugin-name>/tygo.yaml` configuration
3. Add plugin to `scripts/generate-plugin-types.ts`
4. Run `npm run generate:plugin-types` to generate TypeScript types
5. Analyze Go source for module IDs: `grep -rn "CaddyModule()" local/<plugin-name>/*.go`
6. Create hand-written builders in `src/plugins/<name>/` (types, schemas, builders, index)
7. Export from `src/plugins/index.ts`
8. Add entry to the Plugins table above
9. Run `npm run typecheck && npm run test` to verify
