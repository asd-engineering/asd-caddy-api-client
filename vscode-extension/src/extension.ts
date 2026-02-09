/**
 * VSCode Extension: Caddy Configuration Tools
 * Full version with debug logging
 */

import * as vscode from "vscode";
import { CaddyDiagnosticsProvider } from "./providers/diagnostics";
import { CaddyCodeLensProvider } from "./providers/codelens";
import { CaddyHoverProvider } from "./providers/hover";
import { CaddyCompletionProvider } from "./providers/completion";
import { registerCommands } from "./providers/commands";
import { runRouteWizard, runSecurityWizard } from "./wizards";

// Debug output channel for profiling
let outputChannel: vscode.OutputChannel;

function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
}

export function activate(context: vscode.ExtensionContext): void {
  // Create output channel for debug logs
  outputChannel = vscode.window.createOutputChannel("Caddy Tools Debug");
  context.subscriptions.push(outputChannel);

  console.log("Caddy Configuration Tools: Activating...");
  log("Extension activating...");

  const startTime = performance.now();

  // JSON file selectors for providers
  const jsonSelector: vscode.DocumentSelector = [
    { language: "json", scheme: "file" },
    { language: "jsonc", scheme: "file" },
  ];

  // TypeScript/JavaScript file selectors for builder completions
  const tsSelector: vscode.DocumentSelector = [
    { language: "typescript", scheme: "file" },
    { language: "javascript", scheme: "file" },
  ];

  // Register diagnostics provider
  log("Registering DiagnosticsProvider...");
  const diagStartTime = performance.now();
  new CaddyDiagnosticsProvider(context, outputChannel);
  log(`DiagnosticsProvider registered in ${(performance.now() - diagStartTime).toFixed(2)}ms`);

  // Register code lens provider
  log("Registering CodeLensProvider...");
  const codeLensStartTime = performance.now();
  const codeLensProvider = new CaddyCodeLensProvider(outputChannel);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(jsonSelector, codeLensProvider)
  );
  log(`CodeLensProvider registered in ${(performance.now() - codeLensStartTime).toFixed(2)}ms`);

  // Register hover provider
  log("Registering HoverProvider...");
  const hoverStartTime = performance.now();
  const hoverProvider = new CaddyHoverProvider(outputChannel);
  context.subscriptions.push(vscode.languages.registerHoverProvider(jsonSelector, hoverProvider));
  log(`HoverProvider registered in ${(performance.now() - hoverStartTime).toFixed(2)}ms`);

  // Register completion providers
  log("Registering CompletionProviders...");
  const completionStartTime = performance.now();
  const completionProvider = new CaddyCompletionProvider(outputChannel);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(jsonSelector, completionProvider, '"'),
    vscode.languages.registerCompletionItemProvider(tsSelector, completionProvider, ".")
  );
  log(
    `CompletionProviders registered in ${(performance.now() - completionStartTime).toFixed(2)}ms`
  );

  // Register commands
  log("Registering commands...");
  const commandsStartTime = performance.now();
  registerCommands(context);

  // Register wizard commands
  context.subscriptions.push(
    vscode.commands.registerCommand("caddy.runRouteWizard", runRouteWizard),
    vscode.commands.registerCommand("caddy.runSecurityWizard", runSecurityWizard)
  );
  log(`Commands registered in ${(performance.now() - commandsStartTime).toFixed(2)}ms`);

  const totalTime = performance.now() - startTime;
  log(`Extension fully activated in ${totalTime.toFixed(2)}ms`);
  console.log(`Caddy Configuration Tools: Activated in ${totalTime.toFixed(2)}ms`);
}

export function deactivate(): void {
  console.log("Caddy Configuration Tools: Deactivated");
  if (outputChannel) {
    outputChannel.appendLine("Extension deactivated");
  }
}
