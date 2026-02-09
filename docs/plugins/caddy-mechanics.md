# Caddy Plugin Mechanics

## How Caddy Modules Work

### Module Registration

Caddy modules are Go types that register themselves when their package is imported. Registration happens in `init()`:

```go
func init() {
    caddy.RegisterModule(MyModule{})
}

type MyModule struct {
    MyField string `json:"my_field,omitempty"`
}

func (MyModule) CaddyModule() caddy.ModuleInfo {
    return caddy.ModuleInfo{
        ID:  "namespace.module_name",
        New: func() caddy.Module { return new(MyModule) },
    }
}
```

### Module IDs and Namespaces

Module IDs follow pattern: `namespace.name` (snake_case)

- **Empty namespace** = App module (implements `caddy.App`)
- **Namespace determines**: Which host can load the module and what interfaces it must satisfy

Key namespaces:
| Namespace | Type/Interface | Purpose |
|-----------|----------------|---------|
| `http.handlers` | `caddyhttp.MiddlewareHandler` | HTTP middleware |
| `http.matchers` | `caddyhttp.RequestMatcher` | Request matching |
| `tls.certificates` | Certificate sources | TLS cert providers |
| `caddy.storage` | `certmagic.Storage` | Storage backends |
| `admin.api.*` | Admin API routes | Extend admin API |

### Module Lifecycle

1. **`New()`** - Constructor called, returns empty instance
2. **Unmarshal** - JSON config unmarshaled into struct fields
3. **`Provision(ctx caddy.Context)`** - Setup, defaults, load child modules
4. **`Validate()`** - Read-only config validation
5. **`Start()`** - For App modules, starts the app
6. **`Cleanup()`** / **`Stop()`** - Teardown when no longer needed

### Host/Guest Module Architecture

Host modules load guest modules via struct fields:

```go
type HostModule struct {
    // Raw JSON for unmarshaling
    GadgetRaw json.RawMessage `json:"gadget,omitempty" caddy:"namespace=foo.bar inline_key=name"`
    // Provisioned module instance
    Gadget Gadgeter `json:"-"`
}

func (h *HostModule) Provision(ctx caddy.Context) error {
    val, err := ctx.LoadModule(h, "GadgetRaw")
    if err != nil {
        return err
    }
    h.Gadget = val.(Gadgeter)
    return nil
}
```

The `caddy` struct tag specifies:

- `namespace=` - Which namespace to load from
- `inline_key=` - JSON field that identifies the module type

---

## Caddy Admin API

### Overview

REST API at `localhost:2019` (default). Enables zero-downtime dynamic reconfiguration.

### Core Endpoints

| Method   | Endpoint         | Purpose                   |
| -------- | ---------------- | ------------------------- |
| `POST`   | `/load`          | Replace entire config     |
| `GET`    | `/config/[path]` | Read config at path       |
| `POST`   | `/config/[path]` | Append/create at path     |
| `PUT`    | `/config/[path]` | Insert/create only        |
| `PATCH`  | `/config/[path]` | Replace existing          |
| `DELETE` | `/config/[path]` | Remove at path            |
| `POST`   | `/adapt`         | Convert Caddyfile to JSON |

### JSON Config Structure

```json
{
  "admin": { ... },
  "logging": { ... },
  "storage": { ... },
  "apps": {
    "http": { ... },
    "tls": { ... },
    "security": { ... }  // Plugin apps go here
  }
}
```

### Path Navigation

Access nested config via path: `/config/apps/http/servers/srv0/routes`

Use `@id` for shortcuts:

```json
{"@id": "my_route", "handle": [...]}
```

Then access via `/id/my_route`

---

## How Plugins Extend the JSON API

### Method 1: App Modules (Most Common)

Plugins register as Caddy "apps" with empty namespace:

```go
func (App) CaddyModule() caddy.ModuleInfo {
    return caddy.ModuleInfo{
        ID:  "security",  // No namespace = app
        New: func() caddy.Module { return new(App) },
    }
}
```

This makes the app configurable at `/config/apps/security`.

### Method 2: Admin API Namespace (Experimental)

Modules in `admin.api.<name>` namespace can extend admin routes:

```go
func (m MyAPIModule) CaddyModule() caddy.ModuleInfo {
    return caddy.ModuleInfo{
        ID: "admin.api.myendpoint",
        New: func() caddy.Module { return new(MyAPIModule) },
    }
}
```

**Note**: This is currently undocumented/unsupported. The `/load` endpoint itself is implemented as an `admin.api.load` module.

### Method 3: HTTP Handlers

Plugins can add endpoints via `http.handlers` namespace that respond to specific routes, effectively creating API endpoints within the HTTP app.

---

## Building Custom Caddy with Plugins

Use `xcaddy`:

```bash
# Build with plugin
xcaddy build --with github.com/greenpau/caddy-security

# Build specific version
xcaddy build --with github.com/greenpau/caddy-security@v1.1.31

# Run from plugin directory (dev mode)
xcaddy run
```

---

## Key Interfaces

```go
// All modules implement this
type Module interface {
    CaddyModule() ModuleInfo
}

// Apps implement this
type App interface {
    Start() error
    Stop() error
}

// Optional lifecycle
type Provisioner interface {
    Provision(Context) error
}

type Validator interface {
    Validate() error
}

type CleanerUpper interface {
    Cleanup() error
}
```

---

## References

- Extending Caddy: https://caddyserver.com/docs/extending-caddy
- Module Namespaces: https://caddyserver.com/docs/extending-caddy/namespaces
- Admin API: https://caddyserver.com/docs/api
- JSON Config: https://caddyserver.com/docs/json/
