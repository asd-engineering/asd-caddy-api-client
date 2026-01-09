/**
 * Tests for config-loader utilities
 */
import { describe, test, expect } from "vitest";
import { detectAdapter } from "../caddy/config-loader.js";

describe("detectAdapter", () => {
  test("returns 'json' for .json files", () => {
    expect(detectAdapter("config.json")).toBe("json");
    expect(detectAdapter("/path/to/config.json")).toBe("json");
    expect(detectAdapter("CONFIG.JSON")).toBe("json");
  });

  test("returns 'yaml' for .yaml and .yml files", () => {
    expect(detectAdapter("config.yaml")).toBe("yaml");
    expect(detectAdapter("config.yml")).toBe("yaml");
    expect(detectAdapter("/path/to/config.YAML")).toBe("yaml");
    expect(detectAdapter("CONFIG.YML")).toBe("yaml");
  });

  test("returns 'nginx' for nginx config files", () => {
    expect(detectAdapter("config.nginx")).toBe("nginx");
    expect(detectAdapter("nginx.conf")).toBe("nginx");
    expect(detectAdapter("/etc/nginx/nginx.conf")).toBe("nginx");
  });

  test("returns 'apache' for apache config files", () => {
    expect(detectAdapter("config.apache")).toBe("apache");
    expect(detectAdapter("httpd.conf")).toBe("apache");
    expect(detectAdapter("/etc/httpd/httpd.conf")).toBe("apache");
  });

  test("returns 'caddyfile' for Caddyfile", () => {
    expect(detectAdapter("Caddyfile")).toBe("caddyfile");
    expect(detectAdapter("/path/to/Caddyfile")).toBe("caddyfile");
    expect(detectAdapter("caddyfile")).toBe("caddyfile");
  });

  test("returns 'caddyfile' for unknown extensions", () => {
    expect(detectAdapter("config.txt")).toBe("caddyfile");
    expect(detectAdapter("myconfig")).toBe("caddyfile");
    expect(detectAdapter("config.xyz")).toBe("caddyfile");
  });
});
