# caddy-dns Plugin

> **Status**: Integrated

**GitHub:** https://github.com/caddy-dns
**Plugin Version:** n/a — family of independent per-provider modules, versioned individually
**Caddy Compatibility:** v2.x
**Last Analyzed:** 2026-08-11

## Overview

`caddy-dns/*` is a family of ~50+ independent Go modules (one per DNS provider) that
implement the `certmagic.DNSProvider` interface so Caddy's ACME issuer can complete
DNS-01 challenges — required for wildcard certificates (`*.example.com`), which HTTP-01
cannot issue.

Unlike `caddy-security`, this isn't a single app module with its own JSON config tree.
Each provider is registered under the core `tls.acme` app's `challenges.dns.provider`
field, discriminated by `name` (not `module` — see `src/caddy/acme.ts`'s docblock, which
cites Caddy core's `caddytls/automation.go`: `caddy:"namespace=dns.providers inline_key=name"`).

This package's `src/caddy/acme.ts` (`buildAcmeDnsPolicy`) builds that wrapper shape and
already ships `ACME_DNS_PROVIDER_MODULE_MAP` / `resolveAcmeDnsProviderModule` for the 5
providers below, but treats `providerConfig` as an untyped passthrough — that's the gap
this plugin module (`src/plugins/caddy-dns/`) closes with a typed `providerConfig` +
`envVars` builder per provider.

## DNS Provider Modules

| Provider       | Module ID (`dns.providers.<name>`) | `providerConfig` fields                                                                                                                                                                                                                                                            | Env var(s)                                                                                                             |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `porkbun`      | `dns.providers.porkbun`            | `api_key`, `api_secret_key`                                                                                                                                                                                                                                                        | `PORKBUN_API_KEY`, `PORKBUN_API_SECRET_KEY`                                                                            |
| `cloudflare`   | `dns.providers.cloudflare`         | `api_token`, `zone_token` (optional — Zone:Read token, needed when `api_token` is scoped to a single zone)                                                                                                                                                                         | `CLOUDFLARE_API_TOKEN`                                                                                                 |
| `route53`      | `dns.providers.route53`            | All optional: `region`, `profile`, `access_key_id`, `secret_access_key`, `session_token`, `max_retries`, `route53_max_wait`, `wait_for_route53_sync`, `skip_route53_sync_on_delete`, `hosted_zone_id`, `debug_logging` — omit entirely to use the AWS SDK credential chain instead | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`                                                             |
| `digitalocean` | `dns.providers.digitalocean`       | `auth_token`                                                                                                                                                                                                                                                                       | `DIGITALOCEAN_API_TOKEN`                                                                                               |
| `godaddy`      | `dns.providers.godaddy`            | `api_token`                                                                                                                                                                                                                                                                        | `GODADDY_API_TOKEN` — value is GoDaddy's own combined `"<API_KEY>:<API_SECRET>"` format, **not** two separate env vars |

`route53`'s `providerConfig` is entirely optional: `buildRoute53DnsConfig()` called with
no arguments (or `{}`) omits `providerConfig` and `caddy-dns/route53` falls back to the
AWS Go SDK v2's own default credential chain (env vars, shared profile, or IAM role) —
this package does not reimplement that resolution. Pass any subset of the fields above as
`options` to build an explicit typed `providerConfig` instead.

## JSON Configuration

### Provider config example (Cloudflare)

```json
{
  "module": "acme",
  "challenges": {
    "dns": {
      "provider": {
        "name": "cloudflare",
        "api_token": "{env.CLOUDFLARE_API_TOKEN}"
      }
    }
  }
}
```

### Building it with this package

```typescript
import { buildAcmeDnsPolicy } from "@accelerated-software-development/caddy-api-client/caddy";
import { buildAcmeDnsProviderConfig } from "@accelerated-software-development/caddy-api-client/plugins/caddy-dns";

const { providerConfig, envVars } = buildAcmeDnsProviderConfig("cloudflare");
// envVars: ["CLOUDFLARE_API_TOKEN"] — check these are set before issuing

const policy = buildAcmeDnsPolicy({
  subjects: ["example.com", "*.example.com"],
  dnsProvider: "cloudflare",
  providerConfig,
});
```

Per-provider builders (`buildPorkbunDnsConfig`, `buildCloudflareDnsConfig`,
`buildRoute53DnsConfig`, `buildDigitaloceanDnsConfig`, `buildGodaddyDnsConfig`) are also
exported directly for callers that already know the provider at compile time.

### Route53 with an explicit typed `providerConfig`

```typescript
import { buildRoute53DnsConfig } from "@accelerated-software-development/caddy-api-client/plugins/caddy-dns";

// Default: no providerConfig, relies on the AWS SDK's own credential chain
buildRoute53DnsConfig();
// => { envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"] }

// Explicit: build a typed providerConfig instead
buildRoute53DnsConfig({ hosted_zone_id: "Z1D633PJN98FT9", region: "us-east-1" });
// => { providerConfig: { hosted_zone_id: "Z1D633PJN98FT9", region: "us-east-1" }, envVars: [...] }
```

## Type Coverage

### Integration Status

- [x] Provider config types defined in `src/plugins/caddy-dns/types.ts`
- [x] Zod schemas defined in `src/plugins/caddy-dns/schemas.ts`
- [x] Builder functions in `src/plugins/caddy-dns/builders.ts`
- [x] Re-exported from `src/plugins/index.ts`
- [ ] Added to `KnownCaddyHandlerSchema` discriminated union — n/a, `providerConfig` is a
      passthrough field on the core `acme` issuer's DNS challenge, not an HTTP handler
- [x] Tests written (`src/__tests__/caddy-dns.test.ts`)
- [x] Documentation added

### Priority

| Provider       | Priority | Notes                                                          |
| -------------- | -------- | -------------------------------------------------------------- |
| `cloudflare`   | High     | Most common DNS-01 provider for wildcard TLS                   |
| `route53`      | High     | Common for AWS-hosted infra                                    |
| `porkbun`      | Medium   | asd's own default registrar                                    |
| `digitalocean` | Medium   |                                                                |
| `godaddy`      | Low      | Combined-token format is a frequent source of misconfiguration |

## Version History

### 0.8.1 (Current)

- Switched from README-verified hand-written types to a real-Go-source pipeline: 6 new
  `local/` checkouts (`libdns-porkbun`, `libdns-cloudflare`, `libdns-route53`,
  `libdns-digitalocean`, `libdns-godaddy`, `caddy-dns-route53`) generate
  `src/generated/plugins/caddy-dns-*.ts`/`.zod.ts` via tygo, matching the
  `caddy-security` plugin's own pipeline — see `DEPENDENCIES.md`'s "DNS Provider
  Plugins" section for exact versions/commits.
- Found and fixed two real gaps this surfaced: `cloudflare` gained an optional
  `zone_token` field, and `route53` gained a full optional typed `providerConfig` (10
  real fields from `libdns/route53` + `debug_logging` from the `caddy-dns/route53`
  wrapper) via a new optional `options` parameter on `buildRoute53DnsConfig()` — the
  zero-arg call keeps its exact prior behavior (no `providerConfig`, AWS SDK credential
  chain).

### 0.8.0

- Initial typed integration: 5 providers (porkbun, cloudflare, route53, digitalocean,
  godaddy), closing the "Scope tension" noted in v0.7.1's `CHANGELOG.md`. Field names
  verified against each plugin's own GitHub README/source (superseded by the real
  vendored-Go-source pipeline in 0.8.1).

## Notes

- `providerConfig.name` and `providerConfig.module` are reserved by `buildAcmeDnsPolicy`
  (it throws if either is present) — none of the 5 providers' own fields collide with
  those keys.
- Two of the 6 vendored `local/` checkouts (`libdns/digitalocean`,
  `libdns-route53`'s wrapper embed) have tygo artifacts that get hand-picked/omitted
  rather than blindly re-exported — see the doc comments on
  `DigitaloceanDnsProviderConfig` and `Route53DnsProviderConfig` in
  `src/plugins/caddy-dns/types.ts` for exactly what's excluded and why.
- Adding a 6th provider: vendor its real Go source (the `libdns/*` package it wraps, per
  `DEPENDENCIES.md`'s "DNS Provider Plugins" → "Adding a Provider" steps), add a
  `tygo.yaml`, add an entry to `scripts/generate-plugin-types.ts`, run
  `npm run generate:plugin-types`, then a config interface in `types.ts`, a Zod schema
  in `schemas.ts`, a `build<Provider>DnsConfig()` builder, a case in
  `buildAcmeDnsProviderConfig`'s switch, and a row to the table above.

## References

- https://github.com/caddy-dns/porkbun
- https://github.com/caddy-dns/cloudflare
- https://github.com/caddy-dns/route53
- https://github.com/caddy-dns/digitalocean
- https://github.com/caddy-dns/godaddy
- https://github.com/libdns/porkbun, https://github.com/libdns/cloudflare,
  https://github.com/libdns/route53, https://github.com/libdns/digitalocean,
  https://github.com/libdns/godaddy — the real JSON-tagged `Provider` structs each
  `caddy-dns/*` wrapper embeds; source of truth for `src/generated/plugins/caddy-dns-*.ts`
- `src/caddy/acme.ts` — `buildAcmeDnsPolicy`, `ACME_DNS_PROVIDER_MODULE_MAP`,
  `resolveAcmeDnsProviderModule`
- `DEPENDENCIES.md` — vendored source versions/commits, regeneration steps
