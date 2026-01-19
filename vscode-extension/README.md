# Caddy Configuration Tools

IntelliSense, snippets, and validation for Caddy and caddy-security configurations.

## Features

### JSON Schema Validation

Automatic validation for Caddy configuration files with real-time error highlighting and autocomplete suggestions.

### Supported File Patterns

| Pattern                                             | Description                |
| --------------------------------------------------- | -------------------------- |
| `**/caddy.json`, `**/*.caddy.json`                  | Caddy route configuration  |
| `**/caddy-security.json`, `**/.caddy-security.json` | Security app configuration |
| `**/.caddy-security-portal.json`                    | Portal configuration       |
| `**/.caddy-security-policy.json`                    | Policy configuration       |

### Code Snippets

TypeScript/JavaScript snippets for building Caddy configurations programmatically:

- `caddy-route` - Basic route structure
- `caddy-handler-static` - Static file handler
- `caddy-handler-reverse-proxy` - Reverse proxy handler
- `caddy-matcher-host` - Host matcher
- `caddy-security-portal` - Authentication portal

### Commands

Access via Command Palette (`Ctrl+Shift+P`):

- **Caddy: Show Handler Documentation** - View handler reference
- **Caddy: Insert Route Configuration** - Insert route template
- **Caddy: Insert Security Configuration** - Insert security template
- **Caddy: Route Configuration Wizard** - Guided route setup
- **Caddy: Security Configuration Wizard** - Guided security setup

## Quick Start

1. Create a file named `caddy-security.json` in your project
2. Start typing - autocomplete will suggest valid properties
3. Hover over properties for documentation

## Development Installation

```bash
cd ext/asd-caddy-api-client/vscode-extension
npm run build && npm run package
code --install-extension vscode-caddy-tools-0.1.0.vsix
```

### Debug Mode

1. Open the `vscode-extension` folder in VSCode
2. Press `F5` to launch Extension Development Host

## Links

- [ASD](https://asd.host) - Accelerated Software Development B.V.
- [Caddy Documentation](https://caddyserver.com/docs/)
- [caddy-security Plugin](https://authp.github.io/)
