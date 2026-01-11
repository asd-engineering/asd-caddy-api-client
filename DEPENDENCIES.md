# Dependency Versions

This file tracks the upstream versions used to generate types and schemas.

## Core Caddy

| Component | Version | Commit   | Updated    |
| --------- | ------- | -------- | ---------- |
| Caddy     | v2.10.2 | a6da1acd | 2026-01-11 |

**Source:** `local/caddy` (git repository)
**Generated files:** `src/generated/caddy-*.ts`, `src/generated/caddy-*.zod.ts`

## Plugins

| Plugin         | Version | Source              | Updated    |
| -------------- | ------- | ------------------- | ---------- |
| caddy-security | v1.1.31 | pkg.go.dev analysis | 2026-01-11 |

**Generated files:** `src/plugins/caddy-security/`

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

## Adding a New Plugin

1. Analyze plugin at pkg.go.dev or GitHub
2. Create documentation in `docs/plugins/<name>/README.md`
3. Add types/schemas in `src/plugins/<name>/`
4. Add entry to the Plugins table above
