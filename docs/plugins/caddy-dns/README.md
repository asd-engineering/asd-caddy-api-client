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

| Provider       | Module ID (`dns.providers.<name>`) | `providerConfig` fields             | Env var(s)                                                                                                             |
| -------------- | ---------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `porkbun`      | `dns.providers.porkbun`            | `api_key`, `api_secret_key`         | `PORKBUN_API_KEY`, `PORKBUN_API_SECRET_KEY`                                                                            |
| `cloudflare`   | `dns.providers.cloudflare`         | `api_token`                         | `CLOUDFLARE_API_TOKEN`                                                                                                 |
| `route53`      | `dns.providers.route53`            | _(none — AWS SDK credential chain)_ | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`                                                             |
| `digitalocean` | `dns.providers.digitalocean`       | `auth_token`                        | `DIGITALOCEAN_API_TOKEN`                                                                                               |
| `godaddy`      | `dns.providers.godaddy`            | `api_token`                         | `GODADDY_API_TOKEN` — value is GoDaddy's own combined `"<API_KEY>:<API_SECRET>"` format, **not** two separate env vars |

`route53` has no `providerConfig` interface: `caddy-dns/route53` resolves credentials via
the AWS Go SDK v2's own default credential chain (env vars, shared profile, or IAM role).
This package does not reimplement that resolution — `buildRoute53DnsConfig()` only
documents which env vars matter.

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

### 0.8.0 (Current)

- Initial typed integration: 5 providers (porkbun, cloudflare, route53, digitalocean,
  godaddy), closing the "Scope tension" noted in v0.7.1's `CHANGELOG.md`.

## Notes

- Field names were verified against each plugin's own GitHub README/source on
  2026-08-11 — re-verify before relying on them if a plugin's config shape changes
  upstream.
- `providerConfig.name` and `providerConfig.module` are reserved by `buildAcmeDnsPolicy`
  (it throws if either is present) — none of the 5 providers' own fields collide with
  those keys.
- Adding a 6th provider: add a config interface to `types.ts`, a Zod schema to
  `schemas.ts`, a `build<Provider>DnsConfig()` builder, a case in
  `buildAcmeDnsProviderConfig`'s switch, and a row to the table above.

## References

- https://github.com/caddy-dns/porkbun
- https://github.com/caddy-dns/cloudflare
- https://github.com/caddy-dns/route53
- https://github.com/caddy-dns/digitalocean
- https://github.com/caddy-dns/godaddy
- `src/caddy/acme.ts` — `buildAcmeDnsPolicy`, `ACME_DNS_PROVIDER_MODULE_MAP`,
  `resolveAcmeDnsProviderModule`
