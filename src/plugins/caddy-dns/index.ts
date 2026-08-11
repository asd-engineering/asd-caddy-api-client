/**
 * caddy-dns plugin integration
 *
 * Typed `providerConfig` builders for the `caddy-dns/*` ACME-DNS challenge
 * provider modules — porkbun, cloudflare, route53, digitalocean, godaddy —
 * layered on top of `buildAcmeDnsPolicy` (`../caddy/acme.js`), which only
 * builds the wrapper shape and treats `providerConfig` as an opaque
 * passthrough.
 *
 * @see https://github.com/caddy-dns
 * @see ../caddy/acme.ts
 *
 * @example
 * ```typescript
 * import { buildAcmeDnsPolicy } from "@accelerated-software-development/caddy-api-client/caddy";
 * import { buildAcmeDnsProviderConfig } from "@accelerated-software-development/caddy-api-client/plugins/caddy-dns";
 *
 * const { providerConfig } = buildAcmeDnsProviderConfig("cloudflare");
 * const policy = buildAcmeDnsPolicy({
 *   subjects: ["example.com", "*.example.com"],
 *   dnsProvider: "cloudflare",
 *   providerConfig,
 * });
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  PorkbunDnsProviderConfig,
  CloudflareDnsProviderConfig,
  DigitaloceanDnsProviderConfig,
  GodaddyDnsProviderConfig,
  KnownAcmeDnsProvider,
  AcmeDnsProviderConfigResult,
} from "./types.js";
export { KNOWN_ACME_DNS_PROVIDERS } from "./types.js";

// Schemas
export {
  PorkbunDnsProviderConfigSchema,
  CloudflareDnsProviderConfigSchema,
  DigitaloceanDnsProviderConfigSchema,
  GodaddyDnsProviderConfigSchema,
} from "./schemas.js";

// Builders
export {
  buildPorkbunDnsConfig,
  buildCloudflareDnsConfig,
  buildRoute53DnsConfig,
  buildDigitaloceanDnsConfig,
  buildGodaddyDnsConfig,
  buildAcmeDnsProviderConfig,
} from "./builders.js";
