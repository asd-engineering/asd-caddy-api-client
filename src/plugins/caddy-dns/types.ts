/**
 * caddy-dns plugin types
 *
 * Typed `providerConfig` shapes for the `caddy-dns/*` ACME-DNS challenge
 * provider modules, layered on top of {@link buildAcmeDnsPolicy} in
 * `src/caddy/acme.ts` (which only builds the wrapper shape and treats
 * `providerConfig` as an opaque passthrough).
 *
 * Field names are the exact JSON keys each plugin's Go module expects
 * (verified against each plugin's own README/source — see builders.ts for
 * per-provider references). Values are asd's own `{env.VAR}` placeholder
 * convention, not literal secrets — Caddy resolves them from the process
 * environment at load time.
 *
 * @see https://github.com/caddy-dns
 * @see ../../caddy/acme.ts
 */

/** `caddy-dns/porkbun` provider config. */
export interface PorkbunDnsProviderConfig {
  api_key: string;
  api_secret_key: string;
}

/** `caddy-dns/cloudflare` provider config. */
export interface CloudflareDnsProviderConfig {
  api_token: string;
}

/** `caddy-dns/digitalocean` provider config. */
export interface DigitaloceanDnsProviderConfig {
  auth_token: string;
}

/**
 * `caddy-dns/godaddy` provider config.
 *
 * `api_token` must be GoDaddy's own combined `"<API_KEY>:<API_SECRET>"`
 * format — a single env var holding both parts joined by a colon, not two
 * separate env vars. This is a common mistake: GoDaddy issues a key and a
 * secret separately, but the plugin expects them concatenated.
 */
export interface GodaddyDnsProviderConfig {
  api_token: string;
}

/**
 * Known `dnsProvider` names with a typed builder in this module.
 *
 * `route53` has no `providerConfig` interface — `caddy-dns/route53` uses
 * the AWS Go SDK v2's own default credential chain (env vars, shared
 * profile, or IAM role), so there is no provider-config JSON to type.
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
   * Omitted for providers (e.g. `route53`) that resolve credentials
   * outside of `providerConfig` entirely.
   */
  providerConfig?: Record<string, unknown>;
  /** Env var names referenced by `providerConfig`'s `{env.VAR}` placeholders (or, for `route53`, consumed directly by the AWS SDK's credential chain). */
  envVars: string[];
}
