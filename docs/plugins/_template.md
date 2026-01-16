# {Plugin Name}

> **Status**: Not Started | Analyzed | Types Added | Integrated

**GitHub:** {url}
**Docs:** {url}
**Plugin Version:** {version}
**Caddy Compatibility:** v2.x
**Last Analyzed:** {date}

## Overview

{Brief description of what the plugin does}

## Module Registration

### App Module (if any)

- **Module ID:** `{id}` (e.g., `security`)
- **JSON Path:** `/config/apps/{id}`
- **Go Type:** `{package.TypeName}`

```go
func (App) CaddyModule() caddy.ModuleInfo {
    return caddy.ModuleInfo{
        ID:  "{id}",
        New: func() caddy.Module { return new(App) },
    }
}
```

### HTTP Handlers

| Handler Name | Module ID              | JSON `handler` value |
| ------------ | ---------------------- | -------------------- |
| {Name}       | `http.handlers.{name}` | `{name}`             |

### HTTP Matchers (if any)

| Matcher Name | Module ID              | Usage                        |
| ------------ | ---------------------- | ---------------------------- |
| {Name}       | `http.matchers.{name}` | `match: [{ {name}: {...} }]` |

## JSON Configuration

### Handler Example

```json
{
  "handler": "{handler_name}",
  "field1": "value1"
}
```

### App Config Example (if applicable)

```json
{
  "apps": {
    "{app_id}": {
      "config": {...}
    }
  }
}
```

## Type Coverage

### Integration Status

- [ ] Handler types defined in `src/plugins/{name}/types.ts`
- [ ] Zod schemas defined in `src/plugins/{name}/schemas.ts`
- [ ] Builder functions in `src/plugins/{name}/builders.ts`
- [ ] Re-exported from `src/plugins/index.ts`
- [ ] Added to `KnownCaddyHandlerSchema` discriminated union
- [ ] Tests written
- [ ] Documentation added

### Priority

| Handler   | Priority        | Notes    |
| --------- | --------------- | -------- |
| {handler} | High/Medium/Low | {reason} |

## Version History

### {version} (Current)

- Initial analysis

## Notes

{Any special considerations, gotchas, known issues, or security notes}

## References

- {link1}
- {link2}
