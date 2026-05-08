/**
 * ACME-DNS automation policy builder. Emits the wrapper-level shape:
 *   { subjects, issuers: [{ module: "acme", challenges: { dns: { provider: { name } } }, … }] }
 *
 * Provider credentials (Cloudflare API tokens, Porkbun secret keys, …) are
 * not modelled here — Caddy reads them from env vars (`CLOUDFLARE_API_TOKEN`,
 * `PORKBUN_API_KEY`, …). When a typed `caddy-dns/*` integration lands under
 * `src/plugins/caddy-dns/`, callers layer it via `providerConfig` (opaque
 * passthrough; non-breaking).
 */

import type { AutomationPolicy } from "../generated/caddy-tls.js";

/**
 * Friendly DNS provider name → Caddy module name. The common case is
 * identical-on-both-sides; the table lets callers pass asd-yaml friendly
 * names without leaking the module-name detail. Unknown names pass through
 * so any `caddy-dns/*` plugin works without a code change here.
 */
export const ACME_DNS_PROVIDER_MODULE_MAP: Readonly<Record<string, string>> = Object.freeze({
  porkbun: "porkbun",
  cloudflare: "cloudflare",
  route53: "route53",
  digitalocean: "digitalocean",
  godaddy: "godaddy",
});

/**
 * Resolve a provider name to its Caddy module name. Trims surrounding
 * whitespace and lowercases — Caddy module identifiers are lowercase, so
 * `"Cloudflare"` and `" cloudflare "` both resolve to `cloudflare`. Returns
 * the normalised name unchanged when no shortcut matches.
 */
export function resolveAcmeDnsProviderModule(name: string): string {
  const normalised = name.trim().toLowerCase();
  return ACME_DNS_PROVIDER_MODULE_MAP[normalised] ?? normalised;
}

/**
 * Options for {@link buildAcmeDnsPolicy}.
 */
export interface AcmeDnsPolicyOptions {
  /** Hostnames the policy applies to. Required and non-empty. */
  subjects: string[];
  /**
   * Caddy DNS provider name. Common shortcuts (`cloudflare`, `porkbun`,
   * `route53`, `digitalocean`, `godaddy`) map to module names; anything
   * else passes through. Whitespace + case are normalised.
   */
  dnsProvider: string;
  /** Override the ACME directory URL (`ca`). Defaults to Caddy's default. */
  ca?: string;
  /** Account email registered with the ACME server. */
  email?: string;
  /**
   * Opaque provider-config passthrough merged INTO the provider object
   * alongside `name`. Use it for typed `caddy-dns/*` plugin shapes when
   * those land. Must NOT contain `name` — see the runtime guard in
   * {@link buildAcmeDnsPolicy} for the rationale.
   */
  providerConfig?: Record<string, unknown>;
}

/**
 * Build a single Caddy automation policy that obtains certificates via ACME
 * with a DNS-01 challenge. Use together with
 * {@link buildAutomationPoliciesWithInternalFallback} by prepending this
 * policy to the resulting array — Caddy walks policies top-down per host.
 *
 * The `provider.name` discriminator (NOT `provider.module`) is what Caddy
 * core expects: see `caddytls/automation.go` —
 *   `ProviderRaw json.RawMessage \`json:"provider,omitempty"
 *    caddy:"namespace=dns.providers inline_key=name"\``
 * The `inline_key=name` directive is the authoritative source for this
 * choice. (`module` is the discriminator at the issuer level — `module:
 * "acme"` — but provider sub-modules use `name`.)
 *
 * @example
 * ```ts
 * const acme = buildAcmeDnsPolicy({ subjects: ["example.com"], dnsProvider: "cloudflare" })
 * ```
 */
export function buildAcmeDnsPolicy(options: AcmeDnsPolicyOptions): AutomationPolicy {
  if (!Array.isArray(options.subjects) || options.subjects.length === 0) {
    throw new Error("buildAcmeDnsPolicy: `subjects` must be a non-empty array");
  }
  for (const s of options.subjects) {
    if (typeof s !== "string" || !s.trim()) {
      throw new Error("buildAcmeDnsPolicy: `subjects` entries must be non-empty strings");
    }
  }
  if (typeof options.dnsProvider !== "string" || !options.dnsProvider.trim()) {
    throw new Error("buildAcmeDnsPolicy: `dnsProvider` is required");
  }
  // Reject providerConfig overriding the discriminator — silent overwrite
  // would defeat the contractual value of `dnsProvider` and produce a
  // policy that resolves at runtime to a different module than the
  // caller asked for.
  if (options.providerConfig && Object.prototype.hasOwnProperty.call(options.providerConfig, "name")) {
    throw new Error(
      "buildAcmeDnsPolicy: `providerConfig.name` is reserved — set the provider via `dnsProvider`",
    );
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
    subjects: [...options.subjects],
    issuers: [issuer as AutomationPolicy["issuers"] extends (infer I)[] ? I : never],
  };
}
