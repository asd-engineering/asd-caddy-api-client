/**
 * Unit tests for SimpleSchemaValidator, extracted from diagnostics.ts,
 * which previously had zero test coverage of any kind.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SimpleSchemaValidator } from "../../vscode-extension/src/providers/schema-validator.js";

// extensionPath doesn't need to exist on disk for these tests -- validate()
// takes the schema directly and never touches the loaded schema map.
const validator = new SimpleSchemaValidator("/nonexistent");

describe("SimpleSchemaValidator.validate", () => {
  test("passes when data matches a simple object schema", () => {
    const schema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };
    expect(validator.validate({ name: "x" }, schema)).toEqual([]);
  });

  test("type mismatch produces a 'type' error", () => {
    const schema = { type: "string" };
    const errors = validator.validate(42, schema);
    expect(errors).toEqual([
      { path: "$", message: "Expected string, got number", keyword: "type" },
    ]);
  });

  test("null is accepted when 'null' is one of a union type", () => {
    const schema = { type: ["string", "null"] };
    expect(validator.validate(null, schema)).toEqual([]);
  });

  test("missing required property produces a 'required' error", () => {
    const schema = {
      type: "object",
      properties: { host: { type: "string" } },
      required: ["host"],
    };
    const errors = validator.validate({}, schema);
    expect(errors).toEqual([
      { path: "host", message: "Missing required property: host", keyword: "required" },
    ]);
  });

  test("missing required nested property gets a dotted path", () => {
    const schema = {
      type: "object",
      properties: {
        match: { type: "object", properties: { host: {} }, required: ["host"] },
      },
    };
    const errors = validator.validate({ match: {} }, schema);
    expect(errors).toEqual([
      { path: "match.host", message: "Missing required property: host", keyword: "required" },
    ]);
  });

  test("additionalProperties: false rejects unknown keys", () => {
    const schema = {
      type: "object",
      properties: { handler: { type: "string" } },
      additionalProperties: false,
    };
    const errors = validator.validate({ handler: "x", upstream: [] }, schema);
    expect(errors).toEqual([
      {
        path: "upstream",
        message: "Unexpected property: upstream",
        keyword: "additionalProperties",
      },
    ]);
  });

  test("additionalProperties: false does NOT reject known keys", () => {
    const schema = {
      type: "object",
      properties: { handler: { type: "string" } },
      additionalProperties: false,
    };
    expect(validator.validate({ handler: "x" }, schema)).toEqual([]);
  });

  test("array items are validated element-by-element with indexed paths", () => {
    const schema = { type: "array", items: { type: "string" } };
    const errors = validator.validate(["a", 2, "c"], schema);
    expect(errors).toEqual([
      { path: "[1]", message: "Expected string, got number", keyword: "type" },
    ]);
  });

  test("enum rejects a value not in the list", () => {
    const schema = { enum: ["http", "https", "grpc"] };
    const errors = validator.validate("ftp", schema);
    expect(errors).toEqual([
      {
        path: "$",
        message: 'Value must be one of: "http", "https", "grpc"',
        keyword: "enum",
      },
    ]);
  });

  test("const rejects a mismatched value", () => {
    const schema = { const: "reverse_proxy" };
    const errors = validator.validate("rewrite", schema);
    expect(errors).toEqual([
      { path: "$", message: 'Value must be: "reverse_proxy"', keyword: "const" },
    ]);
  });

  test.each([
    [{ minLength: 3 }, "ab", "minLength", "String must be at least 3 characters"],
    [{ maxLength: 2 }, "abc", "maxLength", "String must be at most 2 characters"],
    [{ pattern: "^[a-z]+$" }, "ABC", "pattern", "String must match pattern: ^[a-z]+$"],
  ])("string constraint %o rejects %s", (schema, value, keyword, message) => {
    const errors = validator.validate(value, schema);
    expect(errors).toEqual([{ path: "$", message, keyword }]);
  });

  test("an invalid regex pattern in the schema is silently ignored, not thrown", () => {
    const schema = { pattern: "(unterminated" };
    expect(() => validator.validate("x", schema)).not.toThrow();
    expect(validator.validate("x", schema)).toEqual([]);
  });

  test.each([
    [{ minimum: 10 }, 5, "minimum", "Value must be >= 10"],
    [{ maximum: 10 }, 15, "maximum", "Value must be <= 10"],
  ])("number constraint %o rejects %s", (schema, value, keyword, message) => {
    const errors = validator.validate(value, schema);
    expect(errors).toEqual([{ path: "$", message, keyword }]);
  });

  test("anyOf passes when at least one branch matches", () => {
    const schema = { anyOf: [{ type: "string" }, { type: "number" }] };
    expect(validator.validate(5, schema)).toEqual([]);
  });

  test("anyOf fails when no branch matches", () => {
    const schema = { anyOf: [{ type: "string" }, { type: "number" }] };
    const errors = validator.validate(true, schema);
    expect(errors).toEqual([
      { path: "$", message: "Value does not match any of the allowed schemas", keyword: "anyOf" },
    ]);
  });

  test("depth guard stops recursion past MAX_VALIDATION_DEPTH without throwing", () => {
    // Build a schema 15 levels deep -- past the internal depth guard (10).
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 15; i++) {
      schema = { type: "object", properties: { next: schema } };
    }
    let data: unknown = 42; // wrong type at the bottom
    for (let i = 0; i < 15; i++) {
      data = { next: data };
    }
    expect(() => validator.validate(data, schema)).not.toThrow();
  });

  test("circular references in the data are detected and don't hang", () => {
    const schema = { type: "object", properties: {} };
    const data: Record<string, unknown> = {};
    data.self = data;
    expect(() => validator.validate(data, schema)).not.toThrow();
  });
});

describe("SimpleSchemaValidator.validate -- oneOf (handler discriminated unions)", () => {
  const handlerUnion = {
    oneOf: [
      {
        type: "object",
        properties: { handler: { const: "reverse_proxy" }, upstreams: { type: "array" } },
        required: ["handler"],
      },
      {
        type: "object",
        properties: { handler: { const: "static_response" }, body: { type: "string" } },
        required: ["handler"],
      },
    ],
  };

  test("routes to the matching branch by the 'handler' const", () => {
    const errors = validator.validate({ handler: "static_response", body: "hi" }, handlerUnion);
    expect(errors).toEqual([]);
  });

  test("an unknown handler value lists the valid handler names", () => {
    const errors = validator.validate({ handler: "bogus" }, handlerUnion);
    expect(errors).toEqual([
      {
        path: "handler",
        message: 'Unknown handler type: "bogus". Valid types: "reverse_proxy", "static_response"',
        keyword: "oneOf",
      },
    ]);
  });

  test("generic oneOf (no 'handler' discriminator) fails when zero schemas match", () => {
    const schema = { oneOf: [{ type: "string" }, { type: "number" }] };
    const errors = validator.validate(true, schema);
    expect(errors).toEqual([
      { path: "$", message: "Value does not match any of the expected schemas", keyword: "oneOf" },
    ]);
  });

  test("generic oneOf fails when more than one schema matches", () => {
    const schema = { oneOf: [{ type: "number" }, { minimum: 0 }] };
    const errors = validator.validate(5, schema);
    expect(errors).toEqual([
      {
        path: "$",
        message: "Value matches multiple schemas when only one should match",
        keyword: "oneOf",
      },
    ]);
  });
});

describe("SimpleSchemaValidator.getSchemaForFile", () => {
  // getSchemaForFile only returns a schema that was actually loaded from
  // <extensionPath>/schemas/*.json at construction time, so point a real
  // instance at a temp dir with small fixture schema files to exercise the
  // real filename-pattern-matching logic end-to-end.
  let tmpDir: string;
  let v: SimpleSchemaValidator;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "schema-validator-test-"));
    const schemasDir = join(tmpDir, "schemas");
    mkdirSync(schemasDir);
    for (const name of [
      "caddy-route.json",
      "caddy-security-config.json",
      "caddy-security-portal.json",
      "caddy-security-policy.json",
    ]) {
      writeFileSync(join(schemasDir, name), JSON.stringify({ $marker: name }));
    }
    v = new SimpleSchemaValidator(tmpDir);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test.each([
    ["route.caddy.json", "caddy-route.json"],
    ["caddy.json", "caddy-route.json"],
    ["my-app.caddy.json", "caddy-route.json"],
    ["caddy-security.json", "caddy-security-config.json"],
    ["security-config.json", "caddy-security-config.json"],
    ["auth.caddy-security-portal.json", "caddy-security-portal.json"],
    ["auth.caddy-security-policy.json", "caddy-security-policy.json"],
  ])("%s resolves to %s", (fileName, expectedMarker) => {
    expect(v.getSchemaForFile(fileName)).toEqual({ $marker: expectedMarker });
  });

  test("an unrecognized filename resolves to no schema", () => {
    expect(v.getSchemaForFile("package.json")).toBeUndefined();
  });

  test("caddy-server.json and caddy-full.json are NOT recognized, unlike VS Code's own jsonValidation contribution", () => {
    // getSchemaForFile has no branch for these two patterns, unlike
    // package.json's jsonValidation contribution -- documented current
    // behavior, not asserted correct.
    expect(v.getSchemaForFile("caddy-server.json")).toBeUndefined();
    expect(v.getSchemaForFile("caddy-full.json")).toBeUndefined();
  });
});
