/**
 * Lightweight JSON Schema validator extracted from diagnostics.ts for direct
 * unit testing (see src/__tests__/schema-validator.test.ts), same pattern as
 * completion-data.ts. Reimplements a JSON Schema subset instead of using
 * `ajv` to keep the extension's bundle size small.
 */
import * as path from "path";
import * as fs from "fs";

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

const MAX_VALIDATION_DEPTH = 10;

export class SimpleSchemaValidator {
  private schemas: Map<string, object> = new Map();
  private extensionPath: string;
  private log: (message: string) => void;

  constructor(extensionPath: string, log?: (message: string) => void) {
    this.extensionPath = extensionPath;
    this.log = log ?? (() => {});
    this.loadSchemas();
  }

  private loadSchemas(): void {
    const schemasDir = path.join(this.extensionPath, "schemas");

    if (!fs.existsSync(schemasDir)) {
      return;
    }

    const schemaFiles = fs.readdirSync(schemasDir).filter((f) => f.endsWith(".json"));

    for (const file of schemaFiles) {
      try {
        const schemaPath = path.join(schemasDir, file);
        const content = fs.readFileSync(schemaPath, "utf-8");
        const schema = JSON.parse(content) as object;
        this.schemas.set(file, schema);
      } catch {
        // Ignore invalid schema files
      }
    }
  }

  getSchemaForFile(fileName: string): object | undefined {
    const basename = path.basename(fileName).toLowerCase();

    // Portal/policy checked before the generic caddy-security check: a
    // filename like "auth.caddy-security-portal.json" also contains the
    // substring "caddy-security" and would otherwise match that branch first.
    if (basename.includes("portal")) {
      return this.schemas.get("caddy-security-portal.json");
    }

    if (basename.includes("policy")) {
      return this.schemas.get("caddy-security-policy.json");
    }

    if (basename.includes("caddy-security") || basename.includes("security-config")) {
      return this.schemas.get("caddy-security-config.json");
    }

    if (basename.endsWith(".caddy.json") || basename === "caddy.json") {
      return this.schemas.get("caddy-route.json");
    }

    return undefined;
  }

  /**
   * Validates JSON data against a schema
   * Returns validation errors with paths and messages
   */
  validate(data: unknown, schema: object): ValidationError[] {
    const errors: ValidationError[] = [];
    const visited = new WeakSet<object>(); // Track visited objects for circular ref detection
    const startTime = performance.now();
    this.validateObject(data, schema as Record<string, unknown>, "", errors, 0, visited);
    this.log(
      `Validation completed in ${(performance.now() - startTime).toFixed(2)}ms, ${errors.length} errors found`
    );
    return errors;
  }

  private validateObject(
    data: unknown,
    schema: Record<string, unknown>,
    currentPath: string,
    errors: ValidationError[],
    depth: number = 0,
    visited: WeakSet<object> = new WeakSet()
  ): void {
    // Depth guard to prevent excessive recursion
    if (depth > MAX_VALIDATION_DEPTH) {
      this.log(`Max depth (${MAX_VALIDATION_DEPTH}) exceeded at path: ${currentPath}`);
      return;
    }

    // Circular reference detection for objects
    if (typeof data === "object" && data !== null) {
      if (visited.has(data)) {
        this.log(`Circular reference detected at path: ${currentPath}`);
        return;
      }
      visited.add(data);
    }
    // Check type constraints
    const schemaType = schema.type as string | string[] | undefined;

    if (schemaType) {
      const types = Array.isArray(schemaType) ? schemaType : [schemaType];
      const actualType = this.getJsonType(data);

      if (!types.includes(actualType) && !(types.includes("null") && data === null)) {
        errors.push({
          path: currentPath || "$",
          message: `Expected ${types.join(" | ")}, got ${actualType}`,
          keyword: "type",
        });
        return;
      }
    }

    // Check required properties
    const required = schema.required as string[] | undefined;
    if (required && typeof data === "object" && data !== null) {
      for (const prop of required) {
        if (!(prop in data)) {
          errors.push({
            path: currentPath ? `${currentPath}.${prop}` : prop,
            message: `Missing required property: ${prop}`,
            keyword: "required",
          });
        }
      }
    }

    // Check properties
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties && typeof data === "object" && data !== null) {
      const dataObj = data as Record<string, unknown>;

      for (const [key, value] of Object.entries(dataObj)) {
        const propSchema = properties[key];
        if (propSchema) {
          const propPath = currentPath ? `${currentPath}.${key}` : key;
          this.validateObject(value, propSchema, propPath, errors, depth + 1, visited);
        }
      }
    }

    // Check additionalProperties
    const additionalProperties = schema.additionalProperties;
    if (additionalProperties === false && properties && typeof data === "object" && data !== null) {
      const dataObj = data as Record<string, unknown>;
      const allowedKeys = new Set(Object.keys(properties));

      for (const key of Object.keys(dataObj)) {
        if (!allowedKeys.has(key)) {
          errors.push({
            path: currentPath ? `${currentPath}.${key}` : key,
            message: `Unexpected property: ${key}`,
            keyword: "additionalProperties",
          });
        }
      }
    }

    // Check array items
    const items = schema.items as Record<string, unknown> | undefined;
    if (items && Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const itemPath = `${currentPath}[${i}]`;
        this.validateObject(data[i], items, itemPath, errors, depth + 1, visited);
      }
    }

    // Check enum values
    const enumValues = schema.enum as unknown[] | undefined;
    if (enumValues) {
      if (!enumValues.includes(data)) {
        errors.push({
          path: currentPath || "$",
          message: `Value must be one of: ${enumValues.map((v) => JSON.stringify(v)).join(", ")}`,
          keyword: "enum",
        });
      }
    }

    // Check const value
    const constValue = schema.const;
    if (constValue !== undefined && data !== constValue) {
      errors.push({
        path: currentPath || "$",
        message: `Value must be: ${JSON.stringify(constValue)}`,
        keyword: "const",
      });
    }

    // Check string constraints
    if (typeof data === "string") {
      const minLength = schema.minLength as number | undefined;
      const maxLength = schema.maxLength as number | undefined;
      const pattern = schema.pattern as string | undefined;

      if (minLength !== undefined && data.length < minLength) {
        errors.push({
          path: currentPath || "$",
          message: `String must be at least ${minLength} characters`,
          keyword: "minLength",
        });
      }

      if (maxLength !== undefined && data.length > maxLength) {
        errors.push({
          path: currentPath || "$",
          message: `String must be at most ${maxLength} characters`,
          keyword: "maxLength",
        });
      }

      if (pattern) {
        try {
          const regex = new RegExp(pattern);
          if (!regex.test(data)) {
            errors.push({
              path: currentPath || "$",
              message: `String must match pattern: ${pattern}`,
              keyword: "pattern",
            });
          }
        } catch {
          // Invalid regex pattern in schema
        }
      }
    }

    // Check number constraints
    if (typeof data === "number") {
      const minimum = schema.minimum as number | undefined;
      const maximum = schema.maximum as number | undefined;

      if (minimum !== undefined && data < minimum) {
        errors.push({
          path: currentPath || "$",
          message: `Value must be >= ${minimum}`,
          keyword: "minimum",
        });
      }

      if (maximum !== undefined && data > maximum) {
        errors.push({
          path: currentPath || "$",
          message: `Value must be <= ${maximum}`,
          keyword: "maximum",
        });
      }
    }

    // Check oneOf (discriminated unions)
    const oneOf = schema.oneOf as Record<string, unknown>[] | undefined;
    if (oneOf) {
      this.validateOneOf(data, oneOf, currentPath, errors, depth, visited);
    }

    // Check anyOf
    const anyOf = schema.anyOf as Record<string, unknown>[] | undefined;
    if (anyOf) {
      const anyValid = anyOf.some((subSchema) => {
        const subErrors: ValidationError[] = [];
        this.validateObject(data, subSchema, currentPath, subErrors, depth + 1, visited);
        return subErrors.length === 0;
      });

      if (!anyValid) {
        errors.push({
          path: currentPath || "$",
          message: "Value does not match any of the allowed schemas",
          keyword: "anyOf",
        });
      }
    }
  }

  private validateOneOf(
    data: unknown,
    oneOf: Record<string, unknown>[],
    currentPath: string,
    errors: ValidationError[],
    depth: number,
    visited: WeakSet<object>
  ): void {
    // For handler discriminated unions, check if data has handler property
    if (typeof data === "object" && data !== null && "handler" in data) {
      const handlerValue = (data as Record<string, unknown>).handler;

      // Find matching schema by handler const value
      const matchingSchema = oneOf.find((schema) => {
        const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
        if (props?.handler?.const === handlerValue) {
          return true;
        }
        return false;
      });

      if (matchingSchema) {
        this.validateObject(data, matchingSchema, currentPath, errors, depth + 1, visited);
        return;
      } else if (typeof handlerValue === "string") {
        // Check if handler value is valid at all
        const validHandlers = oneOf
          .map((s) => {
            const props = s.properties as Record<string, Record<string, unknown>> | undefined;
            return props?.handler?.const;
          })
          .filter(Boolean);

        if (validHandlers.length > 0) {
          errors.push({
            path: currentPath ? `${currentPath}.handler` : "handler",
            message: `Unknown handler type: "${handlerValue}". Valid types: ${validHandlers.map((h) => `"${h}"`).join(", ")}`,
            keyword: "oneOf",
          });
          return;
        }
      }
    }

    // Generic oneOf validation - check if exactly one matches
    const matchResults = oneOf.map((schema) => {
      const subErrors: ValidationError[] = [];
      this.validateObject(data, schema, currentPath, subErrors, depth + 1, visited);
      return subErrors.length === 0;
    });

    const matchCount = matchResults.filter(Boolean).length;

    if (matchCount === 0) {
      errors.push({
        path: currentPath || "$",
        message: "Value does not match any of the expected schemas",
        keyword: "oneOf",
      });
    } else if (matchCount > 1) {
      errors.push({
        path: currentPath || "$",
        message: "Value matches multiple schemas when only one should match",
        keyword: "oneOf",
      });
    }
  }

  private getJsonType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }
}
