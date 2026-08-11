/**
 * Zod schemas for caddy-dns plugin
 *
 * Runtime guardrails for the provider-config shapes built in builders.ts —
 * these are hand-written (not tygo/ts-to-zod generated, unlike
 * caddy-security) since `caddy-dns/*` are a family of ~50+ small,
 * independent Go modules with no single upstream source checkout here.
 *
 * @see ./types.ts
 */
import { z } from "zod";

/** {@link PorkbunDnsProviderConfig} schema. */
export const PorkbunDnsProviderConfigSchema = z.object({
  api_key: z.string(),
  api_secret_key: z.string(),
});

/** {@link CloudflareDnsProviderConfig} schema. */
export const CloudflareDnsProviderConfigSchema = z.object({
  api_token: z.string(),
});

/** {@link DigitaloceanDnsProviderConfig} schema. */
export const DigitaloceanDnsProviderConfigSchema = z.object({
  auth_token: z.string(),
});

/** {@link GodaddyDnsProviderConfig} schema. */
export const GodaddyDnsProviderConfigSchema = z.object({
  api_token: z.string(),
});
