import { describe, test, expect } from "vitest";
import {
  buildPorkbunDnsConfig,
  buildCloudflareDnsConfig,
  buildRoute53DnsConfig,
  buildDigitaloceanDnsConfig,
  buildGodaddyDnsConfig,
  buildAcmeDnsProviderConfig,
} from "../plugins/caddy-dns/builders.js";
import { KNOWN_ACME_DNS_PROVIDERS } from "../plugins/caddy-dns/types.js";
import { buildAcmeDnsPolicy } from "../caddy/acme.js";

describe("buildPorkbunDnsConfig", () => {
  test("builds the caddy-dns/porkbun providerConfig + envVars", () => {
    expect(buildPorkbunDnsConfig()).toEqual({
      providerConfig: {
        api_key: "{env.PORKBUN_API_KEY}",
        api_secret_key: "{env.PORKBUN_API_SECRET_KEY}",
      },
      envVars: ["PORKBUN_API_KEY", "PORKBUN_API_SECRET_KEY"],
    });
  });
});

describe("buildCloudflareDnsConfig", () => {
  test("builds the caddy-dns/cloudflare providerConfig + envVars", () => {
    expect(buildCloudflareDnsConfig()).toEqual({
      providerConfig: { api_token: "{env.CLOUDFLARE_API_TOKEN}" },
      envVars: ["CLOUDFLARE_API_TOKEN"],
    });
  });

  test("does not set the optional zone_token by default", () => {
    const { providerConfig } = buildCloudflareDnsConfig();
    expect(providerConfig).not.toHaveProperty("zone_token");
  });
});

describe("buildRoute53DnsConfig", () => {
  test("omits providerConfig when called with no options — route53 uses the AWS SDK's own credential chain", () => {
    const result = buildRoute53DnsConfig();
    expect(result.providerConfig).toBeUndefined();
    expect(result.envVars).toEqual(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"]);
  });

  test("omits providerConfig when called with an empty options object", () => {
    const result = buildRoute53DnsConfig({});
    expect(result.providerConfig).toBeUndefined();
  });

  test("builds a typed providerConfig when options are supplied", () => {
    const result = buildRoute53DnsConfig({
      hosted_zone_id: "Z1D633PJN98FT9",
      region: "us-east-1",
    });
    expect(result.providerConfig).toEqual({
      hosted_zone_id: "Z1D633PJN98FT9",
      region: "us-east-1",
    });
    expect(result.envVars).toEqual(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"]);
  });

  test("supports the caddy-dns/route53 wrapper's own debug_logging field alongside libdns/route53 fields", () => {
    const result = buildRoute53DnsConfig({ debug_logging: true, region: "eu-west-1" });
    expect(result.providerConfig).toEqual({ debug_logging: true, region: "eu-west-1" });
  });

  test("rejects options that don't match the real Go struct's field types", () => {
    expect(() => buildRoute53DnsConfig({ region: 123 as unknown as string })).toThrow(/region/);
  });
});

describe("buildDigitaloceanDnsConfig", () => {
  test("builds the caddy-dns/digitalocean providerConfig + envVars", () => {
    expect(buildDigitaloceanDnsConfig()).toEqual({
      providerConfig: { auth_token: "{env.DIGITALOCEAN_API_TOKEN}" },
      envVars: ["DIGITALOCEAN_API_TOKEN"],
    });
  });
});

describe("buildGodaddyDnsConfig", () => {
  test("builds the caddy-dns/godaddy providerConfig + envVars", () => {
    expect(buildGodaddyDnsConfig()).toEqual({
      providerConfig: { api_token: "{env.GODADDY_API_TOKEN}" },
      envVars: ["GODADDY_API_TOKEN"],
    });
  });
});

describe("buildAcmeDnsProviderConfig", () => {
  test("dispatches to the matching per-provider builder for every known provider", () => {
    expect(buildAcmeDnsProviderConfig("porkbun")).toEqual(buildPorkbunDnsConfig());
    expect(buildAcmeDnsProviderConfig("cloudflare")).toEqual(buildCloudflareDnsConfig());
    expect(buildAcmeDnsProviderConfig("route53")).toEqual(buildRoute53DnsConfig());
    expect(buildAcmeDnsProviderConfig("digitalocean")).toEqual(buildDigitaloceanDnsConfig());
    expect(buildAcmeDnsProviderConfig("godaddy")).toEqual(buildGodaddyDnsConfig());
  });

  test("normalises input the same way resolveAcmeDnsProviderModule does (trim + lower-case)", () => {
    expect(buildAcmeDnsProviderConfig(" Cloudflare ")).toEqual(buildCloudflareDnsConfig());
    expect(buildAcmeDnsProviderConfig("PORKBUN")).toEqual(buildPorkbunDnsConfig());
  });

  test("unknown provider names fall back to no providerConfig and no envVars — does not throw", () => {
    expect(buildAcmeDnsProviderConfig("hetzner")).toEqual({ envVars: [] });
    expect(buildAcmeDnsProviderConfig("custom-plugin-name")).toEqual({ envVars: [] });
  });

  test("covers every name in KNOWN_ACME_DNS_PROVIDERS", () => {
    for (const provider of KNOWN_ACME_DNS_PROVIDERS) {
      const result = buildAcmeDnsProviderConfig(provider);
      expect(result.envVars.length).toBeGreaterThan(0);
    }
  });

  test("composes with buildAcmeDnsPolicy's providerConfig passthrough", () => {
    const { providerConfig } = buildAcmeDnsProviderConfig("cloudflare");
    const policy = buildAcmeDnsPolicy({
      subjects: ["example.com", "*.example.com"],
      dnsProvider: "cloudflare",
      providerConfig,
    });
    const issuer = policy.issuers![0] as Record<string, unknown>;
    const dns = (issuer.challenges as Record<string, unknown>).dns as Record<string, unknown>;
    const provider = dns.provider as Record<string, unknown>;
    expect(provider.name).toBe("cloudflare");
    expect(provider.api_token).toBe("{env.CLOUDFLARE_API_TOKEN}");
  });
});
