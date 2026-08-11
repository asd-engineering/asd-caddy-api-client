/**
 * Pure route-config JSON generation for the Route Configuration Wizard --
 * extracted from route-wizard.ts (0.10) so it can be unit-tested directly
 * (see src/__tests__/route-config-generator.test.ts in the main package),
 * same pattern as completion-data.ts. No `vscode` import: the wizard's
 * QuickPick/InputBox prompting stays in route-wizard.ts and only calls this
 * module once it has a fully-populated RouteConfig.
 */

export interface RouteConfig {
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

export function generateRouteCode(config: RouteConfig): string {
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

    case "static_response": {
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
    }

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
