/**
 * ACME-DNS automation policy builder. Emits the wrapper-level shape:
 *   { subjects, issuers: [{ module: "acme", challenges: { dns: { provider: { name } } }, … }] }
 *
 * Provider credentials are NOT modelled here — Caddy reads them from
 * env vars (CLOUDFLARE_API_TOKEN, …). Layer typed `caddy-dns/*` shapes
 * via `providerConfig` (opaque passthrough).
 */

import type { AutomationPolicy } from "../generated/caddy-tls.js";

/** Friendly DNS provider name → Caddy module name. Frozen. */
export const ACME_DNS_PROVIDER_MODULE_MAP: Readonly<Record<string, string>> = Object.freeze({
  porkbun: "porkbun",
  cloudflare: "cloudflare",
  route53: "route53",
  digitalocean: "digitalocean",
  godaddy: "godaddy",
});

/**
 * Resolve a provider name to its Caddy module name. Trims + lower-cases
 * (Caddy module identifiers are lower-case). Unknown names pass through
 * normalised — `"MyProvider"` → `"myprovider"`.
 */
export function resolveAcmeDnsProviderModule(name: string): string {
  const normalised = name.trim().toLowerCase();
  return ACME_DNS_PROVIDER_MODULE_MAP[normalised] ?? normalised;
}

/** Options for {@link buildAcmeDnsPolicy}. */
export interface AcmeDnsPolicyOptions {
  /** Hostnames the policy applies to. Non-empty; entries are trimmed. */
  subjects: string[];
  /** DNS provider name. Trim + lower-case normalised; passes through unknowns. */
  dnsProvider: string;
  /** Override ACME directory URL (`ca`). */
  ca?: string;
  /** Account email registered with the ACME server. */
  email?: string;
  /**
   * Opaque provider-config passthrough. Reserved keys throw: `name`
   * (owned by `dnsProvider`) and `module` (issuer-level discriminator,
   * not a provider field).
   */
  providerConfig?: Record<string, unknown>;
}

/**
 * Build an ACME-DNS automation policy. Use with
 * {@link buildAutomationPoliciesWithInternalFallback} by prepending.
 *
 * Provider discriminator is `name`, not `module` — see Caddy core
 * `caddytls/automation.go`: `caddy:"namespace=dns.providers inline_key=name"`.
 *
 * @example
 * buildAcmeDnsPolicy({ subjects: ["example.com"], dnsProvider: "cloudflare" })
 */
export function buildAcmeDnsPolicy(options: AcmeDnsPolicyOptions): AutomationPolicy {
  if (!Array.isArray(options.subjects) || options.subjects.length === 0) {
    throw new Error("buildAcmeDnsPolicy: `subjects` must be a non-empty array");
  }
  const subjects: string[] = [];
  for (const s of options.subjects) {
    if (typeof s !== "string" || !s.trim()) {
      throw new Error("buildAcmeDnsPolicy: `subjects` entries must be non-empty strings");
    }
    subjects.push(s.trim());
  }
  if (typeof options.dnsProvider !== "string" || !options.dnsProvider.trim()) {
    throw new Error("buildAcmeDnsPolicy: `dnsProvider` is required");
  }
  if (options.providerConfig) {
    if (Object.prototype.hasOwnProperty.call(options.providerConfig, "name")) {
      throw new Error(
        "buildAcmeDnsPolicy: `providerConfig.name` is reserved — set the provider via `dnsProvider`",
      );
    }
    if (Object.prototype.hasOwnProperty.call(options.providerConfig, "module")) {
      throw new Error(
        "buildAcmeDnsPolicy: `providerConfig.module` is reserved — `module` is the issuer-level discriminator, not a provider field",
      );
    }
  }
  const providerName = resolveAcmeDnsProviderModule(options.dnsProvider);
  const provider: Record<string, unknown> = {
    ...(options.providerConfig ?? {}),
    name: providerName,
  };
  const issuer: Record<string, unknown> = {
    module: "acme",
    challenges: { dns: { provider } },
  };
  if (options.email) issuer.email = options.email;
  if (options.ca) issuer.ca = options.ca;
  return {
    subjects,
    issuers: [issuer as AutomationPolicy["issuers"] extends (infer I)[] ? I : never],
  };
}
