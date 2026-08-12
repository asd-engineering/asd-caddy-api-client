# Agent Instructions

Rules and guidelines for AI agents working on `@accelerated-software-development/caddy-api-client` —
a TypeScript client for the Caddy Admin API (Zod-validated route/config builders, MITMproxy
integration, `caddy-security`/go-authcrunch plugin support) with a companion VSCode extension that
consumes the library's generated metadata. Maintained by [asd.host](https://asd.host).

## Commands: Always Use `just`

Never run `bun run <script>`, `npm run <script>`, or raw `tsc`/`eslint`/`vitest` directly — use the
Justfile recipes so behavior stays reproducible across agents and CI.

| Task                      | Recipe                                             |
| ------------------------- | -------------------------------------------------- |
| Install deps              | `just install`                                     |
| Build                     | `just build`                                       |
| Unit tests                | `just test`                                        |
| Integration tests (Caddy) | `just test-integration` (auto-starts docker infra) |
| Full test suite           | `just test-all`                                    |
| Typecheck                 | `just typecheck`                                   |
| Lint                      | `just lint`                                        |
| Format                    | `just format` / `just format-check`                |
| All quality checks        | `just check` (format-check, lint, typecheck, test) |
| Everything CI runs        | `just ci` (`check` + `build`)                      |
| VSCode extension tests    | `just vscode-test`                                 |
| VSCode extension package  | `just vscode-build`                                |

`npm run generate:*`, `sync:*`, and `docs:*` (type/plugin/schema generation, TypeDoc) have no
Justfile recipe yet — those still run via `bun run generate:all` etc. Don't add ad-hoc shell
wrappers for them; if you need a recipe, add it to the `Justfile`.

Pre-commit hook (`.husky/pre-commit`) already runs changelog-check, `format:check`, `lint`,
`typecheck`, and `test` — a red pre-commit means one of those failed, not a hook bug.

## CI Gates & PR Rules

CI (`.github/workflows/ci.yml`) runs: **lint, typecheck, unit-tests, integration-tests,
caddy-security-tests, vscode-extension-tests, build**. All must be green.

- **Never merge a PR until every CI check is green.**
- **Never run `npm publish` or create a release tag without the user's explicit go-ahead each
  time.** Version/changelog bumps land in the PR by hand; no `standard-version`, no auto-tagging.
- The VSCode extension (`vscode-extension/`) is versioned **independently** — its own
  `package.json`/`CHANGELOG.md`. Never couple its version number to the main package's, and don't
  bump the main package version for a release with no functional library changes.
- No `Co-Authored-By` lines in commit messages.

## Type Safety: No `any`

`any` is prohibited unless explicitly justified with a comment.

```typescript
// ❌ const data: any = response.json();
// ✅ const data: unknown = response.json();  // then narrow with a type guard
// ⚠️ // any required: Go interface{} with no schema, validated at runtime
const dynamicConfig: any = parsePluginConfig();
```

- **Generated files** (`src/generated/**`) may contain `any` from tygo's cross-package references —
  document it in the file header, then wrap it with a proper type in `src/plugins/*/types.ts`
  before it's ever exposed in the public API.
- **Zod schemas** — use `z.unknown()` or `z.record()` instead of `z.any()`; prefer a defined shape
  over either.
- Enforced by `@typescript-eslint/no-explicit-any` (`error` outside `src/generated/`, `off` inside
  it — see `eslint.config.mjs`). If you must bypass it, justify inline:
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>`.

### Type Composition Pattern

```typescript
// 1. Import generated type, 2. compose over the `any` field, 3. export only the composed type
import type { Config as GeneratedOAuthConfig } from "../../generated/plugins/authcrunch-oauth";
import type { LoginIcon } from "../../generated/plugins/authcrunch-icons";

export interface OAuthConfig extends Omit<GeneratedOAuthConfig, "login_icon"> {
  login_icon?: LoginIcon;
}
```

## Code Generation Pipeline

```
bun run generate:types         # Go → TypeScript (tygo)
bun run generate:plugin-types  # caddy-security plugin types
bun run generate:extension     # extract JSDoc/builder metadata → src/generated/extension-assets.ts
bun run generate:json-schemas  # Zod → JSON Schema → src/generated/schemas/*.json
bun run generate:all           # all of the above, in order
```

When adding a builder: write it with JSDoc (`@description`, `@default`, `@example`), then
`bun run generate:extension` — it appears automatically in extension snippets/completions/hover
docs. Don't hand-maintain duplicate docs in `vscode-extension/`.

## Security Considerations

- **Caddy v2.11+ admin API (CVE-2026-27589)** enforces `Origin` header checks; Node/Bun's `fetch`
  sends an empty `Origin` and gets a 403. `CaddyClient` sends an explicit `Origin` derived from the
  admin URL — don't remove it. When Docker-mapping the admin port (e.g. `2020:2019`), the Caddyfile
  admin block needs `origins` listing both host and container ports/hostnames.
- **`caddy-security` LDAP `search_user_filter`**: the JSON admin API takes a literal `%s`
  placeholder, _not_ `{username}` — the Caddyfile parser converts `{username}` → `%s`, but the
  admin API bypasses that parser. See the auto-conversion in `src/plugins/caddy-security/builders.ts`.
- Never commit `.env*` files — they're gitignored, keep them that way. Don't add secrets to test
  fixtures or docker-compose files under `tests/integration/`.

## VSCode Extension Synergy: Single Source of Truth

The extension is a **thin view**: it imports `BUILDER_METADATA`/`HANDLER_METADATA` from
`@asd/caddy-api-client/extension-assets` rather than duplicating types, docs, or snippets.

| Source               | Extracted to                        | Used for                  |
| -------------------- | ----------------------------------- | ------------------------- |
| JSDoc `@description` | `BUILDER_METADATA.description`      | Hover docs, snippets      |
| JSDoc `@default`     | `BUILDER_METADATA.params[].default` | Snippet placeholders      |
| JSDoc `@example`     | `BUILDER_METADATA.example`          | Hover documentation       |
| Builder signatures   | `BUILDER_METADATA.params`           | Wizard steps, completions |
| Handler interfaces   | `HANDLER_METADATA`                  | Autocomplete, docs links  |
| Zod schemas          | `src/generated/schemas/*.json`      | JSON validation in editor |

Key files: `src/plugins/caddy-security/builders.ts`, `src/caddy/routes.ts`, `src/types.ts`,
`src/schemas.ts` (sources) → `src/generated/extension-assets.ts`, `src/generated/schemas/*.json`
(generated, via `scripts/extract-metadata.ts` / `scripts/generate-json-schemas.ts`).

Rules: don't duplicate metadata that already exists in the library; regenerate
(`bun run generate:extension`) after modifying builders; improve JSDoc in the library, not in
extension-side docs.

## Tested Templates Rule

Every `caddy-security` VSCode snippet must be backed by a validated template — never add a snippet
directly to a JSON file.

1. Add the template to `src/plugins/caddy-security/templates.ts`, including a `build()` that calls
   real builders.
2. `just test` runs `src/__tests__/templates.test.ts`, which asserts `build()` produces valid
   config for every template.
3. `cd vscode-extension && npm run generate-snippets` regenerates
   `vscode-extension/snippets/caddy-builders.json` (generated — don't edit directly) from
   `templates.ts`.

This guarantees snippets can't drift from the actual builder API: if a builder signature changes,
`templates.test.ts` fails before a bad snippet ever ships.

## Changelog Rule

Enforced by the pre-commit hook (`scripts/check-changelog.sh`): if a package version changes,
its changelog must change in the same commit.

| Package          | Version file                    | Changelog file                  |
| ---------------- | ------------------------------- | ------------------------------- |
| Main library     | `package.json`                  | `CHANGELOG.md`                  |
| VSCode extension | `vscode-extension/package.json` | `vscode-extension/CHANGELOG.md` |

Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (`### Added` / `Changed` / `Fixed` /
`Removed` under a `## [x.y.z] - YYYY-MM-DD` heading).
