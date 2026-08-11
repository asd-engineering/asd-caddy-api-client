/**
 * caddy-dns plugin types
 *
 * Typed `providerConfig` shapes for the `caddy-dns/*` ACME-DNS challenge
 * provider modules, layered on top of {@link buildAcmeDnsPolicy} in
 * `src/caddy/acme.ts` (which only builds the wrapper shape and treats
 * `providerConfig` as an opaque passthrough).
 *
 * As of 0.8.1, these types are sourced from real vendored Go source (not
 * READMEs) via the same tygo pipeline `caddy-security` uses — see
 * `DEPENDENCIES.md`'s "DNS Provider Plugins" section for exact
 * versions/commits, and `src/generated/plugins/caddy-dns-*.ts` for the
 * machine-generated base types this module re-exports/composes.
 *
 * @see https://github.com/caddy-dns
 * @see ../../caddy/acme.ts
 */
import type { Provider as Route53LibdnsProviderConfig } from "../../generated/plugins/caddy-dns-route53-libdns.js";

export type { Route53LibdnsProviderConfig };

// Porkbun, Cloudflare, GoDaddy: the generated `Provider` interface is an
// exact match for the real JSON shape — re-exported directly.
export type { Provider as PorkbunDnsProviderConfig } from "../../generated/plugins/caddy-dns-porkbun.js";
export type { Provider as CloudflareDnsProviderConfig } from "../../generated/plugins/caddy-dns-cloudflare.js";
export type { Provider as GodaddyDnsProviderConfig } from "../../generated/plugins/caddy-dns-godaddy.js";

/**
 * `caddy-dns/digitalocean` provider config.
 *
 * Hand-picked rather than re-exported: the generated `Provider` interface
 * (`src/generated/plugins/caddy-dns-digitalocean.ts`) also carries a
 * `Client` field — a tygo artifact from Go's anonymous embedding of an
 * all-unexported `Client` struct, which contributes nothing to the real
 * JSON output (Go's `encoding/json` never emits an anonymous embed with no
 * exported fields as a nested key).
 */
export interface DigitaloceanDnsProviderConfig {
  auth_token: string;
}

/**
 * `caddy-dns/route53` provider config.
 *
 * Real fields span two Go modules: `libdns/route53` (the 10 fields below,
 * from the generated `Provider` in `caddy-dns-route53-libdns.ts`) plus
 * `caddy-dns/route53`'s own extra `debug_logging` field (from
 * `caddy-dns-route53-wrapper.ts`). Composed by hand since tygo can't follow
 * the wrapper's cross-module pointer embed (`*route53.Provider`)
 * automatically — see `local/caddy-dns-route53/tygo.yaml`.
 *
 * All fields are optional: `caddy-dns/route53` falls back to the AWS Go
 * SDK v2's own default credential chain (env vars, shared profile, or IAM
 * role) for anything not explicitly set here.
 */
export interface Route53DnsProviderConfig extends Route53LibdnsProviderConfig {
  /**
   * Forwards structured events from libdns/route53 (zone resolution,
   * change submission, sync waits) to Caddy's logger. Emits at Debug level
   * except for ambiguous-zone warnings — set Caddy's log level to debug to
   * actually see them.
   */
  debug_logging?: boolean;
}

/**
 * Known `dnsProvider` names with a typed builder in this module.
 */
export const KNOWN_ACME_DNS_PROVIDERS = [
  "porkbun",
  "cloudflare",
  "route53",
  "digitalocean",
  "godaddy",
] as const;

export type KnownAcmeDnsProvider = (typeof KNOWN_ACME_DNS_PROVIDERS)[number];

/**
 * Result of building a provider's DNS-01 config: the typed
 * `providerConfig` to pass through to
 * {@link buildAcmeDnsPolicy}`.providerConfig`, plus the env var names the
 * caller should ensure are set (names only — never values).
 */
export interface AcmeDnsProviderConfigResult {
  /**
   * Omitted for providers (e.g. `route53` when called with no explicit
   * `options`) that resolve credentials outside of `providerConfig`
   * entirely.
   */
  providerConfig?: Record<string, unknown>;
  /** Env var names referenced by `providerConfig`'s `{env.VAR}` placeholders (or, for `route53`'s default zero-arg call, consumed directly by the AWS SDK's credential chain). */
  envVars: string[];
}
