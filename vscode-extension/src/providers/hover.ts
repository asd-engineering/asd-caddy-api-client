/**
 * Hover Provider for Caddy documentation
 *
 * Uses HANDLER_METADATA and BUILDER_METADATA from the library
 * to show rich documentation on hover.
 */

import * as vscode from "vscode";
import {
  HANDLER_METADATA,
  BUILDER_METADATA,
} from "@accelerated-software-development/caddy-api-client/extension-assets";

const CADDY_DOCS_BASE = "https://caddyserver.com";

export class CaddyHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    const config = vscode.workspace.getConfiguration("caddy");
    if (!config.get("enableHoverDocs", true)) {
      return undefined;
    }

    const wordRange = document.getWordRangeAtPosition(position, /[a-z_]+/);
    if (!wordRange) {
      return undefined;
    }

    const word = document.getText(wordRange);

    // Check if it's a handler name
    if (HANDLER_METADATA[word]) {
      return this.createHandlerHover(HANDLER_METADATA[word], wordRange);
    }

    // Check if it's a builder function
    if (BUILDER_METADATA[word]) {
      return this.createBuilderHover(BUILDER_METADATA[word], wordRange);
    }

    // Check for common Caddy configuration keys
    const configKey = this.getConfigKeyHover(word);
    if (configKey) {
      return new vscode.Hover(configKey, wordRange);
    }

    return undefined;
  }

  private createHandlerHover(
    handler: (typeof HANDLER_METADATA)[string],
    range: vscode.Range
  ): vscode.Hover {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`## 🔧 ${handler.displayName} Handler\n\n`);
    md.appendMarkdown(`${handler.description}\n\n`);

    if (handler.commonFields.length > 0) {
      md.appendMarkdown(`### Common Fields\n\n`);
      for (const field of handler.commonFields) {
        md.appendMarkdown(`- \`${field}\`\n`);
      }
      md.appendMarkdown("\n");
    }

    // JSON example
    md.appendMarkdown(`### Example\n\n`);
    md.appendCodeBlock(
      JSON.stringify(
        {
          handler: handler.name,
          ...(handler.name === "reverse_proxy" && {
            upstreams: [{ dial: "localhost:3000" }],
          }),
          ...(handler.name === "static_response" && {
            status_code: 200,
            body: "Hello, World!",
          }),
          ...(handler.name === "file_server" && {
            root: "/var/www/html",
          }),
        },
        null,
        2
      ),
      "json"
    );

    // Docs link
    const config = vscode.workspace.getConfiguration("caddy");
    if (config.get("showCaddyDocsLinks", true)) {
      const docsUrl = handler.caddyDocsPath.startsWith("http")
        ? handler.caddyDocsPath
        : `${CADDY_DOCS_BASE}${handler.caddyDocsPath}`;
      md.appendMarkdown(`\n[📖 View Caddy Documentation](${docsUrl})`);
    }

    return new vscode.Hover(md, range);
  }

  private createBuilderHover(
    builder: (typeof BUILDER_METADATA)[string],
    range: vscode.Range
  ): vscode.Hover {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`## 🛠️ ${builder.name}\n\n`);
    md.appendMarkdown(`${builder.description}\n\n`);

    // Parameters
    if (builder.params.length > 0) {
      md.appendMarkdown(`### Parameters\n\n`);
      for (const param of builder.params) {
        const required = param.required ? "(required)" : "(optional)";
        const defaultVal = param.default ? ` = \`${param.default}\`` : "";
        md.appendMarkdown(`- **${param.name}**: \`${param.type}\` ${required}${defaultVal}\n`);
        if (param.description) {
          md.appendMarkdown(`  - ${param.description}\n`);
        }
      }
      md.appendMarkdown("\n");
    }

    // Return type
    md.appendMarkdown(`**Returns:** \`${builder.returnType}\`\n\n`);

    // Example
    if (builder.example) {
      md.appendMarkdown(`### Example\n\n`);
      md.appendCodeBlock(builder.example, "typescript");
    }

    return new vscode.Hover(md, range);
  }

  private getConfigKeyHover(key: string): vscode.MarkdownString | undefined {
    const configDocs: Record<string, { title: string; description: string; type: string }> = {
      upstreams: {
        title: "Upstreams",
        description: "List of backend servers to proxy requests to",
        type: "Array<{ dial: string; max_requests?: number }>",
      },
      dial: {
        title: "Dial Address",
        description: "Network address in host:port format (e.g., 'localhost:3000')",
        type: "string",
      },
      match: {
        title: "Route Matchers",
        description: "Conditions that must be met for this route to handle the request",
        type: "Array<{ host?: string[]; path?: string[]; method?: string[] }>",
      },
      handle: {
        title: "Handlers",
        description: "Actions to perform when the route matches",
        type: "Array<CaddyRouteHandler>",
      },
      terminal: {
        title: "Terminal",
        description: "If true, no more routes will be evaluated after this one matches",
        type: "boolean",
      },
      load_balancing: {
        title: "Load Balancing",
        description: "Configure how requests are distributed across upstreams",
        type: "{ selection_policy?: { policy: string }; retries?: number }",
      },
      health_checks: {
        title: "Health Checks",
        description: "Configure active and passive health checking for upstreams",
        type: "{ active?: ActiveHealthChecks; passive?: PassiveHealthChecks }",
      },
      portal_name: {
        title: "Portal Name (caddy-security)",
        description: "Name of the authentication portal defined in the security app config",
        type: "string",
      },
      gatekeeper_name: {
        title: "Gatekeeper Name (caddy-security)",
        description: "Name of the authorization policy defined in the security app config",
        type: "string",
      },
    };

    const doc = configDocs[key];
    if (!doc) {
      return undefined;
    }

    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`## ${doc.title}\n\n`);
    md.appendMarkdown(`${doc.description}\n\n`);
    md.appendMarkdown(`**Type:** \`${doc.type}\``);

    return md;
  }
}
