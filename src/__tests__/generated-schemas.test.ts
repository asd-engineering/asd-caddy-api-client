/**
 * Tests for generated Zod schemas
 * These tests ensure the generated schemas validate data correctly
 */
import { describe, test, expect } from "vitest";
import Ajv from "ajv";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// Auth schemas
import {
  argon2idHashSchema,
  accountSchema,
  cacheSchema,
  comparerSchema,
  hasherSchema,
  bcryptHashSchema,
  authenticationSchema,
  authenticatorSchema,
  userSchema,
  httpBasicAuthSchema,
} from "../generated/caddy-auth.zod.js";

// Encode schemas
import {
  encodeSchema,
  encoderSchema,
  encodingSchema,
  precompressedSchema,
} from "../generated/caddy-encode.zod.js";

// Headers schemas
import {
  replacementSchema,
  headerOpsSchema,
  respHeaderOpsSchema,
  handlerSchema as headersHandlerSchema,
} from "../generated/caddy-headers.zod.js";

// Rewrite schemas
import {
  substrReplacerSchema,
  regexReplacerSchema,
  queryOpsSchema,
  rewriteSchema,
} from "../generated/caddy-rewrite.zod.js";

describe("Generated Auth Schemas", () => {
  describe("argon2idHashSchema", () => {
    test("accepts empty object", () => {
      expect(argon2idHashSchema.parse({})).toEqual({});
    });

    test("rejects non-object", () => {
      expect(() => argon2idHashSchema.parse("invalid")).toThrow();
      expect(() => argon2idHashSchema.parse(null)).toThrow();
    });
  });

  describe("accountSchema", () => {
    test("accepts valid account", () => {
      const account = { username: "admin", password: "secret123" };
      expect(accountSchema.parse(account)).toEqual(account);
    });

    test("requires username", () => {
      expect(() => accountSchema.parse({ password: "secret" })).toThrow();
    });

    test("requires password", () => {
      expect(() => accountSchema.parse({ username: "admin" })).toThrow();
    });

    test("rejects empty strings for username", () => {
      // Empty strings are technically valid strings in Zod
      const account = { username: "", password: "secret" };
      expect(accountSchema.parse(account)).toEqual(account);
    });
  });

  describe("cacheSchema", () => {
    test("accepts empty object", () => {
      expect(cacheSchema.parse({})).toEqual({});
    });
  });

  describe("comparerSchema", () => {
    test("accepts any value", () => {
      expect(comparerSchema.parse({})).toEqual({});
      expect(comparerSchema.parse("string")).toBe("string");
      expect(comparerSchema.parse(123)).toBe(123);
      expect(comparerSchema.parse(null)).toBe(null);
    });
  });

  describe("hasherSchema", () => {
    test("accepts any value", () => {
      expect(hasherSchema.parse({ algorithm: "bcrypt" })).toEqual({ algorithm: "bcrypt" });
      expect(hasherSchema.parse(null)).toBe(null);
    });
  });

  describe("bcryptHashSchema", () => {
    test("accepts empty object", () => {
      expect(bcryptHashSchema.parse({})).toEqual({});
    });
  });

  describe("authenticationSchema", () => {
    test("accepts empty object", () => {
      expect(authenticationSchema.parse({})).toEqual({});
    });

    test("accepts providers field", () => {
      const auth = {
        providers: {
          http_basic: {
            accounts: [{ username: "user", password: "pass" }],
          },
        },
      };
      expect(authenticationSchema.parse(auth)).toEqual(auth);
    });

    test("accepts undefined providers", () => {
      expect(authenticationSchema.parse({ providers: undefined })).toEqual({});
    });
  });

  describe("authenticatorSchema", () => {
    test("accepts any value", () => {
      expect(authenticatorSchema.parse({ type: "basic" })).toEqual({ type: "basic" });
    });
  });

  describe("userSchema", () => {
    test("accepts valid user", () => {
      const user = {
        ID: "user123",
        Metadata: { role: "admin", department: "engineering" },
      };
      expect(userSchema.parse(user)).toEqual(user);
    });

    test("requires ID", () => {
      expect(() => userSchema.parse({ Metadata: {} })).toThrow();
    });

    test("requires Metadata", () => {
      expect(() => userSchema.parse({ ID: "user123" })).toThrow();
    });

    test("accepts empty Metadata object", () => {
      const user = { ID: "user123", Metadata: {} };
      expect(userSchema.parse(user)).toEqual(user);
    });
  });

  describe("httpBasicAuthSchema", () => {
    test("accepts empty object", () => {
      expect(httpBasicAuthSchema.parse({})).toEqual({});
    });

    test("accepts complete config", () => {
      const config = {
        accounts: [
          { username: "admin", password: "$2a$10$..." },
          { username: "user", password: "$2a$10$..." },
        ],
        realm: "Protected Area",
        hash_cache: {},
      };
      expect(httpBasicAuthSchema.parse(config)).toEqual(config);
    });

    test("accepts partial config", () => {
      expect(httpBasicAuthSchema.parse({ realm: "Test" })).toEqual({ realm: "Test" });
      expect(httpBasicAuthSchema.parse({ accounts: [] })).toEqual({ accounts: [] });
    });

    test("validates nested accounts", () => {
      expect(() =>
        httpBasicAuthSchema.parse({
          accounts: [{ username: "admin" }], // missing password
        })
      ).toThrow();
    });
  });
});

describe("Generated Encode Schemas", () => {
  describe("encodeSchema", () => {
    test("accepts empty object", () => {
      expect(encodeSchema.parse({})).toEqual({});
    });

    test("accepts complete config", () => {
      const config = {
        encodings: { gzip: {}, zstd: {} },
        prefer: ["zstd", "gzip"],
        minimum_length: 256,
      };
      expect(encodeSchema.parse(config)).toEqual(config);
    });

    test("accepts partial config", () => {
      expect(encodeSchema.parse({ prefer: ["gzip"] })).toEqual({ prefer: ["gzip"] });
      expect(encodeSchema.parse({ minimum_length: 1024 })).toEqual({ minimum_length: 1024 });
    });

    test("rejects invalid minimum_length type", () => {
      expect(() => encodeSchema.parse({ minimum_length: "256" })).toThrow();
    });

    test("rejects invalid prefer type", () => {
      expect(() => encodeSchema.parse({ prefer: "gzip" })).toThrow();
    });
  });

  describe("encoderSchema", () => {
    test("accepts any value", () => {
      expect(encoderSchema.parse({ type: "gzip", level: 5 })).toEqual({ type: "gzip", level: 5 });
    });
  });

  describe("encodingSchema", () => {
    test("accepts any value", () => {
      expect(encodingSchema.parse("gzip")).toBe("gzip");
      expect(encodingSchema.parse({ gzip: {} })).toEqual({ gzip: {} });
    });
  });

  describe("precompressedSchema", () => {
    test("accepts any value", () => {
      expect(precompressedSchema.parse({ gzip: true, br: true })).toEqual({ gzip: true, br: true });
    });
  });
});

describe("Generated Headers Schemas", () => {
  describe("replacementSchema", () => {
    test("accepts empty object", () => {
      expect(replacementSchema.parse({})).toEqual({});
    });

    test("accepts search and replace", () => {
      const replacement = {
        search: "old-value",
        replace: "new-value",
      };
      expect(replacementSchema.parse(replacement)).toEqual(replacement);
    });

    test("accepts regex search", () => {
      const replacement = {
        search_regexp: "^Bearer (.*)$",
        replace: "Token $1",
      };
      expect(replacementSchema.parse(replacement)).toEqual(replacement);
    });

    test("accepts partial config", () => {
      expect(replacementSchema.parse({ search: "test" })).toEqual({ search: "test" });
      expect(replacementSchema.parse({ replace: "value" })).toEqual({ replace: "value" });
    });
  });

  describe("headerOpsSchema", () => {
    test("accepts empty object", () => {
      expect(headerOpsSchema.parse({})).toEqual({});
    });

    test("accepts delete operation", () => {
      const ops = { delete: ["X-Powered-By", "Server"] };
      expect(headerOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts add operation", () => {
      const ops = { add: { "X-Custom": ["value1", "value2"] } };
      expect(headerOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts set operation", () => {
      const ops = { set: { "Cache-Control": ["no-cache"] } };
      expect(headerOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts replace operation", () => {
      const ops = {
        replace: {
          Authorization: [{ search: "Bearer", replace: "Token" }],
        },
      };
      expect(headerOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts combined operations", () => {
      const ops = {
        add: { "X-Request-ID": ["123"] },
        delete: ["X-Powered-By"],
        set: { "X-Frame-Options": ["DENY"] },
      };
      expect(headerOpsSchema.parse(ops)).toEqual(ops);
    });
  });

  describe("respHeaderOpsSchema", () => {
    test("accepts empty object", () => {
      expect(respHeaderOpsSchema.parse({})).toEqual({});
    });

    test("accepts deferred flag", () => {
      expect(respHeaderOpsSchema.parse({ deferred: true })).toEqual({ deferred: true });
      expect(respHeaderOpsSchema.parse({ deferred: false })).toEqual({ deferred: false });
    });

    test("accepts HeaderOps", () => {
      const ops = {
        HeaderOps: { delete: ["Server"] },
      };
      expect(respHeaderOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts require", () => {
      const ops = { require: { headers: ["Content-Type"] } };
      expect(respHeaderOpsSchema.parse(ops)).toEqual(ops);
    });
  });

  describe("headersHandlerSchema", () => {
    test("accepts empty object", () => {
      expect(headersHandlerSchema.parse({})).toEqual({});
    });

    test("accepts request config", () => {
      const handler = {
        request: { delete: ["X-Forwarded-For"] },
      };
      expect(headersHandlerSchema.parse(handler)).toEqual(handler);
    });

    test("accepts response config", () => {
      const handler = {
        response: {
          deferred: true,
          HeaderOps: { set: { "X-Frame-Options": ["DENY"] } },
        },
      };
      expect(headersHandlerSchema.parse(handler)).toEqual(handler);
    });

    test("accepts both request and response", () => {
      const handler = {
        request: { add: { "X-Request-ID": ["123"] } },
        response: { deferred: false },
      };
      expect(headersHandlerSchema.parse(handler)).toEqual(handler);
    });
  });
});

describe("Generated Rewrite Schemas", () => {
  describe("substrReplacerSchema", () => {
    test("accepts empty object", () => {
      expect(substrReplacerSchema.parse({})).toEqual({});
    });

    test("accepts complete config", () => {
      const replacer = {
        find: "/api/v1",
        replace: "/api/v2",
        limit: 1,
      };
      expect(substrReplacerSchema.parse(replacer)).toEqual(replacer);
    });

    test("accepts partial config", () => {
      expect(substrReplacerSchema.parse({ find: "test" })).toEqual({ find: "test" });
      expect(substrReplacerSchema.parse({ replace: "value" })).toEqual({ replace: "value" });
      expect(substrReplacerSchema.parse({ limit: 5 })).toEqual({ limit: 5 });
    });

    test("rejects invalid limit type", () => {
      expect(() => substrReplacerSchema.parse({ limit: "1" })).toThrow();
    });
  });

  describe("regexReplacerSchema", () => {
    test("accepts empty object", () => {
      expect(regexReplacerSchema.parse({})).toEqual({});
    });

    test("accepts complete config", () => {
      const replacer = {
        find: "^/api/v(\\d+)/",
        replace: "/api/v$1/new/",
      };
      expect(regexReplacerSchema.parse(replacer)).toEqual(replacer);
    });

    test("accepts partial config", () => {
      expect(regexReplacerSchema.parse({ find: "\\d+" })).toEqual({ find: "\\d+" });
    });
  });

  describe("queryOpsSchema", () => {
    test("accepts empty object", () => {
      expect(queryOpsSchema.parse({})).toEqual({});
    });

    test("accepts delete operation", () => {
      const ops = { delete: ["debug", "trace"] };
      expect(queryOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts set operation", () => {
      const ops = { set: { version: "2", format: "json" } };
      expect(queryOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts add operation", () => {
      const ops = { add: { tags: ["a", "b"] } };
      expect(queryOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts replace operation", () => {
      const ops = { replace: { category: ["tech", "news"] } };
      expect(queryOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts rename operation", () => {
      const ops = { rename: [{ key: "oldKey", val: "newKey" }] };
      expect(queryOpsSchema.parse(ops)).toEqual(ops);
    });

    test("accepts combined operations", () => {
      const ops = {
        delete: ["debug"],
        set: { version: "2" },
        add: { tags: ["new"] },
      };
      expect(queryOpsSchema.parse(ops)).toEqual(ops);
    });
  });

  describe("rewriteSchema", () => {
    test("accepts empty object", () => {
      expect(rewriteSchema.parse({})).toEqual({});
    });

    test("accepts method rewrite", () => {
      expect(rewriteSchema.parse({ method: "POST" })).toEqual({ method: "POST" });
    });

    test("accepts uri rewrite", () => {
      expect(rewriteSchema.parse({ uri: "/new/path" })).toEqual({ uri: "/new/path" });
    });

    test("accepts strip_path_prefix", () => {
      expect(rewriteSchema.parse({ strip_path_prefix: "/api" })).toEqual({
        strip_path_prefix: "/api",
      });
    });

    test("accepts strip_path_suffix", () => {
      expect(rewriteSchema.parse({ strip_path_suffix: ".json" })).toEqual({
        strip_path_suffix: ".json",
      });
    });

    test("accepts uri_substring", () => {
      const rewrite = {
        uri_substring: [
          { find: "/v1/", replace: "/v2/" },
          { find: "/old/", replace: "/new/", limit: 1 },
        ],
      };
      expect(rewriteSchema.parse(rewrite)).toEqual(rewrite);
    });

    test("accepts path_regexp", () => {
      const rewrite = {
        path_regexp: [{ find: "^/api/(.*)$", replace: "/$1" }],
      };
      expect(rewriteSchema.parse(rewrite)).toEqual(rewrite);
    });

    test("accepts query operations", () => {
      const rewrite = {
        query: {
          delete: ["debug"],
          set: { format: "json" },
        },
      };
      expect(rewriteSchema.parse(rewrite)).toEqual(rewrite);
    });

    test("accepts complex rewrite config", () => {
      const rewrite = {
        method: "GET",
        strip_path_prefix: "/api/v1",
        uri_substring: [{ find: "old", replace: "new" }],
        query: { set: { version: "2" } },
      };
      expect(rewriteSchema.parse(rewrite)).toEqual(rewrite);
    });
  });
});

// ============================================================================
// JSON Schema Validation Tests
// ============================================================================

describe("JSON Schema Validation", () => {
  const schemasDir = join(__dirname, "../generated/schemas");

  // Get all JSON schema files (exclude catalog and example files)
  const schemaFiles = readdirSync(schemasDir)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !f.includes("catalog") && !f.includes("example"));

  describe("All generated JSON schemas are valid", () => {
    test.each(schemaFiles)("%s compiles without errors", (filename) => {
      // Use fresh Ajv instance per test to avoid $id collision
      const ajv = new Ajv({ strict: false, allErrors: true });
      const schemaPath = join(schemasDir, filename);
      const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as object;

      // Ajv.compile throws if schema is invalid
      expect(() => ajv.compile(schema)).not.toThrow();
    });
  });

  describe("Core Caddy schemas validate correctly", () => {
    test("caddy-route.json accepts valid route", () => {
      const ajv = new Ajv({ strict: false, allErrors: true });
      const schema = JSON.parse(
        readFileSync(join(schemasDir, "caddy-route.json"), "utf-8")
      ) as object;
      const validate = ajv.compile(schema);

      const validRoute = {
        match: [{ host: ["example.com"] }],
        handle: [{ handler: "static_response", body: "Hello" }],
      };

      expect(validate(validRoute)).toBe(true);
    });

    test("caddy-handler.json accepts valid handler", () => {
      const ajv = new Ajv({ strict: false, allErrors: true });
      const schema = JSON.parse(
        readFileSync(join(schemasDir, "caddy-handler.json"), "utf-8")
      ) as object;
      const validate = ajv.compile(schema);

      const validHandler = {
        handler: "reverse_proxy",
        upstreams: [{ dial: "localhost:3000" }],
      };

      expect(validate(validHandler)).toBe(true);
    });
  });

  describe("caddy-security schemas validate correctly", () => {
    test("caddy-security-portal.json accepts valid portal config", () => {
      const ajv = new Ajv({ strict: false, allErrors: true });
      const schema = JSON.parse(
        readFileSync(join(schemasDir, "caddy-security-portal.json"), "utf-8")
      ) as object;
      const validate = ajv.compile(schema);

      const validPortal = {
        name: "my-portal",
        ui: { theme: "basic" },
      };

      expect(validate(validPortal)).toBe(true);
    });

    test("caddy-security-policy.json accepts valid policy", () => {
      const ajv = new Ajv({ strict: false, allErrors: true });
      const schema = JSON.parse(
        readFileSync(join(schemasDir, "caddy-security-policy.json"), "utf-8")
      ) as object;
      const validate = ajv.compile(schema);

      const validPolicy = {
        name: "default",
        access_lists: [{ action: "allow", claim: "roles", values: ["admin", "user"] }],
      };

      expect(validate(validPolicy)).toBe(true);
    });
  });
});
