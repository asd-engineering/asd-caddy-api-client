/**
 * Diagnostics Provider for Caddy configurations
 *
 * Provides real-time validation of JSON configurations using JSON Schemas
 * derived from the library's Zod schemas.
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Schema validation result
interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

/**
 * Lightweight JSON Schema validator for VSCode
 * Uses a simple validation approach without heavy dependencies
 */
class SimpleSchemaValidator {
  private schemas: Map<string, object> = new Map();
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
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

    // Map file patterns to schemas
    if (basename.includes("caddy-security") || basename.includes("security-config")) {
      return this.schemas.get("caddy-security-config.json");
    }

    if (basename.includes("portal")) {
      return this.schemas.get("caddy-security-portal.json");
    }

    if (basename.includes("policy")) {
      return this.schemas.get("caddy-security-policy.json");
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
    this.validateObject(data, schema, "", errors);
    return errors;
  }

  private validateObject(
    data: unknown,
    schema: Record<string, unknown>,
    currentPath: string,
    errors: ValidationError[]
  ): void {
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
          this.validateObject(value, propSchema, propPath, errors);
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
        this.validateObject(data[i], items, itemPath, errors);
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
      this.validateOneOf(data, oneOf, currentPath, errors);
    }

    // Check anyOf
    const anyOf = schema.anyOf as Record<string, unknown>[] | undefined;
    if (anyOf) {
      const anyValid = anyOf.some((subSchema) => {
        const subErrors: ValidationError[] = [];
        this.validateObject(data, subSchema, currentPath, subErrors);
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
    errors: ValidationError[]
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
        this.validateObject(data, matchingSchema, currentPath, errors);
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
      this.validateObject(data, schema, currentPath, subErrors);
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

export class CaddyDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private validator: SimpleSchemaValidator;

  constructor(context: vscode.ExtensionContext) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("caddy");
    this.validator = new SimpleSchemaValidator(context.extensionPath);

    // Register for document events
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.validateDocument(e.document)),
      vscode.workspace.onDidOpenTextDocument((doc) => this.validateDocument(doc)),
      vscode.workspace.onDidCloseTextDocument((doc) => this.diagnosticCollection.delete(doc.uri)),
      this.diagnosticCollection
    );

    // Validate all open documents on activation
    vscode.workspace.textDocuments.forEach((doc) => this.validateDocument(doc));
  }

  private validateDocument(document: vscode.TextDocument): void {
    // Check if diagnostics are enabled
    const config = vscode.workspace.getConfiguration("caddy");
    if (!config.get("enableDiagnostics", true)) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    // Only validate JSON files
    if (document.languageId !== "json" && document.languageId !== "jsonc") {
      return;
    }

    // Check if this file matches our patterns
    const schema = this.validator.getSchemaForFile(document.fileName);
    if (!schema) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    // Try to parse JSON
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // JSON parse error - let VSCode's built-in JSON handle this
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    // Validate against schema
    const errors = this.validator.validate(data, schema);

    for (const error of errors) {
      const range = this.findPathRange(document, error.path);
      const diagnostic = new vscode.Diagnostic(
        range,
        error.message,
        error.keyword === "required"
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning
      );

      diagnostic.source = "caddy";
      diagnostic.code = error.keyword;
      diagnostics.push(diagnostic);
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Find the range in the document for a JSON path
   */
  private findPathRange(document: vscode.TextDocument, jsonPath: string): vscode.Range {
    const text = document.getText();

    // Parse path segments
    const segments = this.parseJsonPath(jsonPath);

    if (segments.length === 0) {
      return new vscode.Range(0, 0, 0, 1);
    }

    // Try to find the property in the document
    let searchText = text;
    let currentOffset = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      if (typeof segment === "string") {
        // Property name - find "propertyName":
        const pattern = new RegExp(`"${this.escapeRegex(segment)}"\\s*:`);
        const match = pattern.exec(searchText);

        if (match) {
          currentOffset += match.index;

          if (i === segments.length - 1) {
            // This is the target property
            const startPos = document.positionAt(currentOffset);
            const endPos = document.positionAt(currentOffset + match[0].length);
            return new vscode.Range(startPos, endPos);
          }

          // Move past this property
          searchText = searchText.slice(match.index + match[0].length);
          currentOffset += match[0].length;
        }
      } else if (typeof segment === "number") {
        // Array index - try to find the Nth item
        let bracketDepth = 0;
        let itemIndex = -1;
        let itemStart = 0;

        for (let j = 0; j < searchText.length; j++) {
          const char = searchText[j];

          if (char === "[" || char === "{") {
            if (bracketDepth === 0 && char === "[") {
              itemIndex = 0;
              itemStart = j + 1;
            }
            bracketDepth++;
          } else if (char === "]" || char === "}") {
            bracketDepth--;
          } else if (char === "," && bracketDepth === 1) {
            itemIndex++;
            itemStart = j + 1;
          }

          if (itemIndex === segment && bracketDepth === 1) {
            currentOffset += itemStart;
            searchText = searchText.slice(itemStart);
            break;
          }
        }
      }
    }

    // Default to first line if not found
    return new vscode.Range(0, 0, 0, Math.min(text.indexOf("\n"), 80));
  }

  private parseJsonPath(path: string): Array<string | number> {
    const segments: Array<string | number> = [];
    const parts = path.split(/\.|\[|\]/);

    for (const part of parts) {
      if (part === "" || part === "$") continue;

      const num = parseInt(part, 10);
      if (!isNaN(num)) {
        segments.push(num);
      } else {
        segments.push(part);
      }
    }

    return segments;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
