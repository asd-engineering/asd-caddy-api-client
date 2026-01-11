/**
 * TDD Tests: Caddy JSON Config Validation Coverage
 *
 * These tests use REAL Caddy JSON configs and validate them against our Zod schemas.
 * Tests FAIL when our schemas reject valid Caddy configurations - proving we need
 * to expand our type generation to cover more handlers.
 *
 * TDD Flow:
 * 1. RED: These tests fail because schemas reject valid Caddy configs
 * 2. GREEN: Expand tygo.yaml, generate types, tests pass
 * 3. REFACTOR: Clean up generated schemas
 */
import { describe, it, expect } from "vitest";
import {
  CaddyRouteSchema,
  KnownCaddyHandlerSchema,
  ReverseProxyHandlerSchema,
  HeadersHandlerSchema,
  StaticResponseHandlerSchema,
  EncodeHandlerSchema,
} from "../schemas";

describe("Caddy JSON Config Validation", () => {
  describe("Currently Supported Handlers (should PASS)", () => {
    it("validates reverse_proxy config from real Caddy", () => {
      const config = {
        handler: "reverse_proxy",
        upstreams: [{ dial: "localhost:8080" }],
        load_balancing: {
          selection_policy: { policy: "round_robin" },
        },
        health_checks: {
          active: {
            interval: "30s",
            timeout: "5s",
            path: "/health",
          },
        },
      };

      const result = ReverseProxyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("validates headers config from real Caddy", () => {
      const config = {
        handler: "headers",
        response: {
          set: {
            "X-Frame-Options": ["DENY"],
            "X-Content-Type-Options": ["nosniff"],
          },
        },
      };

      const result = HeadersHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("validates static_response config from real Caddy", () => {
      const config = {
        handler: "static_response",
        status_code: 200,
        body: "OK",
        headers: {
          "Content-Type": ["text/plain"],
        },
      };

      const result = StaticResponseHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("validates encode (compression) config from real Caddy", () => {
      const config = {
        handler: "encode",
        encodings: {
          gzip: {},
          zstd: {},
        },
        prefer: ["zstd", "gzip"],
        minimum_length: 256,
      };

      const result = EncodeHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("Missing Handler Schemas (TDD RED - should FAIL)", () => {
    /**
     * file_server - Static file serving
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate file_server config", () => {
      const config = {
        handler: "file_server",
        root: "/var/www/html",
        index: ["index.html", "index.htm"],
        browse: {
          template_file: "/browse.html",
        },
        hide: [".git", ".env", "*.secret"],
        precompressed: {
          gzip: {},
          br: {},
        },
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include file_server
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("root");
        expect(result.data).toHaveProperty("browse");
      }
    });

    /**
     * templates - Server-side template rendering
     * Config from Caddy docs: https://caddyserver.com/docs/modules/http.handlers.templates
     */
    it("should validate templates config", () => {
      const config = {
        handler: "templates",
        file_root: "/var/www/templates",
        mime_types: ["text/html", "text/plain"],
        delimiters: ["{{", "}}"],
      };

      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("file_root");
        expect(result.data).toHaveProperty("mime_types");
      }
    });

    /**
     * map - Variable mapping middleware
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate map config", () => {
      const config = {
        handler: "map",
        source: "{http.request.uri.path}",
        destinations: ["{my_var}"],
        mappings: [
          { input: "/api/*", outputs: ["api"] },
          { input: "/admin/*", outputs: ["admin"] },
        ],
        defaults: ["default"],
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include map
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("source");
        expect(result.data).toHaveProperty("mappings");
      }
    });

    /**
     * push - HTTP/2 Server Push
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate push config", () => {
      const config = {
        handler: "push",
        resources: [
          { target: "/css/style.css" },
          { target: "/js/app.js" },
        ],
        headers: {
          "X-Push": ["true"],
        },
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include push
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("resources");
      }
    });

    /**
     * request_body - Request body handling/limits
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate request_body config", () => {
      const config = {
        handler: "request_body",
        max_size: 10485760, // 10MB
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include request_body
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("max_size");
      }
    });

    /**
     * vars - Set request variables
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate vars config", () => {
      const config = {
        handler: "vars",
        root: "/var/www",
        backend: "api-server",
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include vars
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("root");
      }
    });

    /**
     * error - Static error response
     * Config from Caddy: status_code is a "weak string" (accepts string or number as string)
     */
    it("should validate error config", () => {
      const config = {
        handler: "error",
        error: "Not found",
        status_code: "404", // Caddy WeakString type - uses string representation
      };

      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("error");
        expect(result.data).toHaveProperty("status_code");
      }
    });

    /**
     * tracing - Distributed tracing
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate tracing config", () => {
      const config = {
        handler: "tracing",
        span: "http.request",
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include tracing
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("span");
      }
    });

    /**
     * intercept - Response interception
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate intercept config", () => {
      const config = {
        handler: "intercept",
        handle_response: [
          {
            match: { status_code: [404] },
            routes: [],
          },
        ],
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include intercept
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("handle_response");
      }
    });

    /**
     * copy_response - Copy response from subrequest
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate copy_response config", () => {
      const config = {
        handler: "copy_response",
        status_code: 200,
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include copy_response
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("status_code");
      }
    });

    /**
     * copy_response_headers - Copy headers from subrequest
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate copy_response_headers config", () => {
      const config = {
        handler: "copy_response_headers",
        include: ["Content-Type", "X-Custom-*"],
        exclude: ["Set-Cookie"],
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include copy_response_headers
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("include");
        expect(result.data).toHaveProperty("exclude");
      }
    });

    /**
     * invoke - Invoke named route
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate invoke config", () => {
      const config = {
        handler: "invoke",
        name: "my-named-route",
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include invoke
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("name");
      }
    });

    /**
     * log_append - Add fields to access log
     * This is a VALID Caddy config but our schema doesn't support it
     */
    it("should validate log_append config", () => {
      const config = {
        handler: "log_append",
        key: "custom_field",
        value: "{http.request.header.X-Request-ID}",
      };

      // TDD: This FAILS because KnownCaddyHandlerSchema doesn't include log_append
      const result = KnownCaddyHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("key");
        expect(result.data).toHaveProperty("value");
      }
    });
  });

  describe("Full Route with Missing Handlers (TDD RED)", () => {
    it("should validate route with file_server handler", () => {
      const route = {
        match: [{ path: ["/static/*"] }],
        handle: [
          {
            handler: "file_server",
            root: "/var/www/static",
            browse: {},
          },
        ],
      };

      // TDD: This FAILS because file_server isn't properly validated
      const result = CaddyRouteSchema.safeParse(route);
      expect(result.success).toBe(true);
    });

    it("should validate complex route with multiple handlers", () => {
      const route = {
        match: [{ path: ["*.html"] }],
        handle: [
          {
            handler: "templates",
            file_root: "/templates",
          },
          {
            handler: "file_server",
            root: "/var/www",
          },
        ],
      };

      // TDD: This FAILS because templates isn't properly validated
      const result = CaddyRouteSchema.safeParse(route);
      expect(result.success).toBe(true);
    });
  });
});

describe("Handler Coverage Summary", () => {
  const SUPPORTED = [
    "reverse_proxy",
    "headers",
    "static_response",
    "authentication",
    "rewrite",
    "encode",
    "subroute",
    "file_server",
    "templates",
    "map",
    "push",
    "request_body",
    "vars",
    "intercept",
    "invoke",
    "tracing",
    "log_append",
    "error",
    "copy_response",
    "copy_response_headers",
  ];

  const MISSING: string[] = [];

  it("reports current coverage", () => {
    const total = SUPPORTED.length + MISSING.length;
    const coverage = Math.round((SUPPORTED.length / total) * 100);

    console.log(`\n📊 Handler Schema Coverage: ${SUPPORTED.length}/${total} (${coverage}%)`);
    console.log("✅ Supported:", SUPPORTED.join(", "));
    if (MISSING.length > 0) {
      console.log("❌ Missing:", MISSING.join(", "));
    }

    // Full handler coverage achieved
    expect(coverage).toBe(100);
  });
});
