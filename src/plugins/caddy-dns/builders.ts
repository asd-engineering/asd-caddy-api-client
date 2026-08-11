/**
 * Builder functions for caddy-dns plugin
 *
 * Each builder returns the typed `providerConfig` for one `caddy-dns/*`
 * ACME-DNS challenge provider module, plus the env var names Caddy expects
 * to be set for it — ready to drop into
 * {@link buildAcmeDnsPolicy}`.providerConfig` (see `../../caddy/acme.ts`).
 *
 * `providerConfig` field names were confirmed against each plugin's own
 * README/source on 2026-08-11 — re-verify before relying on them if a
 * plugin has since changed its config shape:
 * - `caddy-dns/porkbun`: https://github.com/caddy-dns/porkbun
 * - `caddy-dns/cloudflare`: https://github.com/caddy-dns/cloudflare
 * - `caddy-dns/route53`: https://github.com/caddy-dns/route53
 * - `caddy-dns/digitalocean`: https://github.com/caddy-dns/digitalocean
 * - `caddy-dns/godaddy`: https://github.com/caddy-dns/godaddy
 */
import { resolveAcmeDnsProviderModule } from "../../caddy/acme.js";
import { validateOrThrow } from "../../utils/validation.js";
import {
  PorkbunDnsProviderConfigSchema,
  CloudflareDnsProviderConfigSchema,
  DigitaloceanDnsProviderConfigSchema,
  GodaddyDnsProviderConfigSchema,
} from "./schemas.js";
import type { AcmeDnsProviderConfigResult } from "./types.js";

/**
 * Build the `caddy-dns/porkbun` provider config.
 *
 * @example
 * buildPorkbunDnsConfig()
 * // => { providerConfig: { api_key: "{env.PORKBUN_API_KEY}", api_secret_key: "{env.PORKBUN_API_SECRET_KEY}" }, envVars: ["PORKBUN_API_KEY", "PORKBUN_API_SECRET_KEY"] }
 */
export function buildPorkbunDnsConfig(): AcmeDnsProviderConfigResult {
  const providerConfig = {
    api_key: "{env.PORKBUN_API_KEY}",
    api_secret_key: "{env.PORKBUN_API_SECRET_KEY}",
  };
  return {
    providerConfig: validateOrThrow(
      PorkbunDnsProviderConfigSchema,
      providerConfig,
      "buildPorkbunDnsConfig"
    ),
    envVars: ["PORKBUN_API_KEY", "PORKBUN_API_SECRET_KEY"],
  };
}

/**
 * Build the `caddy-dns/cloudflare` provider config.
 *
 * @example
 * buildCloudflareDnsConfig()
 * // => { providerConfig: { api_token: "{env.CLOUDFLARE_API_TOKEN}" }, envVars: ["CLOUDFLARE_API_TOKEN"] }
 */
export function buildCloudflareDnsConfig(): AcmeDnsProviderConfigResult {
  const providerConfig = { api_token: "{env.CLOUDFLARE_API_TOKEN}" };
  return {
    providerConfig: validateOrThrow(
      CloudflareDnsProviderConfigSchema,
      providerConfig,
      "buildCloudflareDnsConfig"
    ),
    envVars: ["CLOUDFLARE_API_TOKEN"],
  };
}

/**
 * Build the `caddy-dns/route53` config.
 *
 * `caddy-dns/route53` reads credentials via the AWS Go SDK v2's own
 * default credential chain (env vars, shared profile, or IAM role) — it
 * does not take a `providerConfig` at all, so `providerConfig` is omitted
 * here rather than reimplementing that resolution.
 *
 * @example
 * buildRoute53DnsConfig()
 * // => { envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"] }
 */
export function buildRoute53DnsConfig(): AcmeDnsProviderConfigResult {
  return { envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"] };
}

/**
 * Build the `caddy-dns/digitalocean` provider config.
 *
 * @example
 * buildDigitaloceanDnsConfig()
 * // => { providerConfig: { auth_token: "{env.DIGITALOCEAN_API_TOKEN}" }, envVars: ["DIGITALOCEAN_API_TOKEN"] }
 */
export function buildDigitaloceanDnsConfig(): AcmeDnsProviderConfigResult {
  const providerConfig = { auth_token: "{env.DIGITALOCEAN_API_TOKEN}" };
  return {
    providerConfig: validateOrThrow(
      DigitaloceanDnsProviderConfigSchema,
      providerConfig,
      "buildDigitaloceanDnsConfig"
    ),
    envVars: ["DIGITALOCEAN_API_TOKEN"],
  };
}

/**
 * Build the `caddy-dns/godaddy` provider config.
 *
 * `GODADDY_API_TOKEN` must hold GoDaddy's own combined
 * `"<API_KEY>:<API_SECRET>"` format — see {@link GodaddyDnsProviderConfig}.
 *
 * @example
 * buildGodaddyDnsConfig()
 * // => { providerConfig: { api_token: "{env.GODADDY_API_TOKEN}" }, envVars: ["GODADDY_API_TOKEN"] }
 */
export function buildGodaddyDnsConfig(): AcmeDnsProviderConfigResult {
  const providerConfig = { api_token: "{env.GODADDY_API_TOKEN}" };
  return {
    providerConfig: validateOrThrow(
      GodaddyDnsProviderConfigSchema,
      providerConfig,
      "buildGodaddyDnsConfig"
    ),
    envVars: ["GODADDY_API_TOKEN"],
  };
}

/**
 * Resolve a `dnsProvider` name (as passed to
 * {@link buildAcmeDnsPolicy}`.dnsProvider`) to its typed provider config,
 * via the same normalisation `buildAcmeDnsPolicy` itself uses.
 *
 * Unknown provider names return `{ envVars: [] }` — no typed builder
 * exists yet, so the caller must supply `providerConfig` themselves (e.g.
 * via the raw `providerConfig` passthrough on `buildAcmeDnsPolicy`).
 *
 * @example
 * buildAcmeDnsPolicy({
 *   subjects: ["example.com", "*.example.com"],
 *   dnsProvider: "cloudflare",
 *   providerConfig: buildAcmeDnsProviderConfig("cloudflare").providerConfig,
 * });
 */
export function buildAcmeDnsProviderConfig(provider: string): AcmeDnsProviderConfigResult {
  switch (resolveAcmeDnsProviderModule(provider)) {
    case "porkbun":
      return buildPorkbunDnsConfig();
    case "cloudflare":
      return buildCloudflareDnsConfig();
    case "route53":
      return buildRoute53DnsConfig();
    case "digitalocean":
      return buildDigitaloceanDnsConfig();
    case "godaddy":
      return buildGodaddyDnsConfig();
    default:
      return { envVars: [] };
  }
}
