# Dependency Versions

This file tracks the upstream versions used to generate types and schemas.

## Version Compatibility Matrix

Which npm package version supports which Caddy and plugin versions:

| npm Package | Caddy    | caddy-security | go-authcrunch | Notes                                                                                           |
| ----------- | -------- | -------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| 0.8.1       | v2.11.4  | v1.1.64        | v1.1.41       | Current — security-focused patch bump, adds `caddy-dns` DNS provider plugin sources (see below) |
| 0.6.0–0.8.0 | v2.11.2  | v1.1.59        | v1.1.35       | —                                                                                               |
| 0.4.0–0.5.2 | v2.10.2  | v1.1.31        | v1.1.7        | First plugin framework release                                                                  |
| 0.3.0       | v2.10.2  | —              | —             | Self-contained type generation                                                                  |
| 0.1.0–0.2.2 | external | —              | —             | Used caddy-json-types package                                                                   |

## Core Caddy

| Component | Version | Commit   | Updated    |
| --------- | ------- | -------- | ---------- |
| Caddy     | v2.11.4 | e2eee6a7 | 2026-08-11 |

**Source:** `local/caddy` (git repository)
**Generated files:** `src/generated/caddy-*.ts`, `src/generated/caddy-*.zod.ts`

**v2.11.2 → v2.11.4 notes:** additive only — no removed JSON fields. New optional
fields: `checksum` (zstd encoder), `otlp` + `stream_buffer_size` (reverse_proxy), new
`SystemCAPool`/`CombinedCAPool` TLS CA-pool types. Includes 2 upstream security fixes
(logic-only, no schema impact): `GHSA-vcc4-2c75-vc9v` (templates XSS via `stripHTML`),
`GHSA-j8px-rmrx-76h9` (rewrite handler placeholder re-expansion disclosure). A Caddy-internal
refactor moved `LoggableHTTPHeader`/`LoggableStringArray` into an unexported `internal`
package — `resolve-cross-refs.ts` can't follow it, so `caddy-http.ts` now carries an
`⚠ Unresolved` warning for those two (logging-only) types; harmless, degrades to `any`.
Tygo's known comment-merging artifact (see `CHANGELOG.md`'s `[0.6.0]` notes for the first
occurrence) recurred in 3 files this round too (`caddy-auth.ts`, `caddy-reverseproxy.ts`,
`caddy-tls.ts`) — always run
`npm run typecheck` right after regen and fix any `Property or signature expected` errors
by hand before trusting the output.

## Plugins

| Plugin         | Version | Source               | Updated    |
| -------------- | ------- | -------------------- | ---------- |
| caddy-security | v1.1.64 | local/caddy-security | 2026-08-11 |
| go-authcrunch  | v1.1.41 | local/go-authcrunch  | 2026-08-11 |

**v1.1.59 → v1.1.64 notes:** caddy-security's own exported struct shape is unchanged
(zero `json:"..."` tag diffs) — `caddy-security.ts`/`.zod.ts` regenerate byte-identical.
The real work is in the go-authcrunch bump it pulled in: OAuth JWT issuer/audience
validation, signature verification before claim merge, constant-time nonce comparison,
OAuth state-manager memory bounding, session-cache race fix, authz bypass/path hardening,
cookie-domain fix, trusted-redirect hardening — adds 3 new optional fields in
`pkg/idp/oauth` (`issuer`, `pkce_disabled`, `access_token_audience`), otherwise additive
only.

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

## DNS Provider Plugins

`src/plugins/caddy-dns/` builds typed `providerConfig` for the `caddy-dns/*` ACME-DNS
challenge modules. The real JSON-tagged struct each `caddy-dns/*` wrapper uses lives in
the `libdns/*` package it embeds (`type Provider struct{ *libdns.Provider }`) — the
wrapper repos themselves are not vendored except `caddy-dns/route53`, whose wrapper adds
one extra field (`debug_logging`) of its own on top of the embedded `libdns/route53`
fields.

| Package                     | Upstream module                  | Version/commit                       | Updated    |
| --------------------------- | -------------------------------- | ------------------------------------ | ---------- |
| `local/libdns-porkbun`      | `github.com/libdns/porkbun`      | `v1.1.0`                             | 2026-08-11 |
| `local/libdns-cloudflare`   | `github.com/libdns/cloudflare`   | `v0.2.2`                             | 2026-08-11 |
| `local/libdns-route53`      | `github.com/libdns/route53`      | `v1.6.2`                             | 2026-08-11 |
| `local/libdns-digitalocean` | `github.com/libdns/digitalocean` | no tags — pinned to commit `dfa7af5` | 2026-08-11 |
| `local/libdns-godaddy`      | `github.com/libdns/godaddy`      | `v1.1.0`                             | 2026-08-11 |
| `local/caddy-dns-route53`   | `github.com/caddy-dns/route53`   | `v1.6.2`                             | 2026-08-11 |

**Generated files:** `src/generated/plugins/caddy-dns-{porkbun,cloudflare,digitalocean,godaddy}.ts`/`.zod.ts`, `caddy-dns-route53-libdns.ts`/`.zod.ts`, `caddy-dns-route53-wrapper.ts`/`.zod.ts`
**Hand-written builders:** `src/plugins/caddy-dns/`

**Known tygo artifacts, hand-excluded in `src/plugins/caddy-dns/{types,schemas}.ts`:**
`caddy-dns-digitalocean.ts`'s generated `Provider` interface carries a spurious `Client`
field (an all-unexported Go embed that emits nothing in real JSON); `caddy-dns-route53-wrapper.ts`'s generated `Provider` carries a spurious `Provider` field (the
cross-module `*route53.Provider` embed, mapped to `unknown`/`any` since tygo can't follow
a pointer embed across separate Go modules — see `local/caddy-dns-route53/tygo.yaml`).

### Adding a Provider

1. Find the real struct: `caddy-dns/<provider>` on GitHub almost always just embeds
   `*libdns.Provider` — the actual JSON-tagged struct is in `github.com/libdns/<provider>`.
2. Clone it: `git clone git@github.com:libdns/<provider>.git local/libdns-<provider>`,
   checkout the target tag/commit.
3. Add `local/libdns-<provider>/tygo.yaml`:
   ```yaml
   packages:
     - path: "github.com/libdns/<provider>"
       output_path: "../../src/generated/plugins/caddy-dns-<provider>.ts"
   ```
4. Add an entry to the `plugins` array in `scripts/generate-plugin-types.ts`.
5. Run `npm run generate:plugin-types`, then `npm run typecheck` immediately — tygo has a
   known comment-merging artifact (turns a field's trailing Go doc comment into a
   malformed `//` line comment that swallows the next field's `/**` opener, causing a
   real TS syntax error) that recurs on nearly every regen; fix any
   `Property or signature expected` errors by hand (see the `[0.6.0]`/`[0.8.1]`
   `CHANGELOG.md` notes for worked examples) before trusting the output.
6. Add the config interface to `src/plugins/caddy-dns/types.ts`, schema to `schemas.ts`,
   a `build<Provider>DnsConfig()` builder, a case in `buildAcmeDnsProviderConfig`'s
   switch, and a row to `docs/plugins/caddy-dns/README.md`'s provider table.
7. Update this file with the new version info.
8. `npm run typecheck && npm run lint && npm run test` to verify.

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
