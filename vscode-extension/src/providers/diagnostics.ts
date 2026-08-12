/**
 * Diagnostics Provider for Caddy configurations
 *
 * Provides real-time validation of JSON configurations using JSON Schemas
 * derived from the library's Zod schemas.
 */

import * as vscode from "vscode";
import { SimpleSchemaValidator } from "./schema-validator";
import { findPathRangeOffsets } from "./path-range-finder";

// Performance guard constants
const MAX_FILE_SIZE = 100 * 1024; // 100KB

export class CaddyDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private validator: SimpleSchemaValidator;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 500; // Wait 500ms after last keystroke
  private outputChannel: vscode.OutputChannel | undefined;

  constructor(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("caddy");
    this.validator = new SimpleSchemaValidator(context.extensionPath, (message) =>
      outputChannel?.appendLine(`[Validator] ${message}`)
    );
    this.log("CaddyDiagnosticsProvider initialized");

    // Register for document events
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.debouncedValidate(e.document)),
      vscode.workspace.onDidOpenTextDocument((doc) => this.validateDocument(doc)),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.diagnosticCollection.delete(doc.uri);
        // Clear any pending timer
        const timer = this.debounceTimers.get(doc.uri.toString());
        if (timer) {
          clearTimeout(timer);
          this.debounceTimers.delete(doc.uri.toString());
        }
      }),
      this.diagnosticCollection
    );

    // Validate all open documents on activation
    vscode.workspace.textDocuments.forEach((doc) => this.validateDocument(doc));
  }

  private log(message: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[Diagnostics] ${message}`);
    }
  }

  private debouncedValidate(document: vscode.TextDocument): void {
    const uri = document.uri.toString();

    // Clear existing timer
    const existingTimer = this.debounceTimers.get(uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(uri);
      this.validateDocument(document);
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(uri, timer);
  }

  private validateDocument(document: vscode.TextDocument): void {
    const startTime = performance.now();

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

    // File size guard - skip validation for large files
    if (text.length > MAX_FILE_SIZE) {
      this.log(
        `Skipping validation for ${document.fileName}: file too large (${(text.length / 1024).toFixed(1)}KB > ${MAX_FILE_SIZE / 1024}KB)`
      );
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    this.log(`Validating ${document.fileName} (${(text.length / 1024).toFixed(1)}KB)`);

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
    this.log(
      `Validation complete in ${(performance.now() - startTime).toFixed(2)}ms, ${diagnostics.length} diagnostics`
    );
  }

  /**
   * Find the range in the document for a JSON path
   */
  private findPathRange(document: vscode.TextDocument, jsonPath: string): vscode.Range {
    const { start, end } = findPathRangeOffsets(document.getText(), jsonPath);
    return new vscode.Range(document.positionAt(start), document.positionAt(end));
  }
}
