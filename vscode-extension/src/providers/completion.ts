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
import {
  HANDLER_METADATA,
  BUILDER_METADATA,
  type HandlerMetadata,
} from "@accelerated-software-development/caddy-api-client/extension-assets";

const CADDY_DOCS_BASE = "https://caddyserver.com";

// ============================================================================
// Completion Data
// ============================================================================

/** Root-level route properties */
const ROUTE_PROPERTIES: Array<{ name: string; description: string }> = [
  { name: "@id", description: "Unique identifier for this route (used for API operations)" },
  { name: "match", description: "Array of matchers that determine when this route applies" },
  { name: "handle", description: "Array of handlers to execute when route matches" },
  { name: "terminal", description: "If true, no more routes will be evaluated after this one" },
  { name: "priority", description: "Route evaluation order (lower values = higher priority)" },
];

/** Match object properties */
const MATCH_PROPERTIES: Array<{ name: string; description: string }> = [
  { name: "host", description: "Match requests by hostname(s)" },
  { name: "path", description: "Match requests by path pattern(s)" },
  { name: "method", description: "Match requests by HTTP method(s)" },
  { name: "header", description: "Match requests by header value(s)" },
  { name: "query", description: "Match requests by query parameter(s)" },
  { name: "protocol", description: "Match requests by protocol (http, https, grpc)" },
  { name: "remote_ip", description: "Match requests by client IP address" },
  { name: "not", description: "Negate the enclosed matchers" },
  { name: "expression", description: "CEL expression for advanced matching" },
];

/** HTTP methods for method matcher */
const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "CONNECT",
  "TRACE",
];

/** Enum values for known fields */
const ENUM_VALUES: Record<string, Array<{ value: string; description: string }>> = {
  selection_policy: [
    { value: "first", description: "Use first available upstream" },
    { value: "random", description: "Randomly select an upstream" },
    { value: "least_conn", description: "Select upstream with fewest connections" },
    { value: "round_robin", description: "Cycle through upstreams in order" },
    { value: "ip_hash", description: "Hash client IP for sticky sessions" },
    { value: "uri_hash", description: "Hash request URI for consistent routing" },
    { value: "header", description: "Hash a specific header value" },
    { value: "cookie", description: "Use cookie value for upstream selection" },
  ],
  encodings: [
    { value: "gzip", description: "Gzip compression (widely supported)" },
    { value: "zstd", description: "Zstandard compression (fast, high ratio)" },
    { value: "br", description: "Brotli compression (best for text)" },
  ],
  protocol: [
    { value: "http", description: "HTTP/1.x requests" },
    { value: "https", description: "HTTPS requests" },
    { value: "grpc", description: "gRPC requests" },
  ],
};

// ============================================================================
// Completion Context Types
// ============================================================================

type CompletionContext =
  | { type: "route-property" }
  | { type: "match-property" }
  | { type: "method-value" }
  | { type: "handler-value" }
  | { type: "handler-property"; handler: string }
  | { type: "enum-value"; field: string }
  | { type: "builder" }
  | { type: "unknown" };

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
    const lineText = document.lineAt(position).text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // Check for builder context first (TypeScript/JavaScript files)
    if (this.isBuilderContext(document, position)) {
      return { type: "builder" };
    }

    // Only process JSON-like files for Caddy config completions
    const languageId = document.languageId;
    if (
      languageId !== "json" &&
      languageId !== "jsonc" &&
      !document.fileName.endsWith(".caddy.json")
    ) {
      return { type: "unknown" };
    }

    // Check for handler value context: "handler": "
    if (this.isHandlerValueContext(textBeforeCursor)) {
      return { type: "handler-value" };
    }

    // Check for method array value: "method": ["
    if (this.isMethodValueContext(textBeforeCursor)) {
      return { type: "method-value" };
    }

    // Check for enum field values
    const enumField = this.detectEnumContext(textBeforeCursor);
    if (enumField) {
      return { type: "enum-value", field: enumField };
    }

    // Get broader context by scanning backwards
    const textUpToCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));

    // Check for match property context
    if (this.isMatchPropertyContext(textUpToCursor, textBeforeCursor)) {
      return { type: "match-property" };
    }

    // Check for handler-specific property context
    const handler = this.detectHandlerContext(textUpToCursor);
    if (handler && this.isPropertyContext(textBeforeCursor)) {
      return { type: "handler-property", handler };
    }

    // Check for route property context
    if (this.isRoutePropertyContext(textUpToCursor, textBeforeCursor)) {
      return { type: "route-property" };
    }

    return { type: "unknown" };
  }

  private isHandlerValueContext(text: string): boolean {
    // Match patterns like: "handler": " or "handler": '
    return /["']?handler["']?\s*:\s*["']$/.test(text);
  }

  private isMethodValueContext(text: string): boolean {
    // Match: "method": [" or inside method array
    return (
      /["']method["']?\s*:\s*\[\s*["']?$/.test(text) ||
      /["']method["']?\s*:\s*\[[^\]]*,\s*["']$/.test(text)
    );
  }

  private detectEnumContext(text: string): string | null {
    // Check for known enum fields
    for (const field of Object.keys(ENUM_VALUES)) {
      // Match: "selection_policy": " or "encodings": ["
      const pattern = new RegExp(`["']${field}["']?\\s*:\\s*(?:\\[\\s*)?["']$`);
      if (pattern.test(text)) {
        return field;
      }
      // Also match inside array: "encodings": ["gzip", "
      const arrayPattern = new RegExp(`["']${field}["']?\\s*:\\s*\\[[^\\]]*,\\s*["']$`);
      if (arrayPattern.test(text)) {
        return field;
      }
    }
    return null;
  }

  private isMatchPropertyContext(fullText: string, lineText: string): boolean {
    // Check if we're inside a "match" array object and about to type a property
    if (!this.isPropertyContext(lineText)) {
      return false;
    }

    // Count brackets to determine if we're inside a match array
    const matchIndex = fullText.lastIndexOf('"match"');
    if (matchIndex === -1) {
      return false;
    }

    const afterMatch = fullText.substring(matchIndex);

    // Check we're inside match: [{ ... }]
    const openBrackets = (afterMatch.match(/\[/g) || []).length;
    const closeBrackets = (afterMatch.match(/\]/g) || []).length;
    const openBraces = (afterMatch.match(/\{/g) || []).length;
    const closeBraces = (afterMatch.match(/\}/g) || []).length;

    // We're in a match context if we have unclosed brackets and braces after "match"
    return openBrackets > closeBrackets && openBraces > closeBraces;
  }

  private detectHandlerContext(fullText: string): string | null {
    // Find the most recent handler declaration by scanning backwards
    // Look for "handler": "xxx" pattern
    const handlerPattern = /["']handler["']?\s*:\s*["']([^"']+)["']/g;
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;

    while ((match = handlerPattern.exec(fullText)) !== null) {
      lastMatch = match;
    }

    if (!lastMatch) {
      return null;
    }

    const handlerName = lastMatch[1];
    const handlerIndex = lastMatch.index;
    const afterHandler = fullText.substring(handlerIndex);

    // Check if we're still inside the handler object
    const openBraces = (afterHandler.match(/\{/g) || []).length;
    const closeBraces = (afterHandler.match(/\}/g) || []).length;

    if (openBraces > closeBraces && HANDLER_METADATA[handlerName]) {
      return handlerName;
    }

    return null;
  }

  private isRoutePropertyContext(fullText: string, lineText: string): boolean {
    if (!this.isPropertyContext(lineText)) {
      return false;
    }

    // Check if we're inside a route object (has handle/match siblings or is in routes array)
    // Simple heuristic: look for "routes" in the document and check brace balance
    const routesIndex = fullText.lastIndexOf('"routes"');
    if (routesIndex === -1) {
      // Also check if this looks like a standalone route file
      const hasHandle = fullText.includes('"handle"') || fullText.includes('"match"');
      if (hasHandle) {
        return true;
      }
      return false;
    }

    const afterRoutes = fullText.substring(routesIndex);
    const openBrackets = (afterRoutes.match(/\[/g) || []).length;
    const closeBrackets = (afterRoutes.match(/\]/g) || []).length;

    return openBrackets > closeBrackets;
  }

  private isPropertyContext(lineText: string): boolean {
    // Check if cursor is in a position to type a property name
    // After { or , with optional whitespace, possibly starting a quote
    return /[{,]\s*["']?$/.test(lineText) || /^\s*["']?$/.test(lineText);
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
      } else if (prop.name === "method") {
        item.insertText = new vscode.SnippetString(
          '"method": ["${1|GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS|}"]'
        );
      } else if (prop.name === "header" || prop.name === "query") {
        item.insertText = new vscode.SnippetString(`"${prop.name}": {\n  "$1": ["$2"]\n}`);
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
