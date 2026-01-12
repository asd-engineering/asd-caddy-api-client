/**
 * VSCode Extension: Caddy Configuration Tools
 *
 * A thin layer that imports metadata from the asd-caddy-api-client library
 * and wires it to VSCode providers for IntelliSense, snippets, and validation.
 *
 * Total extension code: ~300 lines (UI layer only)
 */

import * as vscode from "vscode";
import { CaddyCompletionProvider } from "./providers/completion";
import { CaddyHoverProvider } from "./providers/hover";
import { CaddyDiagnosticsProvider } from "./providers/diagnostics";
import { CaddyCodeLensProvider } from "./providers/codelens";
import { registerCommands } from "./providers/commands";

/**
 * Extension activation - called when extension is first used
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log("Caddy Configuration Tools: Activating...");

  // Register completion provider for handler types
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    [
      { language: "json", scheme: "file" },
      { language: "jsonc", scheme: "file" },
      { language: "typescript", scheme: "file" },
      { language: "javascript", scheme: "file" },
    ],
    new CaddyCompletionProvider(),
    '"', // Trigger on quote for handler values
    ":" // Trigger on colon for property completions
  );

  // Register hover provider for documentation
  const hoverProvider = vscode.languages.registerHoverProvider(
    [
      { language: "json", scheme: "file" },
      { language: "jsonc", scheme: "file" },
      { language: "typescript", scheme: "file" },
      { language: "javascript", scheme: "file" },
    ],
    new CaddyHoverProvider()
  );

  // Register commands
  registerCommands(context);

  // Register diagnostics provider for real-time validation
  new CaddyDiagnosticsProvider(context);

  // Register code lens provider for quick docs access
  const codeLensProvider = vscode.languages.registerCodeLensProvider(
    [
      { language: "json", scheme: "file" },
      { language: "jsonc", scheme: "file" },
    ],
    new CaddyCodeLensProvider()
  );

  // Add to subscriptions for cleanup
  context.subscriptions.push(completionProvider, hoverProvider, codeLensProvider);

  console.log("Caddy Configuration Tools: Activated successfully");
}

/**
 * Extension deactivation - cleanup
 */
export function deactivate(): void {
  console.log("Caddy Configuration Tools: Deactivated");
}
