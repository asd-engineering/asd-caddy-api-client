/**
 * Completion Provider for Caddy handlers and configurations
 *
 * Uses HANDLER_METADATA from the library to provide intelligent completions.
 * Provides context-aware completions for:
 * - Route properties (@id, match, handle, terminal, priority)
 * - Match field properties (host, path, method, header, query)
 * - HTTP methods (GET, POST, PUT, etc.)
 * - Handler type values (reverse_proxy, file_server, etc.)
 * - Handler-specific fields based on handler type
 * - Enum values for known fields (selection_policy, encodings)
 */

import * as vscode from "vscode";
import { getLocation, parseTree, findNodeAtLocation, type Segment } from "jsonc-parser";
import {
  HANDLER_METADATA,
  BUILDER_METADATA,
  type HandlerMetadata,
} from "@accelerated-software-development/caddy-api-client/extension-assets";
import {
  ROUTE_PROPERTIES,
  MATCH_PROPERTIES,
  HANDLE_OBJECT_PROPERTIES,
  HTTP_METHODS,
  ENUM_VALUES,
} from "./completion-data";

const CADDY_DOCS_BASE = "https://caddyserver.com";

/**
 * Filename patterns this extension associates with a Caddy config schema,
 * mirrored from package.json's `jsonValidation` contribution. Caddy-specific
 * completions (route/match/handle properties) only make sense on files
 * where the corresponding schema is actually active -- without this gate,
 * e.g. the root-level route-property completion fires on the first
 * keystroke of ANY json/jsonc file's root object (package.json,
 * tsconfig.json, ...), since that position has no Caddy-specific content
 * to distinguish it by.
 */
const CADDY_FILENAME_PATTERNS = [
  /caddy-server\.json$/i,
  /caddy-full\.json$/i,
  /\.caddy-server\.json$/i,
  /caddy\.json$/i,
  /caddy-config\.json$/i,
  /\.caddy\.json$/i,
  /caddy-security\.json$/i,
  /security-config\.json$/i,
  /\.caddy-security\.json$/i,
  /caddy-security-portal\.json$/i,
  /\.caddy-security-portal\.json$/i,
  /caddy-security-policy\.json$/i,
  /\.caddy-security-policy\.json$/i,
];

function isCaddyConfigFile(fileName: string): boolean {
  return CADDY_FILENAME_PATTERNS.some((pattern) => pattern.test(fileName));
}

// ============================================================================
// Completion Context Types
// ============================================================================

type CompletionContext =
  | { type: "route-property" }
  | { type: "match-property" }
  | { type: "method-value" }
  | { type: "handler-value" }
  | { type: "handle-property" }
  | { type: "handler-property"; handler: string }
  | { type: "enum-value"; field: string }
  | { type: "builder" }
  | { type: "unknown" };

/** Sentinel matching any single path segment (an array index or an in-progress property key). */
const ANY = Symbol("any-segment");
type PathPattern = (Segment | typeof ANY)[];

/** True if `path`'s trailing segments equal `pattern` (ANY matches any single segment). */
function pathEndsWith(path: Segment[], pattern: PathPattern): boolean {
  if (path.length < pattern.length) {
    return false;
  }
  const start = path.length - pattern.length;
  return pattern.every((seg, i) => seg === ANY || seg === path[start + i]);
}

/**
 * True if `path`, once its trailing `suffix` is stripped, points inside a
 * match object -- i.e. `["match", i]` optionally followed by any number of
 * `["not", j]` hops (Caddy's `not` matcher wraps a nested matcher set, and
 * that set can itself contain another `not`). Covers `["match", 0]`,
 * `["match", 0, "not", 1]`, `["match", 0, "not", 1, "not", 0]`, etc.
 */
function isMatchObjectPath(path: Segment[], suffix: PathPattern): boolean {
  if (!pathEndsWith(path, suffix)) {
    return false;
  }
  const prefix = path.slice(0, path.length - suffix.length);
  if (prefix.length < 2 || prefix[0] !== "match" || typeof prefix[1] !== "number") {
    return false;
  }
  for (let i = 2; i < prefix.length; i += 2) {
    if (prefix[i] !== "not" || typeof prefix[i + 1] !== "number") {
      return false;
    }
  }
  return true;
}

/**
 * The property name a value-position cursor is filling in. For a scalar
 * property (`"handler": "|`) the path ends with the property name itself.
 * For an array element (`"method": ["GET", "|`) the path ends with the
 * array index, so the field name is the segment before it.
 */
function fieldNameAtValuePosition(path: Segment[]): string | undefined {
  const last = path[path.length - 1];
  if (typeof last === "string") {
    return last;
  }
  if (typeof last === "number") {
    const prev = path[path.length - 2];
    if (typeof prev === "string") {
      return prev;
    }
  }
  return undefined;
}

export class CaddyCompletionProvider implements vscode.CompletionItemProvider {
  private outputChannel: vscode.OutputChannel | undefined;

  constructor(outputChannel?: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  private log(message: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[Completion] ${message}`);
    }
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] | undefined {
    // Detect the completion context
    const context = this.detectContext(document, position);
    this.log(`Detected context: ${context.type}`);

    switch (context.type) {
      case "handler-value":
        return this.getHandlerCompletions();
      case "route-property":
        return this.getRoutePropertyCompletions();
      case "match-property":
        return this.getMatchPropertyCompletions();
      case "method-value":
        return this.getMethodCompletions();
      case "handle-property":
        return this.getHandleObjectCompletions();
      case "handler-property":
        return this.getHandlerPropertyCompletions(context.handler);
      case "enum-value":
        return this.getEnumCompletions(context.field);
      case "builder":
        return this.getBuilderCompletions();
      default:
        return undefined;
    }
  }

  // ============================================================================
  // Context Detection
  // ============================================================================

  private detectContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): CompletionContext {
    // Check for builder context first (TypeScript/JavaScript files)
    if (this.isBuilderContext(document, position)) {
      return { type: "builder" };
    }

    // Only process JSON-like files for Caddy config completions, and only
    // ones this extension actually recognizes as Caddy config (see
    // CADDY_FILENAME_PATTERNS) -- otherwise every JSON/JSONC file in the
    // workspace gets Caddy-specific noise in its autocomplete. Unsaved
    // ("Untitled") buffers are exempted -- they have no filename to match
    // against and, unlike a real project file, can't collide with another
    // tool's schema, so it's safe (and expected) to offer Caddy completions
    // while someone is prototyping a config before saving it.
    const languageId = document.languageId;
    if (languageId !== "json" && languageId !== "jsonc") {
      return { type: "unknown" };
    }
    if (!document.isUntitled && !isCaddyConfigFile(document.fileName)) {
      return { type: "unknown" };
    }

    const text = document.getText();
    const offset = document.offsetAt(position);
    const location = getLocation(text, offset);
    const { path, isAtPropertyKey } = location;

    if (!isAtPropertyKey) {
      const fieldName = fieldNameAtValuePosition(path);

      // "handler": "|  -- only inside an element of the handle array
      if (fieldName === "handler" && pathEndsWith(path, ["handle", ANY, "handler"])) {
        return { type: "handler-value" };
      }

      // "method": ["|  or  "method": ["GET", "| -- only inside a match object
      // (including one nested inside a "not" matcher, however deep)
      if (fieldName === "method" && isMatchObjectPath(path, ["method", ANY])) {
        return { type: "method-value" };
      }

      // "protocol": "|" -- only inside a match object's own protocol field
      // (not e.g. reverse_proxy's unrelated transport.protocol)
      if (fieldName === "protocol" && isMatchObjectPath(path, ["protocol"])) {
        return { type: "enum-value", field: "protocol" };
      }

      // "policy": "|" -- only inside a reverse_proxy handler's
      // load_balancing.selection_policy.policy
      if (
        fieldName === "policy" &&
        pathEndsWith(path, ["handle", ANY, "load_balancing", "selection_policy", "policy"])
      ) {
        return { type: "enum-value", field: "selection_policy" };
      }

      // "prefer": ["|" -- only inside an encode handler's prefer array
      if (fieldName === "prefer" && pathEndsWith(path, ["handle", ANY, "prefer", ANY])) {
        return { type: "enum-value", field: "encodings" };
      }

      return { type: "unknown" };
    }

    // isAtPropertyKey: path's last segment is the '' placeholder for the
    // key being typed. Its parent object's location is path.slice(0, -1).

    // Inside one element of the "match" array (including nested inside a
    // "not" matcher, however deep)
    if (isMatchObjectPath(path, [""])) {
      return { type: "match-property" };
    }

    // Inside one element of the "handle" array
    if (pathEndsWith(path, ["handle", ANY, ""])) {
      const tree = parseTree(text);
      const handlerObjectPath = path.slice(0, -1);
      const objectNode = tree && findNodeAtLocation(tree, handlerObjectPath);
      const handlerName = objectNode
        ? this.getStringPropertyValue(objectNode, "handler")
        : undefined;

      if (handlerName && HANDLER_METADATA[handlerName]) {
        return { type: "handler-property", handler: handlerName };
      }
      return { type: "handle-property" };
    }

    // Document root, or an element of a "routes" array (e.g. inside a
    // server config or a subroute handler's own "routes" list)
    if (path.length === 1 || pathEndsWith(path, ["routes", ANY, ""])) {
      return { type: "route-property" };
    }

    return { type: "unknown" };
  }

  /** Reads a string-valued sibling property (e.g. `handler`) off an object node, if present. */
  private getStringPropertyValue(
    objectNode: import("jsonc-parser").Node,
    key: string
  ): string | undefined {
    if (objectNode.type !== "object" || !objectNode.children) {
      return undefined;
    }
    for (const propNode of objectNode.children) {
      const [keyNode, valueNode] = propNode.children ?? [];
      if (keyNode?.value === key && valueNode?.type === "string") {
        return valueNode.value as string;
      }
    }
    return undefined;
  }

  private isBuilderContext(document: vscode.TextDocument, position: vscode.Position): boolean {
    const languageId = document.languageId;
    if (languageId !== "typescript" && languageId !== "javascript") {
      return false;
    }

    // Check if user is typing "build" to suggest builder functions
    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange) {
      const word = document.getText(wordRange);
      return word.startsWith("build");
    }

    return false;
  }

  // ============================================================================
  // Completion Generators
  // ============================================================================

  private getHandlerCompletions(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // Sort handlers by common usage (reverse_proxy first, then alphabetically)
    const sortedHandlers = Object.values(HANDLER_METADATA).sort((a, b) => {
      const priority: Record<string, number> = {
        reverse_proxy: 0,
        headers: 1,
        static_response: 2,
        file_server: 3,
        authentication: 4,
        rewrite: 5,
        encode: 6,
      };
      const pa = priority[a.name] ?? 100;
      const pb = priority[b.name] ?? 100;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });

    for (const handler of sortedHandlers) {
      const item = this.createHandlerCompletionItem(handler);
      items.push(item);
    }

    return items;
  }

  private getRoutePropertyCompletions(): vscode.CompletionItem[] {
    return ROUTE_PROPERTIES.map((prop, index) => {
      const item = new vscode.CompletionItem(prop.name, vscode.CompletionItemKind.Property);
      item.detail = "Route property";
      item.documentation = new vscode.MarkdownString(prop.description);
      item.sortText = String(index).padStart(2, "0");

      // Create appropriate snippet based on property type
      if (prop.name === "@id") {
        item.insertText = new vscode.SnippetString('"@id": "${1:route-id}"');
      } else if (prop.name === "match") {
        item.insertText = new vscode.SnippetString('"match": [{\n  $0\n}]');
      } else if (prop.name === "handle") {
        item.insertText = new vscode.SnippetString('"handle": [{\n  "handler": "$0"\n}]');
      } else if (prop.name === "terminal") {
        item.insertText = new vscode.SnippetString('"terminal": ${1|true,false|}');
      } else if (prop.name === "priority") {
        item.insertText = new vscode.SnippetString('"priority": ${1:0}');
      } else {
        item.insertText = new vscode.SnippetString(`"${prop.name}": $0`);
      }

      return item;
    });
  }

  private getMatchPropertyCompletions(): vscode.CompletionItem[] {
    return MATCH_PROPERTIES.map((prop, index) => {
      const item = new vscode.CompletionItem(prop.name, vscode.CompletionItemKind.Property);
      item.detail = "Matcher property";
      item.documentation = new vscode.MarkdownString(prop.description);
      item.sortText = String(index).padStart(2, "0");

      // Create appropriate snippet based on property type
      if (prop.name === "host" || prop.name === "path") {
        item.insertText = new vscode.SnippetString(`"${prop.name}": ["$1"]`);
      } else if (prop.name === "path_regexp") {
        item.insertText = new vscode.SnippetString('"path_regexp": {\n  "pattern": "$1"\n}');
      } else if (prop.name === "method") {
        item.insertText = new vscode.SnippetString(
          '"method": ["${1|GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS|}"]'
        );
      } else if (prop.name === "header" || prop.name === "query") {
        item.insertText = new vscode.SnippetString(`"${prop.name}": {\n  "$1": ["$2"]\n}`);
      } else if (prop.name === "header_regexp") {
        item.insertText = new vscode.SnippetString(
          '"header_regexp": {\n  "$1": { "pattern": "$2" }\n}'
        );
      } else if (prop.name === "client_ip" || prop.name === "remote_ip") {
        item.insertText = new vscode.SnippetString(`"${prop.name}": {\n  "ranges": ["$1"]\n}`);
      } else if (prop.name === "tls") {
        item.insertText = new vscode.SnippetString(
          '"tls": {\n  "handshake_complete": ${1|true,false|}\n}'
        );
      } else if (prop.name === "file") {
        item.insertText = new vscode.SnippetString('"file": {\n  "try_files": ["$1"]\n}');
      } else if (prop.name === "not") {
        item.insertText = new vscode.SnippetString('"not": [{\n  $0\n}]');
      } else {
        item.insertText = new vscode.SnippetString(`"${prop.name}": $0`);
      }

      return item;
    });
  }

  private getMethodCompletions(): vscode.CompletionItem[] {
    return HTTP_METHODS.map((method, index) => {
      const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.EnumMember);
      item.detail = "HTTP Method";
      item.documentation = new vscode.MarkdownString(`HTTP ${method} request method`);
      item.sortText = String(index).padStart(2, "0");
      item.insertText = method;
      return item;
    });
  }

  private getHandleObjectCompletions(): vscode.CompletionItem[] {
    return HANDLE_OBJECT_PROPERTIES.map((prop, index) => {
      const item = new vscode.CompletionItem(prop.name, vscode.CompletionItemKind.Property);
      item.detail = "Handle object property";
      item.documentation = new vscode.MarkdownString(prop.description);
      item.sortText = String(index).padStart(2, "0");
      item.insertText = new vscode.SnippetString(`"${prop.name}": "$0"`);
      return item;
    });
  }

  private getHandlerPropertyCompletions(handlerName: string): vscode.CompletionItem[] {
    const handler = HANDLER_METADATA[handlerName];
    if (!handler || handler.commonFields.length === 0) {
      return [];
    }

    const items: vscode.CompletionItem[] = [];

    for (let i = 0; i < handler.commonFields.length; i++) {
      const field = handler.commonFields[i];
      const item = new vscode.CompletionItem(field, vscode.CompletionItemKind.Property);
      item.detail = `${handler.displayName} field`;
      item.documentation = new vscode.MarkdownString(
        `Field for the ${handler.displayName} handler`
      );
      item.sortText = String(i).padStart(2, "0");

      // Create appropriate snippets for common field patterns
      item.insertText = this.createFieldSnippet(handlerName, field);

      items.push(item);
    }

    return items;
  }

  private createFieldSnippet(handlerName: string, field: string): vscode.SnippetString {
    // Handler-specific field snippets
    const snippets: Record<string, Record<string, string>> = {
      reverse_proxy: {
        upstreams: '"upstreams": [{\n  "dial": "${1:localhost:8080}"\n}]',
        transport: '"transport": {\n  "protocol": "${1|http,fastcgi|}"\n}',
        load_balancing:
          '"load_balancing": {\n  "selection_policy": {\n    "policy": "${1|random,first,round_robin,least_conn,ip_hash|}"\n  }\n}',
        health_checks:
          '"health_checks": {\n  "active": {\n    "path": "${1:/health}",\n    "interval": "${2:10s}"\n  }\n}',
        headers:
          '"headers": {\n  "request": {\n    "set": {\n      "${1:X-Custom-Header}": ["${2:value}"]\n    }\n  }\n}',
      },
      headers: {
        request: '"request": {\n  "set": {\n    "${1:Header-Name}": ["${2:value}"]\n  }\n}',
        response: '"response": {\n  "set": {\n    "${1:Header-Name}": ["${2:value}"]\n  }\n}',
      },
      static_response: {
        status_code: '"status_code": ${1:200}',
        body: '"body": "${1:Response body}"',
        headers: '"headers": {\n  "${1:Content-Type}": ["${2:text/plain}"]\n}',
        close: '"close": ${1|true,false|}',
        abort: '"abort": ${1|true,false|}',
      },
      file_server: {
        root: '"root": "${1:/var/www}"',
        index_names: '"index_names": ["${1:index.html}"]',
        browse: '"browse": {}',
        hide: '"hide": ["${1:.git}", "${2:.env}"]',
      },
      encode: {
        encodings: '"encodings": {\n  "${1|gzip,zstd,br|}": {}\n}',
        prefer: '"prefer": ["${1|zstd,br,gzip|}"]',
        minimum_length: '"minimum_length": ${1:256}',
      },
      rewrite: {
        uri: '"uri": "${1:/new/path}"',
        strip_path_prefix: '"strip_path_prefix": "${1:/api}"',
        strip_path_suffix: '"strip_path_suffix": "${1:.html}"',
        uri_substring: '"uri_substring": [{\n  "find": "${1:old}",\n  "replace": "${2:new}"\n}]',
      },
      authentication: {
        providers:
          '"providers": {\n  "http_basic": {\n    "accounts": [{\n      "username": "${1:user}",\n      "password": "${2:hashed_password}"\n    }]\n  }\n}',
      },
      subroute: {
        routes: '"routes": [{\n  $0\n}]',
      },
      templates: {
        file_root: '"file_root": "${1:/var/www/templates}"',
        mime_types: '"mime_types": ["${1:text/html}"]',
        delimiters: '"delimiters": ["{{", "}}"]',
      },
      map: {
        source: '"source": "${1:{http.request.uri.path}}"',
        destinations: '"destinations": ["{${1:my_var}}"]',
        mappings: '"mappings": [{\n  "input": "${1:pattern}",\n  "outputs": ["${2:value}"]\n}]',
        defaults: '"defaults": ["${1:default_value}"]',
      },
    };

    const handlerSnippets = snippets[handlerName];
    if (handlerSnippets && handlerSnippets[field]) {
      return new vscode.SnippetString(handlerSnippets[field]);
    }

    // Default: simple property
    return new vscode.SnippetString(`"${field}": $0`);
  }

  private getEnumCompletions(field: string): vscode.CompletionItem[] {
    const values = ENUM_VALUES[field];
    if (!values) {
      return [];
    }

    return values.map((v, index) => {
      const item = new vscode.CompletionItem(v.value, vscode.CompletionItemKind.EnumMember);
      item.detail = field;
      item.documentation = new vscode.MarkdownString(v.description);
      item.sortText = String(index).padStart(2, "0");
      item.insertText = v.value;
      return item;
    });
  }

  private createHandlerCompletionItem(handler: HandlerMetadata): vscode.CompletionItem {
    const item = new vscode.CompletionItem(handler.name, vscode.CompletionItemKind.EnumMember);

    item.detail = handler.displayName;
    item.documentation = this.createHandlerDocumentation(handler);
    item.insertText = handler.name;

    // Sort priority (lower = higher priority)
    const priority: Record<string, string> = {
      reverse_proxy: "0",
      headers: "1",
      static_response: "2",
      file_server: "3",
    };
    item.sortText = priority[handler.name] ?? "9";

    return item;
  }

  private createHandlerDocumentation(handler: HandlerMetadata): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`## ${handler.displayName}\n\n`);
    md.appendMarkdown(`${handler.description}\n\n`);

    if (handler.commonFields.length > 0) {
      md.appendMarkdown(`**Common fields:** \`${handler.commonFields.join("`, `")}\`\n\n`);
    }

    // Add link to Caddy docs
    const config = vscode.workspace.getConfiguration("caddy");
    if (config.get("showCaddyDocsLinks", true)) {
      const docsUrl = handler.caddyDocsPath.startsWith("http")
        ? handler.caddyDocsPath
        : `${CADDY_DOCS_BASE}${handler.caddyDocsPath}`;
      md.appendMarkdown(`[📖 Caddy Documentation](${docsUrl})`);
    }

    return md;
  }

  private getBuilderCompletions(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    for (const [name, builder] of Object.entries(BUILDER_METADATA)) {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);

      item.detail = builder.returnType;
      item.documentation = new vscode.MarkdownString(builder.description);

      // Use the snippet from the library
      item.insertText = new vscode.SnippetString(builder.snippet.body.join("\n"));

      items.push(item);
    }

    return items;
  }
}
