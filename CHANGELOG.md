# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.10.0](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.9.0...v0.10.0) (2026-08-12)

Closes the test-coverage gaps identified right after 0.9.0 shipped: several real bugs in that
release were found only because someone happened to manually review `completion.ts`'s
context-detection logic by hand, since nothing else exercised it — the vscode-extension's
Playwright suite can't reliably render VS Code's suggest widget in headless CI, so logic bugs
there had no automated way to surface. This release applies the same fix (extracting pure logic
into `vscode`-free modules with direct Vitest coverage, the pattern `completion-data.ts` already
used) to every other vscode-extension file with the same shape of risk, and adds a completeness
check for the specific class of bug that made 0.9.0's `queryOps` fix invisible in the editor.

### Added

- **`scripts/check-changelog-structure.ts`** — a structural sanity check for `CHANGELOG.md`/
  `vscode-extension/CHANGELOG.md`, wired into the existing pre-commit changelog check. Verifies
  version headers parse as valid semver/dates, versions strictly decrease top-to-bottom (catching
  duplicates for free), dates are non-increasing top-to-bottom (same-day releases allowed), and a
  header's own compare-link (when present) actually points at its own version. Born from a real
  incident this session — a corrupted concurrent-session edit inserted this release's `queryOps`
  description into the historical `[0.3.0]` section and altered its date, undetected until found by
  hand. Verified against four synthetic corruptions of the real file (duplicate version, out-of-order
  version, mismatched compare-link, invalid date) — all caught. Honestly documented limitation: the
  exact historical incident's date change isn't caught by date-ordering alone, since it happened to
  tie with a neighboring date rather than exceed it (ties are allowed — same-day multi-releases are
  real in this project's history).
- **Direct unit test coverage for vscode-extension logic that was previously only reachable
  through (unreliable) Playwright E2E tests, or not tested at all**:
  - `diagnostics.ts`'s hand-rolled JSON-Schema validator (`SimpleSchemaValidator`) — previously had
    **zero** test coverage of any kind, not even E2E. Extracted to `schema-validator.ts`.
  - `diagnostics.ts`'s JSON-path-to-document-range logic (`findPathRange`/`parseJsonPath`/
    `escapeRegex`) — extracted to `path-range-finder.ts`, returning plain character offsets instead
    of `vscode.Range` so it no longer needs a real `vscode.TextDocument` to test.
  - `completion.ts`'s context-detection logic (`detectContext` and its path-matching helpers) —
    extracted to `completion-context.ts`. Every test case traces back to a real bug 0.9.0's xhigh
    code review found in this exact logic (nested `not` matchers, the `protocol` enum leaking into
    an unrelated field, `selection_policy`/`encodings` keyed by the wrong JSON field, root-property
    completions firing on any JSON file).
  - The Route/Security Configuration Wizards' pure config-generation functions — extracted to
    `route-config-generator.ts` and `security-config-generator.ts`.
  - 133 new tests total.
- **`src/__tests__/handler-schema-json-completeness.test.ts`** — diffs every `KnownCaddyHandlerSchema`
  member's real Zod field set against the generated editor JSON schema's `properties` for that same
  handler. Catches the specific bug class that made 0.9.0's `queryOps` fix invisible in the editor:
  the runtime shape was corrected, but the field was never actually added to `RewriteHandlerSchema`
  itself, so the fix had zero effect on what the editor validated against.
  `schema-strictness-audit.test.ts` only catches a field becoming too _permissive_; this catches the
  opposite direction, a field going missing entirely.
- **`src/__tests__/fuzz/` — a differential fuzz-testing harness** (`bun run test:fuzz`, new CI job
  "Differential Fuzz Tests"). Mutates known-valid matcher/handler/caddy-security configs (typo a
  field, add an unknown key, wrong type on an existing field, remove a required field) and asserts
  the Zod schema, the generated editor JSON schema (via `ajv`), and — for matchers/handlers — the
  real `caddy validate` binary all agree on whether the mutation is valid. Verified the harness
  actually catches bugs, not just passes trivially: temporarily reintroduced the `upstream`/
  `upstreams` typo bug and confirmed it flagged the resulting disagreement before reverting. A real
  finding while building it: `caddy validate` itself panics (a nil-pointer dereference in
  `ResolveRuntimeAppConfig`) when provisioning a `caddy-security` app — confirmed against the
  `androw/caddy-security:2.11.2_1.1.59` image used by this project's own integration tests, which is
  exactly why those tests use `docker-compose up` + the Admin API instead of the CLI. Caddy-security
  schema checks are Zod-vs-`ajv` only as a result; matchers and the four handlers covered so far
  (`reverse_proxy`, `rewrite`, `static_response`, `subroute`) get the full three-way check. Currently
  covers all matchers, a representative slice of 4 handlers, and 8 caddy-security schemas (140
  mutations, 167 tests) — the remaining ~17 handlers are a mechanical follow-up using the same seed
  pattern, not a new architecture.

### Fixed

- **`diagnostics.ts`'s filename-to-schema matching silently misrouted portal/policy files** —
  `basename.includes("caddy-security")` was checked before the `portal`/`policy` checks, so a
  filename like `auth.caddy-security-portal.json` (the exact pattern `package.json`'s own
  `jsonValidation` contribution maps to the portal schema) also contains the substring
  `"caddy-security"` and was matched by the wrong, earlier branch — silently validating portal/policy
  files against the generic security-config schema instead of their own. Found while adding unit
  tests for this method, which had no coverage before. Reordered so the more specific patterns are
  checked first.
- **A dead tautological ternary in the Security Wizard's identity-store generator** —
  `driver: store.type === "oauth2" || store.type === "oidc" ? store.type : store.type` always
  evaluated to `store.type` regardless of the condition (harmless in outcome, but confusing dead
  logic). Simplified to `driver: store.type` while extracting this function for testing.
- **The subroute strictness gap documented in 0.9.0's "Known limitations" is resolved.** A typo'd or
  unmodeled handler field nested inside a `subroute` handler's `routes` (e.g. `reverse_proxy`'s
  `upstream`/`upstreams` typo, one level below the top of a route) is now flagged in the editor,
  same as at the top level, at any nesting depth. Root cause turned out to be two separate issues
  stacked together: (1) `scripts/generate-json-schemas.ts`'s `StrictRouteSchema` never propagated
  its strictness into `SubrouteHandlerSchema.routes`, which still pointed at the loose,
  passthrough `CaddyRouteSchema` from `src/schemas.ts` — fixed by making the strict schemas
  properly self-referential (`StrictKnownCaddyHandlerSchema`/`StrictSubrouteHandlerSchema`/
  `StrictRouteSchema`, mutually recursive); (2) even with that fix, `zod-to-json-schema`'s
  `$refStrategy: "none"` (chosen 2026-01-12, "for better VSCode support", never actually verified)
  hit "Recursive reference detected... Defaulting to any" the moment a self-reference was
  introduced, silently discarding all strictness anyway. Switched to `$refStrategy: "root"`, which
  emits real `$ref`s into the schema's own `definitions` block — confirmed both `ajv`
  (`src/__tests__/generated-schemas.test.ts`) and VS Code's built-in JSON language service (live
  Playwright/code-server verification) resolve these correctly, meaning the original "none" choice
  was never actually necessary. Bonus: generated schema files also shrank substantially from no
  longer inlining every definition (`caddy-full-config.json`: 223KB → 121KB).

### Notes

- `vscode-extension/schemas/`, `vscode-extension/snippets/`, and `vscode-extension/LICENSE` are no
  longer committed to git — all three are pure build output (`copy-schemas`, `generate-snippets`,
  `copy-license`), regenerated identically by every `npm run build`/`test`/`package` run from
  `src/generated/schemas/` and the root `LICENSE`. Committing the copies meant every schema/template
  change had to touch two identical trees to stay in sync. `src/generated/schemas/` stays committed
  since nothing regenerates it automatically in CI.

## [0.9.0](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.8.0...v0.9.0) (2026-08-11)

Bumped from a planned `0.8.1` (dependency/security patch) to `0.9.0`: this release also ships the vscode-extension's first public Marketplace/Open VSX release and editor-side schema _strictness_ changes (e.g. `handle` items are now validated against a strict per-handler union, so a previously-silently-accepted typo like `upstream` instead of `upstreams` is now flagged) — both are new, user-facing behavior beyond what a patch version should carry.

### Security

- **Caddy upgraded from v2.11.2 to v2.11.4** — includes 2 upstream fixes: `GHSA-vcc4-2c75-vc9v` (templates XSS via `stripHTML`) and `GHSA-j8px-rmrx-76h9` (rewrite handler placeholder re-expansion disclosure). Both are logic-only fixes with no JSON schema impact.
- **caddy-security upgraded from v1.1.59 to v1.1.64** (pulling in go-authcrunch v1.1.35 → v1.1.41) — caddy-security's own exported struct shape is unchanged (zero `json:"..."` tag diffs), but go-authcrunch's range is security-dense: OAuth JWT issuer/audience validation, signature verification before claim merge, constant-time nonce comparison, OAuth state-manager memory bounding, session-cache race fix, authz bypass/path hardening, cookie-domain fix, trusted-redirect hardening. Adds 3 new optional fields in `pkg/idp/oauth` (`issuer`, `pkce_disabled`, `access_token_audience`).

### Fixed

- **`CaddyRouteMatcherSchema` was silently dropping 8 real Caddy matchers** (`path_regexp`, `client_ip`, `remote_ip`, `protocol`, `tls`, `header_regexp`, `not`, `expression`) — Zod's default "strip" parsing behavior meant `.parse()` returned `success: true` while quietly deleting these fields from the output, rather than raising a validation error. Fixed by composing the schema from the already tygo-generated matcher schemas where correct, and hand-overriding the few with custom Go JSON marshaling tygo can't see (`not`, `expression`, `path_regexp`). Added `src/__tests__/matcher-schema-consistency.test.ts`, which reads the live generated Caddy source at test time so a future matcher addition fails loudly instead of silently dropping data again.
- **`queryOpsSchema`** (`src/generated/caddy-rewrite.zod.ts`, the `rewrite` handler's `query` matcher) **accepted the wrong shape** — `set`/`add`/`replace`/`rename` were generated as maps, but real Caddy rejects that (`caddy validate` reveals the true Go types: `[]rewrite.queryOpsArguments` for set/add/rename, `[]*rewrite.queryOpsReplacement` for replace). Root cause: `queryOps` is an unexported Go type, so tygo can only approximate its shape from the outside, and the approximation was wrong. Hand-corrected with a regression test asserting the old map-based shape is rejected. `RewriteHandlerSchema` (`src/schemas.ts`, both the npm client's runtime schema and the vscode-extension's editor-time schema) was still missing the `query` field entirely — the fix above corrected the shape of a field the schema never declared in the first place, so it had no visible effect until this was added too.
- **`CaddyRouteMatcherSchema`/`ExtendedRouteMatcherSchema` were still missing the real `file` matcher** (`http.matchers.file` — path existence/try_files) and `ExtendedRouteMatcherSchema.protocol` was still a stale 3-value enum (`http`/`https`/`grpc`) even though real Caddy's protocol matcher accepts any string (e.g. `http/2`, `http/3`). Both composed from the same real generated schemas (`matchFileSchema`, `matchProtocolSchema`) the other matchers already use.
- **`cookieHashSelectionSchema`** (reverse_proxy load balancing) **and `zeroSslIssuerSchema`** (TLS issuer) **were missing fields already present in the tygo-generated source** (`max_age`/`fallback`, and `validity_days`/`listen_host`/`alternate_http_port`/`cname_validation` respectively) — a stale `ts-to-zod` run had drifted out of sync with the already-correct `.ts` interfaces. Fixed by regenerating.
- **vscode-extension: completion provider offered wrong-context suggestions** (e.g. matcher fields like `host` inside an unrelated handler's nested object, producing malformed double-quoted inserts) — the context detector counted brackets across the whole document from the last `"match"`/`"handler"` occurrence, so once _any_ array in the file was still open (nearly always true past the first few lines), it stayed "inside match" for the rest of the document. Rewritten using `jsonc-parser` (the same library VS Code's own JSON language service uses) for exact JSON-path tracking instead of regex/bracket-counting. The rewrite's first pass introduced its own narrower context-scoping issues, also fixed here: match-property/method-value completions didn't fire inside a nested `not` matcher; the `protocol` enum leaked into reverse*proxy's unrelated `transport.protocol` field; and root-level route-property completions (`@id`/`match`/`handle`/...) fired at the root of \_any* JSON/JSONC file (e.g. `package.json`, `tsconfig.json`), not just recognized Caddy config filenames.
- **vscode-extension: `selection_policy` and `encodings` enum completions never fired** — `ENUM_VALUES` was keyed by the field name one level up from where the cursor actually sits (`selection_policy` instead of the real leaf key `policy`), and `encodings` is a map keyed by encoding name (never a scalar/array value position) rather than the real array field that needed suggestions (`prefer`). Both fixed by scoping enum-value detection to the real JSON path instead of a bare field-name lookup.
- **vscode-extension: E2E test harness could silently validate a stale build** — `findLatestVsix()` picked the "latest" `.vsix` via a plain lexicographic string sort, which misorders once a version's digit count changes (e.g. ranks `0.1.10` below `0.1.9`). Fixed with a numeric semver comparison.
- **vscode-extension: `caddy-server.json` rejected `@id`** — `@id` is a Caddy-wide admin-API addressing convention stripped before Go struct decoding, so it's absent from every tygo-generated schema; the composed full-config schema didn't declare it anywhere, so `additionalProperties: false` rejected it outright at the root, in `apps`/`apps.http`, in each server, and on nested routes. Fixed by declaring it explicitly at each level and by giving nested routes in a full server config the same `CaddyRouteSchema`-based treatment (matcher composition included) that a standalone `route.caddy.json` already had. Verified against real `caddy validate`.
- **vscode-extension: typo'd handler fields (e.g. `upstream` instead of `upstreams`) were silently accepted** — `caddy-route.json`'s `handle` items reused `CaddyRouteHandlerSchema`, which is deliberately `.passthrough()` so the _runtime_ npm client accepts unmodeled third-party Caddy handler modules; that same permissiveness meant the editor schema never flagged real typos on known handlers. The editor schema now validates `handle` items against `KnownCaddyHandlerSchema`'s strict per-handler discriminated union instead (the npm client's own `CaddyRouteSchema` is unchanged). Verified with `ajv` against the actual generated JSON schema, matching VS Code's own validation path — a Zod-level check alone would have missed this, since Zod's default "strip" behavior silently drops unknown keys instead of erroring.
- **`HttpMethodSchema` (used by the route method matcher) wrongly rejected valid methods** — it was a 7-value `z.enum()`, but real Caddy's method matcher accepts any string (verified: `caddy validate` accepts `CONNECT`/`TRACE`/a fully custom `PURGE` method). Loosened to `z.string()`; the public `HttpMethod` TS type keeps IDE autocomplete for common methods via a `(string & {})` union rather than narrowing what's accepted.
- **vscode-extension: no autocomplete offered for `path_regexp`, `header_regexp`, `client_ip`, or `tls` matchers** — all four are real, already-validated fields on `CaddyRouteMatcherSchema`, but the completion provider's hand-maintained property list never included them. Found by building `src/__tests__/completion-data-consistency.test.ts`, which now cross-references the extension's completion data against the real schemas on every test run. Snippet shapes verified against real `caddy validate`.

### Added

- **`src/plugins/caddy-dns/` now sourced from real vendored Go source, not READMEs** — matching `caddy-security`'s own tygo pipeline. Added 6 new `local/` checkouts (`libdns-porkbun`, `libdns-cloudflare`, `libdns-route53`, `libdns-digitalocean`, `libdns-godaddy`, `caddy-dns-route53`) generating `src/generated/plugins/caddy-dns-*.ts`/`.zod.ts` — see `DEPENDENCIES.md`'s "DNS Provider Plugins" section for exact versions/commits and the "Adding a Provider" recipe.
- This surfaced two real gaps the README-based 0.8.0 types missed:
  - **`buildCloudflareDnsConfig()`**'s schema now includes an optional `zone_token` field (real, from `libdns/cloudflare`'s `Provider.ZoneToken`) — needed when `api_token` is scoped to a single zone (Zone.DNS:Write only) and a separate account-wide Zone:Read token is required to resolve the zone ID. No signature change; purely additive schema support.
  - **`buildRoute53DnsConfig(options?)`** — route53 actually supports a full optional `providerConfig` (10 real fields from `libdns/route53`: `region`, `profile`, `access_key_id`, `secret_access_key`, `session_token`, `max_retries`, `route53_max_wait`, `wait_for_route53_sync`, `skip_route53_sync_on_delete`, `hosted_zone_id`; plus `debug_logging` from the `caddy-dns/route53` wrapper itself) that 0.8.0 didn't expose at all. The zero-arg call keeps its exact prior behavior (`{ envVars: [...] }`, no `providerConfig`, AWS SDK default credential chain) — passing any `options` now builds a typed, validated `providerConfig` instead. Not a breaking change: the new parameter is optional and additive.

### Known limitations

- **The `upstream`/`upstreams`-typo fix above doesn't reach nested `subroute` handlers.** A typo'd or unmodeled handler field is correctly flagged in the editor at the top level of a route, but the editor-time strict schema (`StrictRouteSchema` in `scripts/generate-json-schemas.ts`) can't recurse into a `subroute` handler's own `routes` — `zod-to-json-schema` bails out at the first re-entry of a self-referential schema (with this project's `$refStrategy: "none"`, chosen for broad VS Code JSON-language-service compatibility rather than `$ref`-based output) and falls back to a fully permissive node there, regardless of how the surrounding Zod schema is composed. Runtime validation via the npm client (`CaddyRouteSchema.parse(...)`, which uses real Zod recursion, not static JSON Schema) is unaffected and stays correct at any nesting depth — this is an editor-only gap, tracked in `src/__tests__/schema-strictness-audit.test.ts`'s allowlist (`handler:subroute.routes.[].handle.[]`). Fixing it for real requires switching the JSON Schema generator to a `$ref`-based strategy, which would change every generated schema file's shape and needs its own dedicated verification pass — out of scope here.

### Notes

- Tygo's known comment-merging artifact (first documented in `[0.6.0]`) recurred across this bump — turns a struct field's trailing Go doc comment into a malformed `//` line comment that swallows the next field's `/**` opener, producing a real TypeScript syntax error, not just a cosmetic issue. Hit in `caddy-auth.ts`, `caddy-reverseproxy.ts`, `caddy-tls.ts` (from the Caddy bump) and `caddy-dns-route53-libdns.ts` (from the new DNS provider generation) — all fixed by hand. Always run `npm run typecheck` immediately after any `generate:types`/`generate:plugin-types` run, before trusting the output.
- A Caddy-internal refactor moved `LoggableHTTPHeader`/`LoggableStringArray` into an unexported `internal` package that `resolve-cross-refs.ts` can't follow — `caddy-http.ts` now carries a benign `⚠ Unresolved` warning for those two (logging-only) types, degrading to `any`. Not fixed; not worth chasing for two internal logging types.
- `caddy-dns-digitalocean.ts` and `caddy-dns-route53-wrapper.ts`'s generated `Provider` interfaces each carry one spurious field (`Client`, and the cross-module `Provider` embed respectively) from tygo's handling of Go's anonymous struct embedding — hand-excluded via `.omit()`/hand-picked fields in `src/plugins/caddy-dns/{types,schemas}.ts` rather than blindly re-exported. See the doc comments there for exactly what's excluded and why.

## [0.8.0](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.7.1...v0.8.0) (2026-08-11)

### Added

- **`src/plugins/caddy-dns/`** — typed `providerConfig` builders for the `caddy-dns/*` ACME-DNS challenge provider modules, layered on top of `buildAcmeDnsPolicy`'s `providerConfig` passthrough:
  - **`buildPorkbunDnsConfig()`**, **`buildCloudflareDnsConfig()`**, **`buildRoute53DnsConfig()`**, **`buildDigitaloceanDnsConfig()`**, **`buildGodaddyDnsConfig()`** — each returns `{ providerConfig?, envVars }` for one provider. `route53` omits `providerConfig` entirely — `caddy-dns/route53` resolves credentials via the AWS Go SDK v2's own default credential chain (env vars, shared profile, or IAM role) rather than a JSON config block.
  - **`buildAcmeDnsProviderConfig(provider)`** — dispatches to the matching builder above by name, reusing `resolveAcmeDnsProviderModule`'s trim/lower-case normalisation. Unknown provider names fall back to `{ envVars: [] }` rather than throwing, so callers can still supply their own `providerConfig` passthrough for providers without a typed builder yet.
  - Field names (`api_key`/`api_secret_key` for Porkbun, `api_token` for Cloudflare/DigitalOcean/GoDaddy) were verified against each plugin's own README/source on 2026-08-11. GoDaddy's `api_token` must be its own combined `"<API_KEY>:<API_SECRET>"` format — documented loudly in `types.ts` since it's a common source of misconfiguration.
  - See `docs/plugins/caddy-dns/README.md` for the full provider table and usage example.

### Notes

- Closes the "Scope tension" flagged in v0.7.1: `buildAcmeDnsPolicy` still only builds the wrapper shape, but provider-specific config now has a typed, tested home in `src/plugins/caddy-dns/` instead of staying purely caller-supplied.

## [0.7.1](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.7.0...v0.7.1) (2026-05-08)

### Added

- **`hostMatchesPattern(host, pattern)`** — Caddy host-pattern matcher: exact, single-label leading wildcard (`*.example.com`), generic glob (`api-*.example.com`, `*-prod`, `*.api-*.example.com`). The single-label branch only fires when the tail after `*.` is a literal — compound patterns take the generic-glob path. Generic-glob `*` matches across dot-separated labels (it's `.*`, not `[^.]*`); only the single-label branch is strict.
- **`buildAcmeDnsPolicy({ subjects, dnsProvider, ca?, email?, providerConfig? })`** — emits the wrapper shape Caddy expects: `{ subjects, issuers: [{ module: "acme", challenges: { dns: { provider: { name } } }, … }] }`. The discriminator at the provider level is `name`, not `module` (the docblock cites the Caddy source for this). Common shortcuts (`cloudflare`, `porkbun`, `route53`, `digitalocean`, `godaddy`) map to module names; unknown names pass through _normalised_ (trim + lower-case). Subjects are also trimmed; empty/whitespace-only entries are rejected. `providerConfig` is an opaque passthrough — both `name` and `module` are reserved keys that throw if present.
- **`ACME_DNS_PROVIDER_MODULE_MAP`** + **`resolveAcmeDnsProviderModule(name)`** — frozen lookup that backs `buildAcmeDnsPolicy`. Resolver normalises input (trim + lower-case) before lookup; unknown names pass through normalised.
- **`filterAcmeManagedFromSkip(candidates, acmeManagedHosts)`** — drops `automatic_https.skip` entries that would shadow an external-ACME policy. Three-way check: exact lower-case match; candidate-wildcard covers ACME host; ACME-host wildcard covers candidate. Returns a fresh array.
- **`applyLocalCaInstallTrust(config, value)`** — sets `apps.pki.certificate_authorities.local.install_trust`. Idempotent. Throws when an intermediate node exists but is not an object — surfaces caller-side config corruption rather than silently retyping it. Motivating case: Windows readiness hang where Caddy's local CA triggers UAC + `certutil` on first issuance, blocking the admin API for 5–30 s.

### Notes

- These helpers were inline in asd's `modules/caddy/scripts/api.ts` and `modules/caddy/src/host-match.ts`. Moving them here closes the obvious split: pure Caddy domain logic belongs in the client.
- Scope tension: `buildAcmeDnsPolicy` builds only the wrapper shape. Provider-specific config (Cloudflare API tokens, Porkbun secret keys, …) stays caller-supplied via env vars or the `providerConfig` passthrough. A typed `src/plugins/caddy-dns/` integration is the right long-term home; the builder is permissive so callers don't block on that work.

## [0.7.0](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.6.1...v0.7.0) (2026-05-07)

### Added

- **`buildAutomationPoliciesWithInternalFallback()`** — emits a TLS `automation.policies` array terminated by an unscoped (catch-all) policy that uses Caddy's `internal` issuer. Without this terminal policy, any host not matched by a more-specific policy falls through to Caddy's default behavior — public ACME via Let's Encrypt — which always fails for tunnel/edge-fronted instances and floods the log with `obtaining certificate: ... context canceled` and `no solvers available for remaining challenges`. Exports `InternalIssuerJson` (Caddy core's `InternalIssuer` + the `module: "internal"` discriminator) and `InternalFallbackPoliciesOptions`.
- **`collectExternalHostsFromRoutes()`** — walks a Caddy `routes[]` tree (recursing into `subroute` handlers) and returns the sorted, de-duplicated set of non-internal hostnames in `match[].host[]`. Hostnames Caddy already treats as internal (`localhost`, `*.localhost`, `.localhost` suffixes, literal IPv4/IPv6) are filtered out.
- **`buildAutomaticHttpsConfig()`** — builds a Caddy `automatic_https` block (typed against the generated `AutoHTTPSConfig`) from a higher-level options object. Symmetric to `collectExternalHostsFromRoutes`: pass its output as `skip` to derive the skip list dynamically from the live route topology. Returns `undefined` when no field would be set, so callers can conditionally assign without empty objects.

### Notes

- The new builders deliberately do **not** expose any ACME-DNS / xcaddy-plugin schema. Plugin-specific config (e.g. `caddy-dns/cloudflare` provider blocks) belongs in `src/plugins/`, where the type/schema generation pipeline gives a validated representation.

## [0.6.1](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.6.0...v0.6.1) (2026-04-28)

### Added

- **`removeHostFromRoutes(hostname, server)`** — array-aware hostname removal.
  Walks **every** match group on **every** route and strips the target hostname
  from multi-host arrays. Match groups whose `host` array becomes empty are
  dropped; routes whose match arrays become empty are dropped. Returns
  `{ stripped, dropped }` so callers know how many routes were patched in
  place vs. fully removed.

  Use this when retiring a hostname from routes that share match arrays
  across multiple hostnames (e.g. `["hub.localhost", "asd.localhost",
"<tunnel-fqdn>"]`). The existing `removeRoutesByHost()` only matches
  routes whose host array is _exactly_ `[hostname]`, so it returns 0 for
  the multi-host case — leaving stale entries behind.

  Backwards compatible: `removeRoutesByHost()` is unchanged and remains
  the cheap exact-match path.

## [0.6.0](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.5.2...v0.6.0) (2026-04-01)

### Changed

- **Caddy upgraded from v2.10.2 to v2.11.2** — regenerated all core types and Zod schemas from latest Caddy source. Includes security fixes (forward_auth header stripping GHSA-7r4p-vjf4-gxv4), reverse proxy improvements (dynamic upstream tracking, passive healthchecking, proxy protocol fixes), and encode/streaming fixes.
- **caddy-security upgraded from v1.1.31 to v1.1.59** — regenerated plugin types. Authorization policies now use `access_list_rules` with conditions-based syntax instead of the previous `access_lists` with claim/values format.
- **go-authcrunch upgraded from v1.1.7 to v1.1.35** — regenerated authcrunch types.

### Added

- **Version compatibility matrix** in DEPENDENCIES.md and README — users can now see which npm package version corresponds to which Caddy and plugin versions.

### Fixed

- **tygo generation artifacts** — fixed 3 instances where Go-to-TypeScript conversion produced broken inline comments that caused TypeScript compilation errors (caddy-auth.ts, caddy-reverseproxy.ts, caddy-tls.ts).
- **Caddy v2.11+ admin API origin enforcement** — CaddyClient now sends an explicit `Origin` header derived from the admin URL, preventing 403 Forbidden errors caused by CVE-2026-27589 origin checking.
- **LDAP search filter placeholder** — `buildLdapIdentityStore()` now auto-converts Caddyfile-style `{username}` to `%s` in `search_user_filter`, fixing 500 errors when adding LDAP stores via the admin API.
- **Config response logging validation** — `getConfig()` no longer fails on Caddy's logging config where Go embedded structs are flattened in JSON.

## [0.5.2](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.5.1...v0.5.2) (2026-03-14)

### Added

- **`projectId` option across all route builders** — new optional `projectId` field in `ServiceRouteOptions`, `HealthCheckRouteOptions`, `HostRouteOptions`, `PathRouteOptions`, and their Zod schemas. When set, adds `X-ASD-Project` response header identifying which project's Caddy handled the request. Enables cross-project routing detection in multi-project tunnel environments.
- **`buildProjectIdHeadersHandler()`** — new exported builder for `X-ASD-Project` response header, following the same pattern as `buildIngressTagHeadersHandler()`.
- **`projectId` in high-level helpers** — `createHealthRoute()`, `createServiceRoute()`, and `createBasicAuthRoute()` all accept optional `projectId` and include it in their response headers.

### [0.5.1](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.5.0...v0.5.1) (2026-03-02)

### Changed

- Add Yarn Classic package reference in README and installation instructions.
- Add `asd.host` as the package maintainer website in package metadata and README.

## [0.5.0](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.4.3...v0.5.0) (2026-03-01)

### Added

- **`dial` option in `buildHealthCheckRoute()`** — when provided, generates a `reverse_proxy` handler with X-Forwarded headers instead of `static_response`. Enables real health checks that verify the upstream is responding. Without `dial`, behavior is unchanged (backward compatible).

### Changed

- **`X-ASD-Instance` header renamed to `X-ASD-Service-ID`** — affects `buildHealthCheckRoute()` and `createHealthRoute()`. Aligns with the `X-ASD-Service-ID` header already used in service routes via `buildServiceMetadataHeadersHandler()`.

### [0.4.3](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.4.2...v0.4.3) (2026-02-12)

### Fixed

- **Path route matcher double-star bug** — `buildPathRoute()` appended `*` to every path unconditionally, turning paths like `/api/*` into `/api/**`. Caddy's path matcher treats `*` as single-segment only, so `/api/**` matched `/api/foo` but NOT `/api/v1/resource`. Now checks if path already ends with `*` before appending.

### [0.4.2](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.4.1...v0.4.2) (2026-02-11)

### Added

- **`flushInterval` option** in `buildReverseProxyHandler()`, `buildHostRoute()`, `buildPathRoute()`, and `buildServiceRoutes()` — set to `-1` to disable response buffering for WebSocket/SSE streaming. Opt-in pass-through from `ServiceRouteOptions` to the underlying reverse proxy handler.

### [0.4.1](https://github.com/asd-engineering/asd-caddy-api-client/compare/v0.4.0...v0.4.1) (2026-02-09)

### Changed

- **Package size reduced by ~80%** (5.1 MB → ~1 MB unpacked)
  - Removed source maps from published package
  - Dropped CJS format (ESM-only, package already requires Node >= 18)
  - Enabled minification for JS bundles
  - Disabled declaration maps in tsconfig

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
