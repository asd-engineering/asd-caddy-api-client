/**
 * Code Lens Provider for Caddy configurations
 *
 * Shows "View Docs" links above handler definitions for quick access
 * to Caddy documentation.
 */

import * as vscode from "vscode";
import { HANDLER_METADATA } from "@accelerated-software-development/caddy-api-client/extension-assets";

const CADDY_DOCS_BASE = "https://caddyserver.com";
const MAX_FILE_SIZE = 100 * 1024; // 100KB - skip code lens for large files

export class CaddyCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private outputChannel: vscode.OutputChannel | undefined;
  private callCount = 0;

  constructor(outputChannel?: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    // Refresh code lenses when configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("caddy.showCodeLens")) {
        this._onDidChangeCodeLenses.fire();
      }
    });
  }

  private log(message: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[CodeLens] ${message}`);
    }
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] | undefined {
    const startTime = performance.now();
    this.callCount++;
    const callId = this.callCount;

    // Check if code lens is enabled
    const config = vscode.workspace.getConfiguration("caddy");
    if (!config.get("showCodeLens", true)) {
      return undefined;
    }

    // Only for JSON files
    if (document.languageId !== "json" && document.languageId !== "jsonc") {
      return undefined;
    }

    // Only process Caddy-related files (check filename)
    const fileName = document.fileName.toLowerCase();
    const isCaddyFile =
      fileName.includes("caddy") ||
      fileName.includes("security") ||
      fileName.endsWith(".caddy.json");
    if (!isCaddyFile) {
      return undefined;
    }

    const text = document.getText();

    // File size guard - skip code lens for large files
    if (text.length > MAX_FILE_SIZE) {
      this.log(`[#${callId}] Skipping: file too large (${(text.length / 1024).toFixed(1)}KB)`);
      return undefined;
    }

    this.log(`[#${callId}] Processing ${document.fileName} (${(text.length / 1024).toFixed(1)}KB)`);

    const codeLenses: vscode.CodeLens[] = [];

    // Find all handler definitions
    const handlerPattern = /"handler"\s*:\s*"([^"]+)"/g;
    let match;

    while ((match = handlerPattern.exec(text)) !== null) {
      const handlerName = match[1];
      const handlerMeta = HANDLER_METADATA[handlerName];

      if (handlerMeta) {
        // Find the position of this match
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        // Build the docs URL
        const docsUrl = handlerMeta.caddyDocsPath.startsWith("http")
          ? handlerMeta.caddyDocsPath
          : `${CADDY_DOCS_BASE}${handlerMeta.caddyDocsPath}`;

        // Create code lens for documentation
        const docsLens = new vscode.CodeLens(range, {
          title: `📖 ${handlerMeta.displayName} Docs`,
          command: "vscode.open",
          arguments: [vscode.Uri.parse(docsUrl)],
        });

        codeLenses.push(docsLens);

        // Add fields hint as part of the docs title (not a separate clickable lens)
        const fieldsHint =
          handlerMeta.commonFields.length > 0
            ? ` | Fields: ${handlerMeta.commonFields.slice(0, 3).join(", ")}${handlerMeta.commonFields.length > 3 ? "..." : ""}`
            : "";
        docsLens.command!.title = `📖 ${handlerMeta.displayName} Docs${fieldsHint}`;
      }
    }

    // Find security-related patterns
    this.addSecurityCodeLenses(document, text, codeLenses);

    this.log(
      `[#${callId}] Found ${codeLenses.length} code lenses in ${(performance.now() - startTime).toFixed(2)}ms`
    );
    return codeLenses;
  }

  private addSecurityCodeLenses(
    document: vscode.TextDocument,
    text: string,
    codeLenses: vscode.CodeLens[]
  ): void {
    // Pattern for authentication portals
    const portalPattern = /"name"\s*:\s*"([^"]+)"[^}]*"identity_stores"/g;
    let match;

    while ((match = portalPattern.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      codeLenses.push(
        new vscode.CodeLens(range, {
          title: "📖 Portal Configuration Docs",
          command: "vscode.open",
          arguments: [vscode.Uri.parse("https://authcrunch.com/docs/authenticate/portal/")],
        })
      );
    }

    // Pattern for authorization policies
    const policyPattern = /"name"\s*:\s*"([^"]+)"[^}]*"access_lists"/g;

    while ((match = policyPattern.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      codeLenses.push(
        new vscode.CodeLens(range, {
          title: "📖 Authorization Policy Docs",
          command: "vscode.open",
          arguments: [vscode.Uri.parse("https://authcrunch.com/docs/authorize/")],
        })
      );
    }

    // Pattern for identity stores
    const storePatterns = [
      {
        pattern: /"driver"\s*:\s*"local"/g,
        title: "Local Store Docs",
        url: "https://authcrunch.com/docs/authenticate/local/",
      },
      {
        pattern: /"driver"\s*:\s*"ldap"/g,
        title: "LDAP Store Docs",
        url: "https://authcrunch.com/docs/authenticate/ldap/",
      },
    ];

    for (const { pattern, title, url } of storePatterns) {
      while ((match = pattern.exec(text)) !== null) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `📖 ${title}`,
            command: "vscode.open",
            arguments: [vscode.Uri.parse(url)],
          })
        );
      }
    }
  }
}
