/**
 * Zod schemas for caddy-dns plugin
 *
 * Runtime guardrails for the provider-config shapes built in builders.ts.
 * As of 0.9.0, built from machine-generated base schemas
 * (`src/generated/plugins/caddy-dns-*.zod.ts`, produced via tygo + ts-to-zod
 * from real vendored Go source — see `DEPENDENCIES.md`), mirroring the
 * `caddy-security` plugin's pattern: re-export the generated schema, then
 * compose the public schema from it.
 *
 * @see ./types.ts
 */
import { providerSchema as GeneratedPorkbunProviderSchema } from "../../generated/plugins/caddy-dns-porkbun.zod.js";
import { providerSchema as GeneratedCloudflareProviderSchema } from "../../generated/plugins/caddy-dns-cloudflare.zod.js";
import { providerSchema as GeneratedGodaddyProviderSchema } from "../../generated/plugins/caddy-dns-godaddy.zod.js";
import { providerSchema as GeneratedDigitaloceanProviderSchema } from "../../generated/plugins/caddy-dns-digitalocean.zod.js";
import { providerSchema as GeneratedRoute53LibdnsProviderSchema } from "../../generated/plugins/caddy-dns-route53-libdns.zod.js";
import { providerSchema as GeneratedRoute53WrapperProviderSchema } from "../../generated/plugins/caddy-dns-route53-wrapper.zod.js";

export {
  GeneratedPorkbunProviderSchema,
  GeneratedCloudflareProviderSchema,
  GeneratedGodaddyProviderSchema,
  GeneratedDigitaloceanProviderSchema,
  GeneratedRoute53LibdnsProviderSchema,
  GeneratedRoute53WrapperProviderSchema,
};

/** {@link PorkbunDnsProviderConfig} schema. Exact match to the generated schema. */
export const PorkbunDnsProviderConfigSchema = GeneratedPorkbunProviderSchema;

/** {@link CloudflareDnsProviderConfig} schema. Exact match to the generated schema (includes optional `zone_token`). */
export const CloudflareDnsProviderConfigSchema = GeneratedCloudflareProviderSchema;

/** {@link GodaddyDnsProviderConfig} schema. Exact match to the generated schema. */
export const GodaddyDnsProviderConfigSchema = GeneratedGodaddyProviderSchema;

/**
 * {@link DigitaloceanDnsProviderConfig} schema.
 *
 * Omits the generated schema's `Client` field — a tygo artifact from an
 * all-unexported Go embed that contributes nothing to real JSON output. See
 * the equivalent note on {@link DigitaloceanDnsProviderConfig} in `types.ts`.
 */
export const DigitaloceanDnsProviderConfigSchema = GeneratedDigitaloceanProviderSchema.omit({
  Client: true,
});

/**
 * {@link Route53DnsProviderConfig} schema.
 *
 * Merges the real `libdns/route53` fields with `caddy-dns/route53`'s own
 * `debug_logging` field, picked from the wrapper's generated schema (which
 * otherwise only carries the spurious cross-module `Provider` embed — see
 * the equivalent note on {@link Route53DnsProviderConfig} in `types.ts`).
 */
export const Route53DnsProviderConfigSchema = GeneratedRoute53LibdnsProviderSchema.extend(
  GeneratedRoute53WrapperProviderSchema.pick({ debug_logging: true }).shape
);
