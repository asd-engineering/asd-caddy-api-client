/**
 * Command Handlers for Caddy extension
 *
 * Provides command palette commands for common Caddy configuration tasks.
 */

import * as vscode from "vscode";
import {
  HANDLER_METADATA,
  BUILDER_METADATA,
} from "@accelerated-software-development/caddy-api-client/extension-assets";

const CADDY_DOCS_BASE = "https://caddyserver.com";

export function registerCommands(context: vscode.ExtensionContext): void {
  // Show handler documentation
  const showHandlerDocs = vscode.commands.registerCommand("caddy.showHandlerDocs", async () => {
    const handlers = Object.values(HANDLER_METADATA);

    const selected = await vscode.window.showQuickPick(
      handlers.map((h) => ({
        label: h.displayName,
        description: h.name,
        detail: h.description,
        handler: h,
      })),
      {
        placeHolder: "Select a handler to view documentation",
        matchOnDescription: true,
        matchOnDetail: true,
      }
    );

    if (selected) {
      const docsUrl = selected.handler.caddyDocsPath.startsWith("http")
        ? selected.handler.caddyDocsPath
        : `${CADDY_DOCS_BASE}${selected.handler.caddyDocsPath}`;

      vscode.env.openExternal(vscode.Uri.parse(docsUrl));
    }
  });

  // Insert route configuration
  const insertRoute = vscode.commands.registerCommand("caddy.insertRoute", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor");
      return;
    }

    // Quick pick for route type
    const routeType = await vscode.window.showQuickPick(
      [
        {
          label: "Reverse Proxy Route",
          description: "Proxy requests to a backend server",
          snippet: `{
  "@id": "my-route",
  "match": [{ "host": ["\${1:example.com}"] }],
  "handle": [{
    "handler": "reverse_proxy",
    "upstreams": [{ "dial": "\${2:localhost:3000}" }]
  }],
  "terminal": true
}`,
        },
        {
          label: "Static File Server",
          description: "Serve files from disk",
          snippet: `{
  "@id": "static-files",
  "match": [{ "host": ["\${1:example.com}"] }],
  "handle": [{
    "handler": "file_server",
    "root": "\${2:/var/www/html}"
  }],
  "terminal": true
}`,
        },
        {
          label: "Redirect Route",
          description: "Redirect to another URL",
          snippet: `{
  "@id": "redirect",
  "match": [{ "host": ["\${1:old.example.com}"] }],
  "handle": [{
    "handler": "static_response",
    "status_code": 301,
    "headers": {
      "Location": ["\${2:https://new.example.com}"]
    }
  }],
  "terminal": true
}`,
        },
        {
          label: "Protected Route (caddy-security)",
          description: "Route with authentication/authorization",
          snippet: `{
  "@id": "protected-api",
  "match": [{ "host": ["\${1:api.example.com}"] }],
  "handle": [
    {
      "handler": "authentication",
      "providers": {
        "authorizer": {
          "gatekeeper_name": "\${2:my-policy}"
        }
      }
    },
    {
      "handler": "reverse_proxy",
      "upstreams": [{ "dial": "\${3:localhost:3000}" }]
    }
  ],
  "terminal": true
}`,
        },
      ],
      {
        placeHolder: "Select route type to insert",
      }
    );

    if (routeType) {
      const snippetString = new vscode.SnippetString(routeType.snippet);
      await editor.insertSnippet(snippetString);
    }
  });

  // Insert security configuration
  const insertSecurityConfig = vscode.commands.registerCommand(
    "caddy.insertSecurityConfig",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const configType = await vscode.window.showQuickPick(
        [
          {
            label: "Local Identity Store",
            description: "JSON file-based user authentication",
            snippet: `{
  "driver": "local",
  "realm": "\${1:local}",
  "path": "\${2:/etc/caddy/users.json}"
}`,
          },
          {
            label: "LDAP Identity Store",
            description: "LDAP directory authentication",
            snippet: `{
  "driver": "ldap",
  "realm": "\${1:ldap}",
  "servers": [{ "address": "\${2:ldap.example.com}", "port": 389 }],
  "bind_dn": "\${3:cn=admin,dc=example,dc=com}",
  "bind_password": "\${4:secret}",
  "search_base_dn": "\${5:ou=users,dc=example,dc=com}",
  "search_filter": "(uid={username})"
}`,
          },
          {
            label: "Authentication Portal",
            description: "Login portal configuration",
            snippet: `{
  "name": "\${1:myportal}",
  "identity_stores": ["\${2:local}"],
  "cookie": {
    "domain": "\${3:.example.com}",
    "lifetime": "24h"
  }
}`,
          },
          {
            label: "Authorization Policy",
            description: "Access control policy (gatekeeper)",
            snippet: `{
  "name": "\${1:my-policy}",
  "access_lists": [
    {
      "action": "allow",
      "claim": "\${2:roles}",
      "values": ["\${3:user}", "\${4:admin}"]
    }
  ]
}`,
          },
          {
            label: "Complete Security App",
            description: "Full security configuration for /config/apps/security",
            snippet: `{
  "config": {
    "identity_stores": [
      {
        "driver": "local",
        "realm": "local",
        "path": "\${1:/etc/caddy/users.json}"
      }
    ],
    "authentication_portals": [
      {
        "name": "\${2:myportal}",
        "identity_stores": ["local"]
      }
    ],
    "authorization_policies": [
      {
        "name": "\${3:my-policy}",
        "access_lists": [
          { "action": "allow", "claim": "roles", "values": ["user"] }
        ]
      }
    ]
  }
}`,
          },
        ],
        {
          placeHolder: "Select security configuration to insert",
        }
      );

      if (configType) {
        const snippetString = new vscode.SnippetString(configType.snippet);
        await editor.insertSnippet(snippetString);
      }
    }
  );

  context.subscriptions.push(showHandlerDocs, insertRoute, insertSecurityConfig);
}
