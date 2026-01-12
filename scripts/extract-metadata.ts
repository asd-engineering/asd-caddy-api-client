/**
 * Extract metadata from builder functions, handler types, and schemas
 * for use in VSCode extension and other tooling.
 *
 * This script parses TypeScript source files using the TypeScript compiler API
 * to extract JSDoc comments, default values, and type information.
 *
 * Generated output: src/generated/extension-assets.ts
 */

import * as ts from "typescript";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const OUTPUT_FILE = join(ROOT_DIR, "src/generated/extension-assets.ts");

// ============================================================================
// Types for extracted metadata
// ============================================================================

interface ParamMetadata {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
  example?: string;
}

interface BuilderMetadata {
  name: string;
  description: string;
  params: ParamMetadata[];
  returnType: string;
  example?: string;
  snippet: {
    prefix: string;
    body: string[];
    description: string;
  };
}

interface HandlerMetadata {
  name: string;
  displayName: string;
  description: string;
  discriminator: string;
  commonFields: string[];
  caddyDocsPath: string;
}

interface ExtensionAssets {
  version: string;
  generatedAt: string;
  builders: Record<string, BuilderMetadata>;
  handlers: Record<string, HandlerMetadata>;
}

// ============================================================================
// TypeScript AST Utilities
// ============================================================================

function createProgram(filePaths: string[]): ts.Program {
  const configPath = join(ROOT_DIR, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT_DIR);

  return ts.createProgram(filePaths, parsedConfig.options);
}

function getJSDocComment(node: ts.Node): string {
  const jsDocTags = ts.getJSDocCommentsAndTags(node);
  for (const tag of jsDocTags) {
    if (ts.isJSDoc(tag) && tag.comment) {
      if (typeof tag.comment === "string") {
        return tag.comment;
      }
      // Handle JSDocComment[] case
      return tag.comment.map((c) => (ts.isJSDocText(c) ? c.text : "")).join("");
    }
  }
  return "";
}

function getJSDocTag(node: ts.Node, tagName: string): string | undefined {
  const jsDocTags = ts.getJSDocCommentsAndTags(node);
  for (const tag of jsDocTags) {
    if (ts.isJSDoc(tag) && tag.tags) {
      for (const t of tag.tags) {
        if (t.tagName.text === tagName && t.comment) {
          if (typeof t.comment === "string") {
            return t.comment;
          }
          return t.comment.map((c) => (ts.isJSDocText(c) ? c.text : "")).join("");
        }
      }
    }
  }
  return undefined;
}

function getJSDocExample(node: ts.Node): string | undefined {
  const example = getJSDocTag(node, "example");
  if (example) {
    // Extract code from markdown code block
    const match = example.match(/```(?:typescript|ts)?\s*([\s\S]*?)```/);
    return match ? match[1].trim() : example.trim();
  }
  return undefined;
}

function typeToString(type: ts.TypeNode | undefined, checker: ts.TypeChecker): string {
  if (!type) return "unknown";
  return type.getText();
}

// ============================================================================
// Interface Extraction
// ============================================================================

function extractInterfaceParams(
  sourceFile: ts.SourceFile,
  interfaceName: string,
  checker: ts.TypeChecker
): ParamMetadata[] {
  const params: ParamMetadata[] = [];

  function visit(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const name = member.name.getText();
          const type = typeToString(member.type, checker);
          const required = !member.questionToken;
          const description = getJSDocComment(member);
          const defaultValue = getJSDocTag(member, "default");
          const example = getJSDocTag(member, "example");

          params.push({
            name,
            type,
            required,
            description,
            ...(defaultValue && { default: defaultValue.replace(/^"(.*)"$/, "$1") }),
            ...(example && { example: example.replace(/^"(.*)"$/, "$1") }),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return params;
}

// ============================================================================
// Builder Function Extraction
// ============================================================================

function extractBuilderFunctions(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker
): BuilderMetadata[] {
  const builders: BuilderMetadata[] = [];

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const funcName = node.name.text;

      // Only process build* functions
      if (!funcName.startsWith("build")) {
        ts.forEachChild(node, visit);
        return;
      }

      const description = getJSDocComment(node);
      const example = getJSDocExample(node);

      // Get options interface name from first parameter
      let optionsInterfaceName = "";
      let params: ParamMetadata[] = [];

      if (node.parameters.length > 0) {
        const firstParam = node.parameters[0];
        if (firstParam.type && ts.isTypeReferenceNode(firstParam.type)) {
          optionsInterfaceName = firstParam.type.typeName.getText();
          params = extractInterfaceParams(sourceFile, optionsInterfaceName, checker);
        }
      }

      // Get return type
      let returnType = "unknown";
      if (node.type) {
        returnType = node.type.getText();
      }

      // Generate snippet
      const snippet = generateSnippet(funcName, params);

      builders.push({
        name: funcName,
        description,
        params,
        returnType,
        ...(example && { example }),
        snippet,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return builders;
}

function generateSnippet(
  funcName: string,
  params: ParamMetadata[]
): { prefix: string; body: string[]; description: string } {
  // Convert camelCase to kebab-case for prefix
  const prefix = funcName
    .replace(/^build/, "caddy-")
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/--/g, "-");

  // Generate body with tabstops
  const body: string[] = [];
  body.push(`${funcName}({`);

  let tabstop = 1;
  for (const param of params) {
    const defaultVal = param.default || getPlaceholder(param.name, param.type);
    const comma = tabstop < params.length ? "," : "";

    if (param.required) {
      body.push(`  ${param.name}: \${${tabstop}:${defaultVal}}${comma}`);
      tabstop++;
    } else if (param.default) {
      // Include optional params with defaults as commented suggestions
      body.push(`  // ${param.name}: \${${tabstop}:${defaultVal}}${comma}`);
      tabstop++;
    }
  }

  body.push("})");

  // Get description from function name
  const description = funcName
    .replace(/^build/, "Build ")
    .replace(/([A-Z])/g, " $1")
    .trim();

  return { prefix, body, description };
}

function getPlaceholder(name: string, type: string): string {
  // Smart placeholders based on field name and type
  if (name === "path") return "/etc/caddy/config.json";
  if (name === "realm") return "local";
  if (name === "dial") return "localhost:3000";
  if (name === "address") return "ldap.example.com";
  if (name === "port") return "389";
  if (name === "clientId") return "your-client-id";
  if (name === "clientSecret") return "your-client-secret";
  if (name === "discoveryUrl") return "https://idp.example.com/.well-known/openid-configuration";
  if (name.includes("host")) return "example.com";
  if (name.includes("name")) return "my-name";
  if (type.includes("string[]")) return '["value"]';
  if (type.includes("string")) return '""';
  if (type.includes("number")) return "0";
  if (type.includes("boolean")) return "true";
  return '""';
}

// ============================================================================
// Handler Type Extraction
// ============================================================================

function extractHandlerTypes(sourceFile: ts.SourceFile): HandlerMetadata[] {
  const handlers: HandlerMetadata[] = [];

  // Known handler mappings for better metadata
  const handlerInfo: Record<
    string,
    { displayName: string; description: string; caddyDocsPath: string }
  > = {
    reverse_proxy: {
      displayName: "Reverse Proxy",
      description: "Proxy requests to upstream backend servers with load balancing",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/reverse_proxy/",
    },
    headers: {
      displayName: "Headers",
      description: "Modify request and response headers",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/headers/",
    },
    static_response: {
      displayName: "Static Response",
      description: "Return a static response without proxying",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/static_response/",
    },
    authentication: {
      displayName: "Authentication",
      description: "HTTP Basic authentication or custom auth providers",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/authentication/",
    },
    rewrite: {
      displayName: "Rewrite",
      description: "Rewrite the request URI before processing",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/rewrite/",
    },
    encode: {
      displayName: "Encode",
      description: "Compress responses with gzip, zstd, or brotli",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/encode/",
    },
    subroute: {
      displayName: "Subroute",
      description: "Process requests through nested routes",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/subroute/",
    },
    file_server: {
      displayName: "File Server",
      description: "Serve static files from disk",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/file_server/",
    },
    templates: {
      displayName: "Templates",
      description: "Render Go templates in responses",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/templates/",
    },
    map: {
      displayName: "Map",
      description: "Map input to output values for use in other handlers",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/map/",
    },
    push: {
      displayName: "HTTP/2 Push",
      description: "Push resources to clients over HTTP/2",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/push/",
    },
    request_body: {
      displayName: "Request Body",
      description: "Configure request body size limits",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/request_body/",
    },
    vars: {
      displayName: "Variables",
      description: "Set variables for use in other handlers",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/vars/",
    },
    intercept: {
      displayName: "Intercept",
      description: "Intercept and modify responses from upstreams",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/intercept/",
    },
    invoke: {
      displayName: "Invoke",
      description: "Invoke a named route by reference",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/invoke/",
    },
    tracing: {
      displayName: "Tracing",
      description: "Add distributed tracing spans",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/tracing/",
    },
    log_append: {
      displayName: "Log Append",
      description: "Append custom fields to access logs",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/log_append/",
    },
    error: {
      displayName: "Error",
      description: "Trigger an error response",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/error/",
    },
    copy_response: {
      displayName: "Copy Response",
      description: "Copy response from another handler",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/copy_response/",
    },
    copy_response_headers: {
      displayName: "Copy Response Headers",
      description: "Copy specific headers from another response",
      caddyDocsPath: "/docs/json/apps/http/servers/routes/handle/copy_response_headers/",
    },
    authenticator: {
      displayName: "Authenticator (caddy-security)",
      description: "Serve authentication portal for caddy-security plugin",
      caddyDocsPath: "https://github.com/greenpau/caddy-security",
    },
  };

  // Extract handler interface definitions
  function visit(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;

      // Look for handler interfaces
      if (name.endsWith("Handler")) {
        // Find the handler discriminator
        for (const member of node.members) {
          if (
            ts.isPropertySignature(member) &&
            member.name &&
            member.name.getText() === "handler"
          ) {
            if (member.type && ts.isLiteralTypeNode(member.type)) {
              const literal = member.type.literal;
              if (ts.isStringLiteral(literal)) {
                const discriminator = literal.text;
                const info = handlerInfo[discriminator] || {
                  displayName: name.replace("Handler", ""),
                  description: getJSDocComment(node) || `${name} handler`,
                  caddyDocsPath: `/docs/json/apps/http/servers/routes/handle/${discriminator}/`,
                };

                // Extract common fields (non-handler properties)
                const commonFields: string[] = [];
                for (const m of node.members) {
                  if (ts.isPropertySignature(m) && m.name) {
                    const fieldName = m.name.getText();
                    if (fieldName !== "handler") {
                      commonFields.push(fieldName);
                    }
                  }
                }

                handlers.push({
                  name: discriminator,
                  displayName: info.displayName,
                  description: info.description,
                  discriminator,
                  commonFields: commonFields.slice(0, 5), // Top 5 fields
                  caddyDocsPath: info.caddyDocsPath,
                });
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return handlers;
}

// ============================================================================
// Main Generation Logic
// ============================================================================

function generateExtensionAssets(): ExtensionAssets {
  const filesToParse = [
    join(ROOT_DIR, "src/plugins/caddy-security/builders.ts"),
    join(ROOT_DIR, "src/plugins/caddy-security/types.ts"),
    join(ROOT_DIR, "src/caddy/routes.ts"),
    join(ROOT_DIR, "src/caddy/helpers.ts"),
    join(ROOT_DIR, "src/types.ts"),
  ];

  // Filter to existing files
  const existingFiles = filesToParse.filter((f) => existsSync(f));
  const program = createProgram(existingFiles);
  const checker = program.getTypeChecker();

  const allBuilders: Record<string, BuilderMetadata> = {};
  const allHandlers: Record<string, HandlerMetadata> = {};

  for (const filePath of existingFiles) {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) continue;

    // Extract builders from builder files
    if (
      filePath.includes("builders.ts") ||
      filePath.includes("routes.ts") ||
      filePath.includes("helpers.ts")
    ) {
      const builders = extractBuilderFunctions(sourceFile, checker);
      for (const builder of builders) {
        allBuilders[builder.name] = builder;
      }
    }

    // Extract handlers from types files
    if (filePath.includes("types.ts")) {
      const handlers = extractHandlerTypes(sourceFile);
      for (const handler of handlers) {
        allHandlers[handler.name] = handler;
      }
    }
  }

  // Read package.json for version
  const pkgJson = JSON.parse(readFileSync(join(ROOT_DIR, "package.json"), "utf-8"));

  return {
    version: pkgJson.version,
    generatedAt: new Date().toISOString(),
    builders: allBuilders,
    handlers: allHandlers,
  };
}

function generateOutputFile(assets: ExtensionAssets): string {
  return `/**
 * Extension assets for VSCode extension and tooling
 *
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Generated from source files by scripts/extract-metadata.ts
 * Run: npm run generate:extension
 *
 * @generated
 * @version ${assets.version}
 * @generatedAt ${assets.generatedAt}
 */

// ============================================================================
// Metadata Types
// ============================================================================

export interface ParamMetadata {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
  example?: string;
}

export interface SnippetDefinition {
  prefix: string;
  body: string[];
  description: string;
}

export interface BuilderMetadata {
  name: string;
  description: string;
  params: ParamMetadata[];
  returnType: string;
  example?: string;
  snippet: SnippetDefinition;
}

export interface HandlerMetadata {
  name: string;
  displayName: string;
  description: string;
  discriminator: string;
  commonFields: string[];
  caddyDocsPath: string;
}

// ============================================================================
// Generated Metadata
// ============================================================================

/**
 * Library version this metadata was generated from
 */
export const METADATA_VERSION = "${assets.version}";

/**
 * Timestamp when this metadata was generated
 */
export const GENERATED_AT = "${assets.generatedAt}";

/**
 * Builder function metadata extracted from JSDoc and type definitions
 *
 * Use this for:
 * - Generating VSCode snippets
 * - Powering wizard step generation
 * - Providing hover documentation
 */
export const BUILDER_METADATA: Record<string, BuilderMetadata> = ${JSON.stringify(assets.builders, null, 2)};

/**
 * Handler type metadata for Caddy route handlers
 *
 * Use this for:
 * - Autocomplete for handler discriminator
 * - Hover documentation with Caddy docs links
 * - Handler-specific field suggestions
 */
export const HANDLER_METADATA: Record<string, HandlerMetadata> = ${JSON.stringify(assets.handlers, null, 2)};

/**
 * All handler discriminator values for autocomplete
 */
export const HANDLER_NAMES = Object.keys(HANDLER_METADATA) as readonly string[];

/**
 * All builder function names for autocomplete
 */
export const BUILDER_NAMES = Object.keys(BUILDER_METADATA) as readonly string[];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get snippets in VSCode snippet format
 */
export function getVSCodeSnippets(): Record<string, { prefix: string; body: string[]; description: string }> {
  const snippets: Record<string, { prefix: string; body: string[]; description: string }> = {};

  for (const [name, builder] of Object.entries(BUILDER_METADATA)) {
    snippets[name] = {
      prefix: builder.snippet.prefix,
      body: builder.snippet.body,
      description: builder.snippet.description,
    };
  }

  return snippets;
}

/**
 * Get handler completion items for VSCode
 */
export function getHandlerCompletions(): Array<{ label: string; detail: string; documentation: string }> {
  return Object.values(HANDLER_METADATA).map((handler) => ({
    label: handler.name,
    detail: handler.displayName,
    documentation: handler.description,
  }));
}
`;
}

// ============================================================================
// Entry Point
// ============================================================================

console.log("Extracting metadata for extension assets...\n");

try {
  const assets = generateExtensionAssets();

  console.log(`Found ${Object.keys(assets.builders).length} builder functions:`);
  for (const name of Object.keys(assets.builders)) {
    console.log(`  - ${name}`);
  }

  console.log(`\nFound ${Object.keys(assets.handlers).length} handler types:`);
  for (const name of Object.keys(assets.handlers)) {
    console.log(`  - ${name}`);
  }

  const output = generateOutputFile(assets);
  writeFileSync(OUTPUT_FILE, output);

  console.log(`\n✓ Generated ${OUTPUT_FILE}`);
} catch (error) {
  console.error("Failed to generate extension assets:", error);
  process.exit(1);
}
