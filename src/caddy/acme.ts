/**
 * ACME-DNS automation policy builder.
 *
 * SCOPE: this module emits the wrapper-level shape Caddy expects for an
 * ACME issuer with a DNS-01 challenge:
 *
 *   {
 *     subjects: [...],
 *     issuers: [{
 *       module: "acme",
 *       email?, ca?,
 *       challenges: { dns: { provider: { name } } }
 *     }]
 *   }
 *
 * It does NOT model provider-specific config (Cloudflare API tokens,
 * Porkbun secret keys, Route53 access keys, etc.). Caddy reads those
 * from environment variables at runtime (`CLOUDFLARE_API_TOKEN`,
 * `PORKBUN_API_KEY`, …), so the wrapper-level shape is enough for the
 * automation table. When a future xcaddy plugin in `src/plugins/caddy-dns/`
 * brings typed provider configs, this builder accepts an opaque
 * `provider` object passthrough so callers can migrate without breaking.
 */

import type { AutomationPolicy } from "../generated/caddy-tls.js";

/**
 * Map a friendly DNS provider name to its Caddy module name. Most of the
 * common providers use the same name in both worlds; this exists so callers
 * can pass `"cloudflare"` (asd-yaml friendly) and the builder emits the
 * exact module identifier Caddy resolves at runtime. Unknown names pass
 * through unchanged so a caller can supply any plugin name from the
 * `caddy-dns/*` namespace.
 */
export const ACME_DNS_PROVIDER_MODULE_MAP: Readonly<Record<string, string>> = Object.freeze({
  porkbun: "porkbun",
  cloudflare: "cloudflare",
  route53: "route53",
  digitalocean: "digitalocean",
  godaddy: "godaddy",
  // Future entries added here are non-breaking additions.
});

/**
 * Resolve a provider name to its Caddy module name. Falls through with
 * the input unchanged so unknown / not-yet-mapped providers still work.
 */
export function resolveAcmeDnsProviderModule(name: string): string {
  return ACME_DNS_PROVIDER_MODULE_MAP[name] ?? name;
}

/**
 * Options for {@link buildAcmeDnsPolicy}.
 */
export interface AcmeDnsPolicyOptions {
  /**
   * Hostnames the policy applies to (e.g. `["example.com", "www.example.com"]`).
   * Required and non-empty — Caddy rejects empty subjects on a non-catch-all
   * automation policy.
   */
  subjects: string[];
  /**
   * Caddy DNS provider name. Common shortcuts (`cloudflare`, `porkbun`,
   * `route53`, `digitalocean`, `godaddy`) are mapped to their module
   * names; anything else passes through unchanged.
   */
  dnsProvider: string;
  /**
   * Optional override for the ACME directory URL (`ca` field). Defaults
   * to Caddy's default (Let's Encrypt production) when omitted.
   */
  ca?: string;
  /**
   * Optional account email registered with the ACME server.
   */
  email?: string;
  /**
   * Opaque provider-config passthrough. When the caller has the typed
   * shape for a specific `caddy-dns/*` plugin (from a future
   * `src/plugins/caddy-dns/` integration), pass it here. Otherwise
   * Caddy reads provider credentials from env vars (e.g.
   * `CLOUDFLARE_API_TOKEN`).
   */
  providerConfig?: Record<string, unknown>;
}

/**
 * Build a single Caddy automation policy that obtains certificates via
 * ACME with a DNS-01 challenge. Use this together with
 * {@link buildAutomationPoliciesWithInternalFallback} (the catch-all)
 * by prepending this policy to the resulting array — Caddy walks the
 * policy table top-down on every host and short-circuits on the first
 * subject match.
 *
 * @example
 * ```typescript
 * const acme = buildAcmeDnsPolicy({
 *   subjects: ["example.com", "www.example.com"],
 *   dnsProvider: "cloudflare",
 *   email: "ops@example.com",
 * })
 * const { policies } = buildAutomationPoliciesWithInternalFallback()
 * resolvedConfig.apps.tls.automation = { policies: [acme, ...policies] }
 * ```
 */
export function buildAcmeDnsPolicy(options: AcmeDnsPolicyOptions): AutomationPolicy {
  if (!Array.isArray(options.subjects) || options.subjects.length === 0) {
    throw new Error("buildAcmeDnsPolicy: `subjects` must be a non-empty array");
  }
  if (!options.dnsProvider?.trim()) {
    throw new Error("buildAcmeDnsPolicy: `dnsProvider` is required");
  }
  const providerName = resolveAcmeDnsProviderModule(options.dnsProvider);
  const provider: Record<string, unknown> = {
    name: providerName,
    ...(options.providerConfig ?? {}),
  };
  const issuer: Record<string, unknown> = {
    module: "acme",
    challenges: { dns: { provider } },
  };
  if (options.email) issuer.email = options.email;
  if (options.ca) issuer.ca = options.ca;
  return {
    subjects: [...options.subjects],
    issuers: [issuer as AutomationPolicy["issuers"] extends (infer I)[] ? I : never],
  };
}
