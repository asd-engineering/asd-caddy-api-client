/**
 * Route Configuration Wizard
 *
 * Interactive wizard for creating Caddy route configurations
 * using VSCode's QuickPick UI.
 */

import * as vscode from "vscode";
import { HANDLER_METADATA } from "@accelerated-software-development/caddy-api-client/extension-assets";

interface RouteConfig {
  id: string;
  hosts: string[];
  path?: string;
  handlerType: string;
  upstream?: string;
  root?: string;
  statusCode?: number;
  body?: string;
  addSecurityHeaders: boolean;
  terminal: boolean;
}

/**
 * Multi-step route configuration wizard
 */
export async function runRouteWizard(): Promise<void> {
  const config: Partial<RouteConfig> = {};

  // Step 1: Select route type (handler)
  const handlerType = await selectRouteType();
  if (!handlerType) return;
  config.handlerType = handlerType;

  // Step 2: Enter route ID
  const routeId = await vscode.window.showInputBox({
    title: "Route ID (Step 2/5)",
    prompt: "Enter a unique identifier for this route",
    value: `${handlerType.replace(/_/g, "-")}-route`,
    validateInput: (value) => {
      if (!value.trim()) return "Route ID is required";
      if (!/^[a-z0-9-]+$/.test(value)) return "Use lowercase letters, numbers, and hyphens only";
      return undefined;
    },
  });
  if (!routeId) return;
  config.id = routeId;

  // Step 3: Enter host(s)
  const hosts = await vscode.window.showInputBox({
    title: "Host(s) (Step 3/5)",
    prompt: "Enter domain name(s), comma-separated for multiple",
    placeHolder: "example.com, api.example.com",
    validateInput: (value) => {
      if (!value.trim()) return "At least one host is required";
      return undefined;
    },
  });
  if (!hosts) return;
  config.hosts = hosts
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  // Step 4: Handler-specific configuration
  const handlerConfig = await configureHandler(handlerType);
  if (!handlerConfig) return;
  Object.assign(config, handlerConfig);

  // Step 5: Additional options
  const addSecurityHeaders = await vscode.window.showQuickPick(
    [
      { label: "Yes", description: "Add common security headers (recommended)", value: true },
      { label: "No", description: "Skip security headers", value: false },
    ],
    {
      title: "Add Security Headers? (Step 5/5)",
      placeHolder: "Security headers help protect your site",
    }
  );
  if (!addSecurityHeaders) return;
  config.addSecurityHeaders = addSecurityHeaders.value;
  config.terminal = true;

  // Generate and insert the code
  const code = generateRouteCode(config as RouteConfig);
  await insertCode(code);
}

async function selectRouteType(): Promise<string | undefined> {
  // Sort handlers by common usage
  const sortedHandlers = Object.values(HANDLER_METADATA)
    .filter((h) =>
      ["reverse_proxy", "file_server", "static_response", "headers", "rewrite"].includes(h.name)
    )
    .sort((a, b) => {
      const priority: Record<string, number> = {
        reverse_proxy: 0,
        file_server: 1,
        static_response: 2,
        headers: 3,
        rewrite: 4,
      };
      return (priority[a.name] ?? 99) - (priority[b.name] ?? 99);
    });

  const items = sortedHandlers.map((h) => ({
    label: h.displayName,
    description: h.name,
    detail: h.description,
    value: h.name,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: "Select Route Type (Step 1/5)",
    placeHolder: "What kind of route do you want to create?",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  return selected?.value;
}

async function configureHandler(handlerType: string): Promise<Partial<RouteConfig> | undefined> {
  switch (handlerType) {
    case "reverse_proxy":
      return configureReverseProxy();
    case "file_server":
      return configureFileServer();
    case "static_response":
      return configureStaticResponse();
    case "rewrite":
      return configureRewrite();
    default:
      return {};
  }
}

async function configureReverseProxy(): Promise<Partial<RouteConfig> | undefined> {
  const upstream = await vscode.window.showInputBox({
    title: "Upstream Server (Step 4/5)",
    prompt: "Enter the backend server address",
    placeHolder: "localhost:3000 or 192.168.1.100:8080",
    validateInput: (value) => {
      if (!value.trim()) return "Upstream address is required";
      // Basic validation for host:port format
      if (!/^[\w.-]+:\d+$/.test(value) && !/^[\w.-]+$/.test(value)) {
        return "Enter as host:port (e.g., localhost:3000)";
      }
      return undefined;
    },
  });
  if (!upstream) return undefined;

  return { upstream };
}

async function configureFileServer(): Promise<Partial<RouteConfig> | undefined> {
  const root = await vscode.window.showInputBox({
    title: "Document Root (Step 4/5)",
    prompt: "Enter the directory path to serve files from",
    value: "/var/www/html",
    validateInput: (value) => {
      if (!value.trim()) return "Document root is required";
      if (!value.startsWith("/")) return "Path must be absolute (start with /)";
      return undefined;
    },
  });
  if (!root) return undefined;

  return { root };
}

async function configureStaticResponse(): Promise<Partial<RouteConfig> | undefined> {
  const statusCode = await vscode.window.showQuickPick(
    [
      { label: "200 OK", value: 200 },
      { label: "301 Moved Permanently", description: "Permanent redirect", value: 301 },
      { label: "302 Found", description: "Temporary redirect", value: 302 },
      { label: "404 Not Found", value: 404 },
      { label: "503 Service Unavailable", description: "Maintenance mode", value: 503 },
    ],
    {
      title: "Response Status Code (Step 4/5)",
      placeHolder: "Select the HTTP status code",
    }
  );
  if (!statusCode) return undefined;

  let body: string | undefined;
  if (statusCode.value === 200 || statusCode.value >= 400) {
    body = await vscode.window.showInputBox({
      title: "Response Body (Step 4b/5)",
      prompt: "Enter the response body content",
      placeHolder: "Hello, World!",
    });
  }

  return { statusCode: statusCode.value, body };
}

async function configureRewrite(): Promise<Partial<RouteConfig> | undefined> {
  const path = await vscode.window.showInputBox({
    title: "Rewrite Path (Step 4/5)",
    prompt: "Enter the path pattern to match",
    placeHolder: "/old-path/*",
  });
  if (!path) return undefined;

  return { path };
}

function generateRouteCode(config: RouteConfig): string {
  const route: Record<string, unknown> = {
    "@id": config.id,
    match: [{ host: config.hosts }],
    handle: [],
    terminal: config.terminal,
  };

  // Add path matcher if specified
  if (config.path) {
    (route.match as Array<Record<string, unknown>>)[0].path = [config.path];
  }

  const handlers: Array<Record<string, unknown>> = [];

  // Add security headers if requested
  if (config.addSecurityHeaders) {
    handlers.push({
      handler: "headers",
      response: {
        set: {
          "X-Content-Type-Options": ["nosniff"],
          "X-Frame-Options": ["DENY"],
          "X-XSS-Protection": ["1; mode=block"],
          "Referrer-Policy": ["strict-origin-when-cross-origin"],
        },
      },
    });
  }

  // Add the main handler
  switch (config.handlerType) {
    case "reverse_proxy":
      handlers.push({
        handler: "reverse_proxy",
        upstreams: [{ dial: config.upstream }],
      });
      break;

    case "file_server":
      handlers.push({
        handler: "file_server",
        root: config.root,
      });
      break;

    case "static_response":
      const staticHandler: Record<string, unknown> = {
        handler: "static_response",
        status_code: config.statusCode,
      };
      if (config.body) {
        staticHandler.body = config.body;
      }
      // Add redirect header for 301/302
      if (config.statusCode === 301 || config.statusCode === 302) {
        staticHandler.headers = {
          Location: ["https://example.com/new-path"],
        };
      }
      handlers.push(staticHandler);
      break;

    case "rewrite":
      handlers.push({
        handler: "rewrite",
        uri: config.path,
      });
      break;
  }

  route.handle = handlers;

  return JSON.stringify(route, null, 2);
}

async function insertCode(code: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    // Insert at cursor position
    const position = editor.selection.active;
    await editor.edit((editBuilder) => {
      editBuilder.insert(position, code);
    });

    // Format the inserted code
    await vscode.commands.executeCommand("editor.action.formatDocument");

    vscode.window.showInformationMessage("Route configuration inserted!");
  } else {
    // No active editor - create a new untitled document
    const doc = await vscode.workspace.openTextDocument({
      content: code,
      language: "json",
    });
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage("Route configuration created in new document");
  }
}
