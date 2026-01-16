/**
 * Completion Provider for Caddy handlers and configurations
 *
 * Uses HANDLER_METADATA from the library to provide intelligent completions.
 */

import * as vscode from "vscode";
import {
  HANDLER_METADATA,
  BUILDER_METADATA,
  type HandlerMetadata,
} from "@accelerated-software-development/caddy-api-client/extension-assets";

const CADDY_DOCS_BASE = "https://caddyserver.com";

export class CaddyCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] | undefined {
    const lineText = document.lineAt(position).text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // Check if we're completing a handler type value
    if (this.isHandlerContext(textBeforeCursor)) {
      return this.getHandlerCompletions();
    }

    // Check if we're in a TypeScript/JavaScript file completing builder calls
    if (this.isBuilderContext(document, position)) {
      return this.getBuilderCompletions();
    }

    return undefined;
  }

  private isHandlerContext(text: string): boolean {
    // Match patterns like: "handler": " or handler: "
    return /["']?handler["']?\s*:\s*["']?$/.test(text);
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
