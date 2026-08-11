/**
 * Direct unit tests for vscode-extension/src/wizards/route-config-generator.ts,
 * extracted from route-wizard.ts (0.10) -- pure config-object generation,
 * previously untested (only exercised indirectly via the Route Wizard's
 * Playwright test).
 */
import { describe, test, expect } from "vitest";
import {
  generateRouteCode,
  type RouteConfig,
} from "../../vscode-extension/src/wizards/route-config-generator.js";

const baseConfig: RouteConfig = {
  id: "my-route",
  hosts: ["example.com"],
  handlerType: "reverse_proxy",
  upstream: "localhost:3000",
  addSecurityHeaders: false,
  terminal: true,
};

describe("generateRouteCode", () => {
  test("produces valid JSON with @id, match, handle, terminal", () => {
    const route = JSON.parse(generateRouteCode(baseConfig));
    expect(route["@id"]).toBe("my-route");
    expect(route.match).toEqual([{ host: ["example.com"] }]);
    expect(route.terminal).toBe(true);
  });

  test("adds a path matcher only when a path is given", () => {
    const withPath = JSON.parse(generateRouteCode({ ...baseConfig, path: "/api/*" }));
    expect(withPath.match[0].path).toEqual(["/api/*"]);

    const withoutPath = JSON.parse(generateRouteCode(baseConfig));
    expect(withoutPath.match[0].path).toBeUndefined();
  });

  test("prepends a headers handler when addSecurityHeaders is set", () => {
    const route = JSON.parse(generateRouteCode({ ...baseConfig, addSecurityHeaders: true }));
    expect(route.handle[0]).toEqual({
      handler: "headers",
      response: {
        set: {
          "X-Content-Type-Options": ["nosniff"],
          "X-Frame-Options": ["DENY"],
          "X-XSS-Protection": ["1; mode=block"],
          "Referrer-Policy": ["strict-origin-when-cross-origin"],
        },
      },
    });
    expect(route.handle[1].handler).toBe("reverse_proxy");
  });

  test("omits the headers handler when addSecurityHeaders is false", () => {
    const route = JSON.parse(generateRouteCode(baseConfig));
    expect(route.handle).toHaveLength(1);
    expect(route.handle[0].handler).toBe("reverse_proxy");
  });

  test("reverse_proxy handler dials the given upstream", () => {
    const route = JSON.parse(generateRouteCode(baseConfig));
    expect(route.handle[0]).toEqual({
      handler: "reverse_proxy",
      upstreams: [{ dial: "localhost:3000" }],
    });
  });

  test("file_server handler uses the given root", () => {
    const route = JSON.parse(
      generateRouteCode({ ...baseConfig, handlerType: "file_server", root: "/var/www" })
    );
    expect(route.handle[0]).toEqual({ handler: "file_server", root: "/var/www" });
  });

  test("static_response handler includes body when given", () => {
    const route = JSON.parse(
      generateRouteCode({
        ...baseConfig,
        handlerType: "static_response",
        statusCode: 200,
        body: "hello",
      })
    );
    expect(route.handle[0]).toEqual({
      handler: "static_response",
      status_code: 200,
      body: "hello",
    });
  });

  test("static_response omits body when not given", () => {
    const route = JSON.parse(
      generateRouteCode({ ...baseConfig, handlerType: "static_response", statusCode: 404 })
    );
    expect(route.handle[0]).toEqual({ handler: "static_response", status_code: 404 });
  });

  test.each([301, 302])(
    "static_response adds a redirect Location header for status %i",
    (statusCode) => {
      const route = JSON.parse(
        generateRouteCode({ ...baseConfig, handlerType: "static_response", statusCode })
      );
      expect(route.handle[0].headers).toEqual({ Location: ["https://example.com/new-path"] });
    }
  );

  test("static_response does NOT add a redirect header for 200", () => {
    const route = JSON.parse(
      generateRouteCode({ ...baseConfig, handlerType: "static_response", statusCode: 200 })
    );
    expect(route.handle[0].headers).toBeUndefined();
  });

  test("rewrite handler uses the given path as its uri", () => {
    const route = JSON.parse(
      generateRouteCode({ ...baseConfig, handlerType: "rewrite", path: "/new/path" })
    );
    expect(route.handle[0]).toEqual({ handler: "rewrite", uri: "/new/path" });
  });

  test("an unrecognized handlerType produces no main handler (only headers if enabled)", () => {
    const route = JSON.parse(generateRouteCode({ ...baseConfig, handlerType: "totally_unknown" }));
    expect(route.handle).toEqual([]);
  });

  test("multiple hosts are all included in the match object", () => {
    const route = JSON.parse(
      generateRouteCode({ ...baseConfig, hosts: ["a.com", "b.com", "c.com"] })
    );
    expect(route.match).toEqual([{ host: ["a.com", "b.com", "c.com"] }]);
  });
});
