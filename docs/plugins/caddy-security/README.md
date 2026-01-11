# caddy-security Plugin

GitHub: https://github.com/greenpau/caddy-security
Docs: https://docs.authcrunch.com

## Overview

`caddy-security` provides Authentication, Authorization, and Accounting (AAA) for Caddy v2. It's a comprehensive security plugin supporting multiple auth methods.

## Module Registration

The plugin registers **three main components**:

### 1. App (Security Manager)

```go
type App struct {
    Name               string            `json:"-"`
    Config             *authcrunch.Config `json:"config,omitempty"`
    SecretsManagersRaw []json.RawMessage `json:"secrets_managers,omitempty"
                                          caddy:"namespace=security.secrets inline_key=driver"`
}

func (App) CaddyModule() caddy.ModuleInfo {
    return caddy.ModuleInfo{
        ID:  "security",  // Registers as app at /config/apps/security
        New: func() caddy.Module { return new(App) },
    }
}
```

Configurable at: `POST /config/apps/security`

### 2. AuthnMiddleware (Authentication Portal)

```go
type AuthnMiddleware struct {
    RouteMatcher string `json:"route_matcher,omitempty"`
    PortalName   string `json:"portal_name,omitempty"`
}

func (AuthnMiddleware) CaddyModule() caddy.ModuleInfo {
    return caddy.ModuleInfo{
        ID:  "http.handlers.authentication",  // HTTP handler namespace
        New: func() caddy.Module { return new(AuthnMiddleware) },
    }
}
```

Used in HTTP routes as a handler.

### 3. AuthzMiddleware (Authorization Gateway)

```go
type AuthzMiddleware struct {
    RouteMatcher   string `json:"route_matcher,omitempty"`
    GatekeeperName string `json:"gatekeeper_name,omitempty"`
}

func (AuthzMiddleware) CaddyModule() caddy.ModuleInfo {
    return caddy.ModuleInfo{
        ID:  "http.handlers.authorization",  // HTTP handler namespace
        New: func() caddy.Module { return new(AuthzMiddleware) },
    }
}

// Also implements caddyauth.Authenticator
func (m AuthzMiddleware) Authenticate(w http.ResponseWriter, r *http.Request) (caddyauth.User, bool, error)
```

---

## How It Extends Caddy

### JSON Config Path

The `security` app lives at `/config/apps/security`:

```json
{
  "apps": {
    "security": {
      "config": {
        "authentication_portals": [...],
        "authorization_policies": [...],
        "credentials": {...}
      },
      "secrets_managers": [...]
    }
  }
}
```

### Sub-Module Namespaces

| Namespace          | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `security.secrets` | Secrets manager drivers (AWS, Vault, etc.) |

### HTTP Handler Integration

The auth middleware handlers plug into Caddy's HTTP routes:

```json
{
  "apps": {
    "http": {
      "servers": {
        "srv0": {
          "routes": [
            {
              "handle": [
                {
                  "handler": "authentication",
                  "portal_name": "myportal"
                }
              ]
            }
          ]
        }
      }
    }
  }
}
```

---

## Authentication Methods

- **Form-based** - Login forms with POST
- **Basic HTTP** - Authorization header
- **Local** - JSON file user database
- **LDAP** - Active Directory
- **OpenID Connect** - Google, Okta, etc.
- **OAuth 2.0** - GitHub, Google, Facebook
- **SAML** - Enterprise SSO

## Authorization

- JWT token validation
- PASETO token support
- Role/claims-based access control

---

## Caddyfile Example

```caddyfile
{
    security {
        local identity store localdb {
            realm local
            path {$HOME}/.local/caddy/users.json
        }

        authentication portal myportal {
            enable identity store localdb
        }
    }
}

app.example.com {
    authenticate with myportal
}
```

---

## Key Endpoints

- `/whoami` - Returns authenticated user info (JSON)
- Portal paths configurable per portal

---

## API Interaction Points

To configure via admin API:

```bash
# Get current security config
curl localhost:2019/config/apps/security

# Update authentication config
curl -X PATCH localhost:2019/config/apps/security/config \
  -H "Content-Type: application/json" \
  -d '{"authentication_portals": [...]}'
```

---

## Security Notes

This package has known vulnerabilities (XSS, auth bypass, SSRF). Check for updates before production use.

---

## References

- Package docs: https://pkg.go.dev/github.com/greenpau/caddy-security
- AuthCrunch docs: https://docs.authcrunch.com
- Docker: `authcrunch/authcrunch`
