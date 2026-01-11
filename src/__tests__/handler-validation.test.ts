/**
 * Comprehensive validation tests for all Caddy handler schemas
 *
 * These tests ensure each handler schema:
 * 1. Validates correct configurations
 * 2. Rejects invalid configurations
 * 3. Handles edge cases properly
 */
import { describe, it, expect } from "vitest";
import {
  FileServerHandlerSchema,
  TemplatesHandlerSchema,
  MapHandlerSchema,
  PushHandlerSchema,
  RequestBodyHandlerSchema,
  VarsHandlerSchema,
  InterceptHandlerSchema,
  InvokeHandlerSchema,
  TracingHandlerSchema,
  LogAppendHandlerSchema,
  ErrorHandlerSchema,
  CopyResponseHandlerSchema,
  CopyResponseHeadersHandlerSchema,
  SubrouteHandlerSchema,
  ReverseProxyHandlerSchema,
  HeadersHandlerSchema,
  StaticResponseHandlerSchema,
  EncodeHandlerSchema,
} from "../schemas";

// ============================================================================
// FileServerHandlerSchema Tests
// ============================================================================

describe("FileServerHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = FileServerHandlerSchema.safeParse({
      handler: "file_server",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with root directory", () => {
    const result = FileServerHandlerSchema.safeParse({
      handler: "file_server",
      root: "/var/www/html",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.root).toBe("/var/www/html");
    }
  });

  it("validates full config with all options", () => {
    const result = FileServerHandlerSchema.safeParse({
      handler: "file_server",
      root: "/var/www/html",
      index_names: ["index.html", "index.htm", "default.html"],
      hide: [".git", ".env", "*.secret"],
      browse: {
        template_file: "/templates/browse.html",
        reveal_symlinks: false,
      },
      canonical_uris: true,
      pass_thru: false,
      precompressed_order: ["br", "gzip"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong handler type", () => {
    const result = FileServerHandlerSchema.safeParse({
      handler: "reverse_proxy",
      root: "/var/www",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing handler field", () => {
    const result = FileServerHandlerSchema.safeParse({
      root: "/var/www",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// TemplatesHandlerSchema Tests
// ============================================================================

describe("TemplatesHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = TemplatesHandlerSchema.safeParse({
      handler: "templates",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with file_root", () => {
    const result = TemplatesHandlerSchema.safeParse({
      handler: "templates",
      file_root: "/var/www/templates",
    });
    expect(result.success).toBe(true);
  });

  it("validates full config", () => {
    const result = TemplatesHandlerSchema.safeParse({
      handler: "templates",
      file_root: "/var/www/templates",
      mime_types: ["text/html", "text/plain", "text/markdown"],
      delimiters: ["{{", "}}"],
    });
    expect(result.success).toBe(true);
  });

  it("validates config with custom delimiters", () => {
    const result = TemplatesHandlerSchema.safeParse({
      handler: "templates",
      delimiters: ["[[", "]]"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delimiters).toEqual(["[[", "]]"]);
    }
  });

  it("rejects wrong handler type", () => {
    const result = TemplatesHandlerSchema.safeParse({
      handler: "file_server",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// MapHandlerSchema Tests
// ============================================================================

describe("MapHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = MapHandlerSchema.safeParse({
      handler: "map",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with source and destinations", () => {
    const result = MapHandlerSchema.safeParse({
      handler: "map",
      source: "{http.request.uri.path}",
      destinations: ["{my_var}"],
    });
    expect(result.success).toBe(true);
  });

  it("validates full config with mappings", () => {
    const result = MapHandlerSchema.safeParse({
      handler: "map",
      source: "{http.request.uri.path}",
      destinations: ["{backend}"],
      mappings: [
        { input: "/api/*", outputs: ["api-server"] },
        { input: "/admin/*", outputs: ["admin-server"] },
        { input_regexp: "^/user/\\d+", outputs: ["user-server"] },
      ],
      defaults: ["default-server"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong handler type", () => {
    const result = MapHandlerSchema.safeParse({
      handler: "vars",
      source: "{path}",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// PushHandlerSchema Tests
// ============================================================================

describe("PushHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = PushHandlerSchema.safeParse({
      handler: "push",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with resources", () => {
    const result = PushHandlerSchema.safeParse({
      handler: "push",
      resources: [
        { target: "/css/style.css" },
        { target: "/js/app.js" },
        { target: "/images/logo.png", method: "GET" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("validates config with headers", () => {
    const result = PushHandlerSchema.safeParse({
      handler: "push",
      resources: [{ target: "/css/style.css" }],
      headers: {
        HeaderOps: { set: { "X-Push": ["true"] } },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong handler type", () => {
    const result = PushHandlerSchema.safeParse({
      handler: "headers",
      resources: [],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// RequestBodyHandlerSchema Tests
// ============================================================================

describe("RequestBodyHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = RequestBodyHandlerSchema.safeParse({
      handler: "request_body",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with max_size", () => {
    const result = RequestBodyHandlerSchema.safeParse({
      handler: "request_body",
      max_size: 10485760, // 10MB
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_size).toBe(10485760);
    }
  });

  it("validates config with timeouts", () => {
    const result = RequestBodyHandlerSchema.safeParse({
      handler: "request_body",
      max_size: 1048576,
      read_timeout: "30s",
      write_timeout: "30s",
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong handler type", () => {
    const result = RequestBodyHandlerSchema.safeParse({
      handler: "encode",
      max_size: 1000,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// VarsHandlerSchema Tests
// ============================================================================

describe("VarsHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = VarsHandlerSchema.safeParse({
      handler: "vars",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with custom variables", () => {
    const result = VarsHandlerSchema.safeParse({
      handler: "vars",
      root: "/var/www",
      backend: "api-server",
      environment: "production",
    });
    expect(result.success).toBe(true);
  });

  it("allows arbitrary key-value pairs", () => {
    const result = VarsHandlerSchema.safeParse({
      handler: "vars",
      custom_var_1: "value1",
      custom_var_2: 123,
      custom_var_3: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong handler type", () => {
    const result = VarsHandlerSchema.safeParse({
      handler: "map",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// InterceptHandlerSchema Tests
// ============================================================================

describe("InterceptHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = InterceptHandlerSchema.safeParse({
      handler: "intercept",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with handle_response", () => {
    const result = InterceptHandlerSchema.safeParse({
      handler: "intercept",
      handle_response: [
        {
          match: { status_code: [404] },
          routes: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong handler type", () => {
    const result = InterceptHandlerSchema.safeParse({
      handler: "invoke",
      handle_response: [],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// InvokeHandlerSchema Tests
// ============================================================================

describe("InvokeHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = InvokeHandlerSchema.safeParse({
      handler: "invoke",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with name", () => {
    const result = InvokeHandlerSchema.safeParse({
      handler: "invoke",
      name: "my-named-route",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("my-named-route");
    }
  });

  it("rejects wrong handler type", () => {
    const result = InvokeHandlerSchema.safeParse({
      handler: "tracing",
      name: "route",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// TracingHandlerSchema Tests
// ============================================================================

describe("TracingHandlerSchema", () => {
  it("validates config with span", () => {
    const result = TracingHandlerSchema.safeParse({
      handler: "tracing",
      span: "http.request",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with custom span name", () => {
    const result = TracingHandlerSchema.safeParse({
      handler: "tracing",
      span: "api.endpoint.users",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.span).toBe("api.endpoint.users");
    }
  });

  it("rejects wrong handler type", () => {
    const result = TracingHandlerSchema.safeParse({
      handler: "log_append",
      span: "http.request",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// LogAppendHandlerSchema Tests
// ============================================================================

describe("LogAppendHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = LogAppendHandlerSchema.safeParse({
      handler: "log_append",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with key and value", () => {
    const result = LogAppendHandlerSchema.safeParse({
      handler: "log_append",
      key: "request_id",
      value: "{http.request.header.X-Request-ID}",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with placeholder value", () => {
    const result = LogAppendHandlerSchema.safeParse({
      handler: "log_append",
      key: "user_agent",
      value: "{http.request.header.User-Agent}",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe("user_agent");
    }
  });

  it("rejects wrong handler type", () => {
    const result = LogAppendHandlerSchema.safeParse({
      handler: "error",
      key: "test",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// ErrorHandlerSchema Tests
// ============================================================================

describe("ErrorHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = ErrorHandlerSchema.safeParse({
      handler: "error",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with error message", () => {
    const result = ErrorHandlerSchema.safeParse({
      handler: "error",
      error: "Resource not found",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with status code as string", () => {
    const result = ErrorHandlerSchema.safeParse({
      handler: "error",
      error: "Not Found",
      status_code: "404",
    });
    expect(result.success).toBe(true);
  });

  it("validates common error configurations", () => {
    const configs = [
      { handler: "error", error: "Bad Request", status_code: "400" },
      { handler: "error", error: "Unauthorized", status_code: "401" },
      { handler: "error", error: "Forbidden", status_code: "403" },
      { handler: "error", error: "Not Found", status_code: "404" },
      { handler: "error", error: "Internal Server Error", status_code: "500" },
    ];

    configs.forEach((config) => {
      const result = ErrorHandlerSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  it("rejects wrong handler type", () => {
    const result = ErrorHandlerSchema.safeParse({
      handler: "static_response",
      error: "test",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// CopyResponseHandlerSchema Tests
// ============================================================================

describe("CopyResponseHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = CopyResponseHandlerSchema.safeParse({
      handler: "copy_response",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with status_code", () => {
    const result = CopyResponseHandlerSchema.safeParse({
      handler: "copy_response",
      status_code: 200,
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong handler type", () => {
    const result = CopyResponseHandlerSchema.safeParse({
      handler: "copy_response_headers",
      status_code: 200,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// CopyResponseHeadersHandlerSchema Tests
// ============================================================================

describe("CopyResponseHeadersHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = CopyResponseHeadersHandlerSchema.safeParse({
      handler: "copy_response_headers",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with include list", () => {
    const result = CopyResponseHeadersHandlerSchema.safeParse({
      handler: "copy_response_headers",
      include: ["Content-Type", "Content-Length", "X-Custom-*"],
    });
    expect(result.success).toBe(true);
  });

  it("validates config with exclude list", () => {
    const result = CopyResponseHeadersHandlerSchema.safeParse({
      handler: "copy_response_headers",
      exclude: ["Set-Cookie", "X-Internal-*"],
    });
    expect(result.success).toBe(true);
  });

  it("validates config with both include and exclude", () => {
    const result = CopyResponseHeadersHandlerSchema.safeParse({
      handler: "copy_response_headers",
      include: ["Content-Type", "X-*"],
      exclude: ["X-Internal-*"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong handler type", () => {
    const result = CopyResponseHeadersHandlerSchema.safeParse({
      handler: "copy_response",
      include: [],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// SubrouteHandlerSchema Tests
// ============================================================================

describe("SubrouteHandlerSchema", () => {
  it("validates minimal config", () => {
    const result = SubrouteHandlerSchema.safeParse({
      handler: "subroute",
    });
    expect(result.success).toBe(true);
  });

  it("validates config with empty routes", () => {
    const result = SubrouteHandlerSchema.safeParse({
      handler: "subroute",
      routes: [],
    });
    expect(result.success).toBe(true);
  });

  it("validates config with nested routes", () => {
    const result = SubrouteHandlerSchema.safeParse({
      handler: "subroute",
      routes: [
        {
          match: [{ path: ["/api/*"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "localhost:3000" }] }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong handler type", () => {
    const result = SubrouteHandlerSchema.safeParse({
      handler: "reverse_proxy",
      routes: [],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Existing Handler Schemas (Regression Tests)
// ============================================================================

describe("ReverseProxyHandlerSchema (regression)", () => {
  it("validates config with upstreams", () => {
    const result = ReverseProxyHandlerSchema.safeParse({
      handler: "reverse_proxy",
      upstreams: [{ dial: "localhost:8080" }],
    });
    expect(result.success).toBe(true);
  });

  it("validates config with load balancing", () => {
    const result = ReverseProxyHandlerSchema.safeParse({
      handler: "reverse_proxy",
      upstreams: [
        { dial: "server1:8080" },
        { dial: "server2:8080" },
      ],
      load_balancing: {
        selection_policy: { policy: "round_robin" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates config with health checks", () => {
    const result = ReverseProxyHandlerSchema.safeParse({
      handler: "reverse_proxy",
      upstreams: [{ dial: "localhost:8080" }],
      health_checks: {
        active: {
          path: "/health",
          interval: "10s",
          timeout: "5s",
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("HeadersHandlerSchema (regression)", () => {
  it("validates response headers", () => {
    const result = HeadersHandlerSchema.safeParse({
      handler: "headers",
      response: {
        set: {
          "X-Frame-Options": ["DENY"],
          "X-Content-Type-Options": ["nosniff"],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates request headers", () => {
    const result = HeadersHandlerSchema.safeParse({
      handler: "headers",
      request: {
        set: {
          "X-Forwarded-Proto": ["https"],
        },
        delete: ["X-Powered-By"],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("StaticResponseHandlerSchema (regression)", () => {
  it("validates simple response", () => {
    const result = StaticResponseHandlerSchema.safeParse({
      handler: "static_response",
      status_code: 200,
      body: "OK",
    });
    expect(result.success).toBe(true);
  });

  it("validates response with headers", () => {
    const result = StaticResponseHandlerSchema.safeParse({
      handler: "static_response",
      status_code: 200,
      body: '{"status": "healthy"}',
      headers: {
        "Content-Type": ["application/json"],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("EncodeHandlerSchema (regression)", () => {
  it("validates gzip encoding", () => {
    const result = EncodeHandlerSchema.safeParse({
      handler: "encode",
      encodings: { gzip: {} },
    });
    expect(result.success).toBe(true);
  });

  it("validates multiple encodings with preference", () => {
    const result = EncodeHandlerSchema.safeParse({
      handler: "encode",
      encodings: { gzip: {}, zstd: {}, br: {} },
      prefer: ["zstd", "br", "gzip"],
      minimum_length: 256,
    });
    expect(result.success).toBe(true);
  });
});
