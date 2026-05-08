import { describe, test, expect } from "vitest";
import {
  ACME_DNS_PROVIDER_MODULE_MAP,
  resolveAcmeDnsProviderModule,
  buildAcmeDnsPolicy,
} from "../caddy/acme.js";

describe("ACME_DNS_PROVIDER_MODULE_MAP", () => {
  test("contains the documented common providers", () => {
    expect(ACME_DNS_PROVIDER_MODULE_MAP.cloudflare).toBe("cloudflare");
    expect(ACME_DNS_PROVIDER_MODULE_MAP.porkbun).toBe("porkbun");
    expect(ACME_DNS_PROVIDER_MODULE_MAP.route53).toBe("route53");
    expect(ACME_DNS_PROVIDER_MODULE_MAP.digitalocean).toBe("digitalocean");
    expect(ACME_DNS_PROVIDER_MODULE_MAP.godaddy).toBe("godaddy");
  });

  test("is frozen so additions are deliberate (not mutated at runtime)", () => {
    expect(Object.isFrozen(ACME_DNS_PROVIDER_MODULE_MAP)).toBe(true);
  });
});

describe("resolveAcmeDnsProviderModule", () => {
  test("known shortcut → module name", () => {
    expect(resolveAcmeDnsProviderModule("cloudflare")).toBe("cloudflare");
    expect(resolveAcmeDnsProviderModule("porkbun")).toBe("porkbun");
  });

  test("unknown name passes through unchanged", () => {
    expect(resolveAcmeDnsProviderModule("hetzner")).toBe("hetzner");
    expect(resolveAcmeDnsProviderModule("custom-plugin-name")).toBe("custom-plugin-name");
  });
});

describe("buildAcmeDnsPolicy", () => {
  test("builds a policy with the expected wrapper shape", () => {
    const p = buildAcmeDnsPolicy({
      subjects: ["example.com", "www.example.com"],
      dnsProvider: "cloudflare",
      email: "ops@example.com",
    });
    expect(p.subjects).toEqual(["example.com", "www.example.com"]);
    expect(Array.isArray(p.issuers)).toBe(true);
    const issuer = p.issuers![0] as Record<string, unknown>;
    expect(issuer.module).toBe("acme");
    expect(issuer.email).toBe("ops@example.com");
    const challenges = issuer.challenges as Record<string, unknown>;
    const dns = challenges.dns as Record<string, unknown>;
    const provider = dns.provider as Record<string, unknown>;
    expect(provider.name).toBe("cloudflare");
  });

  test("threads `ca` into the issuer when provided", () => {
    const p = buildAcmeDnsPolicy({
      subjects: ["example.com"],
      dnsProvider: "porkbun",
      ca: "https://acme-staging-v02.api.letsencrypt.org/directory",
    });
    const issuer = p.issuers![0] as Record<string, unknown>;
    expect(issuer.ca).toBe("https://acme-staging-v02.api.letsencrypt.org/directory");
  });

  test("merges providerConfig passthrough into the provider object", () => {
    const p = buildAcmeDnsPolicy({
      subjects: ["example.com"],
      dnsProvider: "cloudflare",
      providerConfig: { api_token: "{env.CLOUDFLARE_API_TOKEN}" },
    });
    const issuer = p.issuers![0] as Record<string, unknown>;
    const provider = (issuer.challenges as Record<string, unknown>).dns as Record<string, unknown>;
    const providerObj = provider.provider as Record<string, unknown>;
    expect(providerObj.name).toBe("cloudflare");
    expect(providerObj.api_token).toBe("{env.CLOUDFLARE_API_TOKEN}");
  });

  test("unknown provider names pass through to module name", () => {
    const p = buildAcmeDnsPolicy({
      subjects: ["example.com"],
      dnsProvider: "hetzner",
    });
    const issuer = p.issuers![0] as Record<string, unknown>;
    const provider = ((issuer.challenges as Record<string, unknown>).dns as Record<string, unknown>)
      .provider as Record<string, unknown>;
    expect(provider.name).toBe("hetzner");
  });

  test("rejects empty subjects", () => {
    expect(() => buildAcmeDnsPolicy({ subjects: [], dnsProvider: "cloudflare" })).toThrow(
      /subjects/
    );
  });

  test("rejects missing dnsProvider", () => {
    expect(() => buildAcmeDnsPolicy({ subjects: ["x"], dnsProvider: "" })).toThrow(/dnsProvider/);
  });

  test("subjects array is copied (not aliased to caller)", () => {
    const subjects = ["a.com"];
    const p = buildAcmeDnsPolicy({ subjects, dnsProvider: "cloudflare" });
    subjects.push("b.com");
    expect(p.subjects).toEqual(["a.com"]);
  });
});
