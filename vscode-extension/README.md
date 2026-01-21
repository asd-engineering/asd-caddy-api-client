# Caddy Configuration Tools

[![Version](https://img.shields.io/badge/version-0.1.5-blue.svg)](https://github.com/asd-engineering/asd-caddy-api-client)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Full-featured IntelliSense, validation, and snippets for [Caddy](https://caddyserver.com/) web server configurations, including the [caddy-security](https://authp.github.io/) authentication plugin.

![Feature Overview](https://raw.githubusercontent.com/asd-engineering/asd-caddy-api-client/main/vscode-extension/docs/images/feature-overview.png)

---

## Features

### IntelliSense & Autocompletion

Context-aware completions that understand where you are in your configuration:

| Context                          | Completions                                                     |
| -------------------------------- | --------------------------------------------------------------- |
| Route object `{ \| }`            | `@id`, `match`, `handle`, `terminal`, `priority`                |
| Match object `"match": [{ \| }]` | `host`, `path`, `method`, `header`, `query`, `protocol`         |
| Method array `"method": ["\|"]`  | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`      |
| Handler type `"handler": "\|"`   | All 21 Caddy handlers with documentation                        |
| Inside handler                   | Handler-specific fields (e.g., `upstreams` for `reverse_proxy`) |
| Enum fields                      | `selection_policy`, `encodings`, `protocol` values              |

### JSON Schema Validation

Real-time validation with detailed error messages. Schemas are automatically applied based on filename:

| Filename Pattern                           | Schema      | Description                                     |
| ------------------------------------------ | ----------- | ----------------------------------------------- |
| `caddy-server.json`, `*.caddy-server.json` | Full Config | Complete Caddy config with servers, TLS, routes |
| `caddy.json`, `*.caddy.json`               | Route       | Single route or route array                     |
| `caddy-security.json`                      | Security    | Security plugin configuration                   |
| `*.caddy-security-portal.json`             | Portal      | Authentication portal                           |
| `*.caddy-security-policy.json`             | Policy      | Authorization policy                            |

### Hover Documentation

Hover over any handler type to see:

- Handler description
- Common fields
- Link to official Caddy documentation

### CodeLens

Quick documentation links appear above handler definitions for instant access to Caddy docs.

### Configuration Wizards

Interactive wizards guide you through creating configurations:

- **Route Configuration Wizard** - Step-by-step route creation
- **Security Configuration Wizard** - Set up authentication and authorization

---

## Installation

### From VSIX (Local)

```bash
# Build and install
cd vscode-extension
npm run build && npm run package
code --install-extension vscode-caddy-tools-0.1.5.vsix
```

### From Source (Development)

```bash
# Clone and install dependencies
git clone https://github.com/asd-engineering/asd-caddy-api-client.git
cd asd-caddy-api-client/vscode-extension
npm install

# Launch in development mode
# Press F5 in VS Code to start Extension Development Host
```

---

## Quick Start

1. **Create a configuration file** using one of the supported naming patterns:

   ```
   my-app.caddy.json      # Route configuration
   caddy-server.json      # Full server configuration
   caddy-security.json    # Security plugin configuration
   ```

2. **Start typing** - IntelliSense will suggest valid properties and values

3. **Use snippets** - Type `caddy-` to see available snippets

4. **Run wizards** - Press `Ctrl+Shift+P` and search for "Caddy"

---

## Commands

Access via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command                                | Description                                    |
| -------------------------------------- | ---------------------------------------------- |
| `Caddy: Show Handler Documentation`    | Browse handler reference with docs links       |
| `Caddy: Insert Route Configuration`    | Insert a route template with handler selection |
| `Caddy: Insert Security Configuration` | Insert security config (portal, policy, store) |
| `Caddy: Route Configuration Wizard`    | Guided multi-step route creation               |
| `Caddy: Security Configuration Wizard` | Guided security setup                          |

---

## Snippets

### JSON Snippets

For use in `.json` files:

| Prefix                    | Description                                 |
| ------------------------- | ------------------------------------------- |
| `caddy-route`             | Complete route with match, handle, terminal |
| `caddy-handler-proxy`     | Reverse proxy handler                       |
| `caddy-handler-files`     | File server handler                         |
| `caddy-handler-headers`   | Headers manipulation handler                |
| `caddy-handler-static`    | Static response handler                     |
| `caddy-sec-authenticator` | caddy-security authenticator handler        |
| `caddy-sec-authorizer`    | caddy-security authorization handler        |
| `caddy-sec-portal`        | Authentication portal configuration         |
| `caddy-sec-policy`        | Authorization policy configuration          |
| `caddy-sec-local-store`   | Local identity store                        |
| `caddy-sec-ldap-store`    | LDAP identity store                         |

### TypeScript/JavaScript Snippets

For programmatic configuration building with the `@asd/caddy-api-client` library:

| Prefix                        | Description                                  |
| ----------------------------- | -------------------------------------------- |
| `caddy-reverse-proxy-handler` | `buildReverseProxyHandler()`                 |
| `caddy-protected-route`       | `buildProtectedRoute()` with authorization   |
| `caddy-authenticator-route`   | `buildAuthenticatorRoute()` for login portal |
| `caddy-security-config`       | `buildSecurityConfig()`                      |
| `caddy-authentication-portal` | `buildAuthenticationPortal()`                |
| `caddy-authorization-policy`  | `buildAuthorizationPolicy()`                 |
| `caddy-local-identity-store`  | `buildLocalIdentityStore()`                  |
| `caddy-ldap-identity-store`   | `buildLdapIdentityStore()`                   |
| `caddy-oauth2-provider`       | `buildOAuth2Provider()`                      |
| `caddy-oidc-provider`         | `buildOidcProvider()`                        |

<details>
<summary>View all 41 TypeScript snippets</summary>

| Prefix                               | Description                     |
| ------------------------------------ | ------------------------------- |
| `caddy-local-identity-store`         | Build local identity store      |
| `caddy-ldap-identity-store`          | Build LDAP identity store       |
| `caddy-oauth2-provider`              | Build OAuth2 provider           |
| `caddy-oidc-provider`                | Build OIDC provider             |
| `caddy-authentication-portal`        | Build authentication portal     |
| `caddy-authorization-policy`         | Build authorization policy      |
| `caddy-security-config`              | Build security config           |
| `caddy-security-app`                 | Build security app              |
| `caddy-authenticator-handler`        | Build authenticator handler     |
| `caddy-authorization-handler`        | Build authorization handler     |
| `caddy-authenticator-route`          | Build authenticator route       |
| `caddy-protected-route`              | Build protected route           |
| `caddy-service-routes`               | Build service routes            |
| `caddy-health-check-route`           | Build health check route        |
| `caddy-host-route`                   | Build host-based route          |
| `caddy-path-route`                   | Build path-based route          |
| `caddy-load-balancer-route`          | Build load balancer route       |
| `caddy-reverse-proxy-handler`        | Build reverse proxy handler     |
| `caddy-security-headers-handler`     | Build security headers handler  |
| `caddy-basic-auth-handler`           | Build basic auth handler        |
| `caddy-rewrite-handler`              | Build rewrite handler           |
| `caddy-compression-handler`          | Build compression handler       |
| `caddy-www-redirect`                 | Build WWW redirect              |
| `caddy-redirect-route`               | Build redirect route            |
| `caddy-file-server-route`            | Build file server route         |
| `caddy-templates-route`              | Build templates route           |
| `caddy-error-route`                  | Build error route               |
| `caddy-request-body-handler`         | Build request body handler      |
| `caddy-vars-handler`                 | Build vars handler              |
| `caddy-tracing-handler`              | Build tracing handler           |
| `caddy-map-handler`                  | Build map handler               |
| `caddy-iframe-proxy-route`           | Build iframe proxy route        |
| `caddy-iframe-headers-handler`       | Build iframe headers handler    |
| `caddy-iframe-permissive-handler`    | Build iframe permissive handler |
| `caddy-web-socket-proxy-route`       | Build WebSocket proxy route     |
| `caddy-ingress-tag-headers-handler`  | Build ingress tag headers       |
| `caddy-dns-rebinding-bypass-handler` | Build DNS rebinding bypass      |
| `caddy-mitmproxy-route`              | Build MITMproxy route           |
| `caddy-mitmproxy-route-pair`         | Build MITMproxy route pair      |
| `caddy-mitmproxy-web-ui-route`       | Build MITMproxy Web UI route    |
| `caddy-mitmproxy-web-socket-route`   | Build MITMproxy WebSocket route |

</details>

---

## Settings

Configure the extension in VS Code settings (`Ctrl+,`):

| Setting                    | Type    | Default | Description                             |
| -------------------------- | ------- | ------- | --------------------------------------- |
| `caddy.enableHoverDocs`    | boolean | `true`  | Show documentation in hover tooltips    |
| `caddy.showCaddyDocsLinks` | boolean | `true`  | Include links to official Caddy docs    |
| `caddy.showCodeLens`       | boolean | `true`  | Show documentation links above handlers |
| `caddy.enableDiagnostics`  | boolean | `true`  | Enable real-time validation             |

Example `settings.json`:

```json
{
  "caddy.enableHoverDocs": true,
  "caddy.showCaddyDocsLinks": true,
  "caddy.showCodeLens": true,
  "caddy.enableDiagnostics": true
}
```

---

## Supported Handlers

The extension provides IntelliSense for all Caddy HTTP handlers:

| Handler                 | Description               | Common Fields                                               |
| ----------------------- | ------------------------- | ----------------------------------------------------------- |
| `reverse_proxy`         | Proxy to upstream servers | `upstreams`, `transport`, `load_balancing`, `health_checks` |
| `file_server`           | Serve static files        | `root`, `index_names`, `browse`, `hide`                     |
| `static_response`       | Return fixed response     | `status_code`, `body`, `headers`                            |
| `headers`               | Modify headers            | `request`, `response`                                       |
| `rewrite`               | Rewrite request URI       | `uri`, `strip_path_prefix`, `strip_path_suffix`             |
| `encode`                | Compress responses        | `encodings`, `prefer`, `minimum_length`                     |
| `templates`             | Render Go templates       | `file_root`, `mime_types`, `delimiters`                     |
| `authentication`        | HTTP authentication       | `providers`                                                 |
| `subroute`              | Nested routes             | `routes`                                                    |
| `map`                   | Variable mapping          | `source`, `destinations`, `mappings`                        |
| `push`                  | HTTP/2 push               | `resources`, `headers`                                      |
| `request_body`          | Body size limits          | `max_size`                                                  |
| `vars`                  | Set variables             | (dynamic)                                                   |
| `tracing`               | Distributed tracing       | `span`                                                      |
| `error`                 | Trigger error             | `error`, `status_code`                                      |
| `intercept`             | Modify responses          | `handle_response`                                           |
| `invoke`                | Call named route          | `name`                                                      |
| `copy_response`         | Copy response             | `status_code`                                               |
| `copy_response_headers` | Copy headers              | `include`, `exclude`                                        |
| `log_append`            | Add log fields            | `key`, `value`                                              |
| `authenticator`         | caddy-security portal     | `portal_name`                                               |

---

## Example Configurations

### Basic Reverse Proxy

```json
{
  "@id": "api-proxy",
  "match": [{ "host": ["api.example.com"] }],
  "handle": [
    {
      "handler": "reverse_proxy",
      "upstreams": [{ "dial": "localhost:3000" }]
    }
  ],
  "terminal": true
}
```

### Protected Route with Authentication

```json
{
  "@id": "admin-panel",
  "match": [{ "host": ["admin.example.com"] }, { "path": ["/admin/*"] }],
  "handle": [
    {
      "handler": "authentication",
      "providers": {
        "authorizer": {
          "gatekeeper_name": "admin-policy"
        }
      }
    },
    {
      "handler": "reverse_proxy",
      "upstreams": [{ "dial": "localhost:8080" }]
    }
  ],
  "terminal": true
}
```

### File Server with Compression

```json
{
  "@id": "static-files",
  "match": [{ "path": ["/static/*"] }],
  "handle": [
    {
      "handler": "encode",
      "encodings": { "gzip": {}, "zstd": {} }
    },
    {
      "handler": "file_server",
      "root": "/var/www/static"
    }
  ]
}
```

---

## Development

### Prerequisites

- Node.js 18+
- npm 9+
- VS Code 1.85+

### Build

```bash
npm install
npm run build
```

### Test

```bash
npm test              # Run Playwright tests
npm run test:headed   # Run tests with browser visible
npm run test:debug    # Debug tests
```

### Package

```bash
npm run package       # Creates .vsix file
```

---

## Related Resources

- [Caddy Documentation](https://caddyserver.com/docs/) - Official Caddy docs
- [Caddy JSON Config](https://caddyserver.com/docs/json/) - JSON configuration reference
- [caddy-security Plugin](https://authp.github.io/) - Authentication plugin docs
- [@asd/caddy-api-client](https://github.com/asd-engineering/asd-caddy-api-client) - TypeScript library for Caddy API

---

## License

MIT - [Accelerated Software Development B.V.](https://asd.host)
