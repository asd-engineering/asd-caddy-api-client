# Agent Instructions

Rules and guidelines for AI agents working on this codebase.

## Type Safety Rules

### No `any` Type

**Rule: `any` is prohibited unless explicitly justified.**

When you encounter or generate code with `any`:

1. **Stop and investigate** - Find the actual type
2. **Use `unknown`** if the type truly cannot be determined
3. **Create proper types** if they don't exist
4. **Document exceptions** with a comment explaining why `any` is necessary

```typescript
// ❌ BAD - Never do this
const data: any = response.json();

// ✅ GOOD - Use unknown and narrow
const data: unknown = response.json();
if (isValidResponse(data)) {
  // data is now typed
}

// ✅ GOOD - Define the type
interface ApiResponse {
  status: string;
  data: Record<string, unknown>;
}
const data: ApiResponse = response.json();

// ⚠️ EXCEPTION - Only with justification
// any required: Go interface{} with no schema, validated at runtime
const dynamicConfig: any = parsePluginConfig();
```

### Generated Code Exceptions

Files in `src/generated/` may contain `any` from tygo's cross-package references. These should be:

1. **Documented** in the generated file header
2. **Wrapped** with proper types in `src/plugins/*/types.ts`
3. **Never exposed** in the public API

```typescript
// src/generated/plugins/authcrunch-authn.ts (generated - any allowed)
export interface PortalConfig {
  ui?: any /* ui.Parameters */; // Cross-package ref
}

// src/plugins/caddy-security/types.ts (hand-written - no any)
import type { PortalConfig as GeneratedPortalConfig } from "../generated/plugins/authcrunch-authn";
import type { Parameters as UIParameters } from "../generated/plugins/authcrunch-ui";

export interface PortalConfig extends Omit<GeneratedPortalConfig, "ui"> {
  ui?: UIParameters; // Properly typed
}
```

## Code Generation Rules

### When Generating Types from Go

1. **Run tygo** to get the raw TypeScript
2. **Identify `any` references** in the output
3. **Create composed types** that replace `any` with proper imports
4. **Generate Zod schemas** from the composed types (not raw generated)

### Zod Schema Requirements

- All schemas must use specific types, not `any`
- Use `z.unknown()` only for truly dynamic data
- Prefer `z.record()` over `z.any()` for object maps

```typescript
// ❌ BAD
const schema = z.object({
  config: z.any(),
});

// ✅ GOOD
const schema = z.object({
  config: z.record(z.string(), z.unknown()),
});

// ✅ BETTER - Define the shape
const schema = z.object({
  config: ConfigSchema,
});
```

## ESLint Enforcement

The project uses `@typescript-eslint/no-explicit-any` rule. To check:

```bash
npm run lint
```

If you must use `any`, disable the rule with justification:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Go interface{} with runtime validation
const pluginParams: any = rawConfig.params;
```

## Plugin Development Guidelines

### File Structure

```
src/plugins/<plugin-name>/
├── types.ts      # Composed types (no any in public exports)
├── schemas.ts    # Zod schemas (no any)
├── builders.ts   # Builder functions (no any in signatures)
└── index.ts      # Public exports
```

### Type Composition Pattern

When generated types have `any`, create a composed type:

```typescript
// 1. Import generated type
import type { Config as GeneratedOAuthConfig } from "../../generated/plugins/authcrunch-oauth";
import type { LoginIcon } from "../../generated/plugins/authcrunch-icons";

// 2. Create composed type replacing any fields
export interface OAuthConfig extends Omit<GeneratedOAuthConfig, "login_icon"> {
  login_icon?: LoginIcon;
}

// 3. Export only the composed type (not the generated one)
```

## Testing Requirements

- All exported types must have corresponding test coverage
- Tests should verify schema validation rejects invalid data
- No `as any` in test files except for testing error cases

```typescript
// ❌ BAD - Hides type errors
const config = { invalid: true } as any;
expect(schema.parse(config)).toBeDefined();

// ✅ GOOD - Explicit invalid data test
const invalidConfig = { invalid: true };
expect(() => schema.parse(invalidConfig)).toThrow();
```

## Commit Messages

When fixing `any` types:

```
fix(types): replace any with proper types in <module>

- Replace any with specific interface for <field>
- Add composed types for cross-package references
- Update schemas to use strict types
```

---

## VSCode Extension Synergy Architecture

The VSCode extension is a **thin view** of the library. All metadata flows from library source to extension via automated extraction.

### Core Principle: Single Source of Truth

```
┌─────────────────────────────────────────────────────────────────┐
│                    asd-caddy-api-client                         │
│                                                                 │
│  JSDoc Comments ──────┬──► TypeDoc (API docs)                   │
│  Builder Signatures   │                                         │
│  Zod Schemas         │                                         │
│  Handler Types       │                                         │
│                      │                                         │
│                      ├──► extract-metadata.ts                   │
│                      │         │                                │
│                      │         ▼                                │
│                      │    extension-assets.ts                   │
│                      │    - BUILDER_METADATA (41 functions)     │
│                      │    - HANDLER_METADATA (21 handlers)      │
│                      │    - Snippets, completions, hover docs   │
│                      │                                         │
│                      └──► generate-json-schemas.ts              │
│                                │                                │
│                                ▼                                │
│                           schemas/*.json (20 schemas)           │
│                                                                 │
│  Exports:                                                       │
│    "./extension-assets" ────────────────────────────────────┐  │
└─────────────────────────────────────────────────────────────┼──┘
                                                               │
                              ┌────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VSCode Extension (Thin)                      │
│                                                                 │
│  import { BUILDER_METADATA, HANDLER_METADATA }                  │
│    from "@asd/caddy-api-client/extension-assets";               │
│                                                                 │
│  - NO duplicate type definitions                                │
│  - NO duplicate documentation                                   │
│  - NO manual snippet maintenance                                │
│  - Just UI/UX code (~500 lines)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Metadata Flow

| Source               | Extracted To                        | Used For                  |
| -------------------- | ----------------------------------- | ------------------------- |
| JSDoc `@description` | `BUILDER_METADATA.description`      | Hover docs, snippets      |
| JSDoc `@default`     | `BUILDER_METADATA.params[].default` | Snippet placeholders      |
| JSDoc `@example`     | `BUILDER_METADATA.example`          | Hover documentation       |
| Builder signatures   | `BUILDER_METADATA.params`           | Wizard steps, completions |
| Handler interfaces   | `HANDLER_METADATA`                  | Autocomplete, docs links  |
| Zod schemas          | `schemas/*.json`                    | JSON validation in editor |

### Generation Pipeline

```bash
# Full regeneration pipeline
npm run generate:all

# Individual steps:
npm run generate:types        # Go → TypeScript (existing)
npm run generate:plugin-types # Plugin types (existing)
npm run generate:extension    # Extract metadata → extension-assets.ts
npm run generate:json-schemas # Zod → JSON Schema
```

### Key Files

**Library (Metadata Source)**

- `src/plugins/caddy-security/builders.ts` - Security builder functions with JSDoc
- `src/caddy/routes.ts` - Route builder functions
- `src/types.ts` - Handler type definitions
- `src/schemas.ts` - Zod schemas for validation

**Library (Generated Assets)**

- `src/generated/extension-assets.ts` - Extracted metadata for extension
- `src/generated/schemas/*.json` - JSON Schemas from Zod

**Scripts**

- `scripts/extract-metadata.ts` - TypeScript AST parsing for metadata
- `scripts/generate-json-schemas.ts` - Zod to JSON Schema conversion

**Extension**

- `vscode-extension/src/extension.ts` - Entry point (~60 lines)
- `vscode-extension/src/providers/` - Completion, hover, commands

### Adding New Builders

When adding a new builder function:

1. Write the function with proper JSDoc (`@description`, `@default`, `@example`)
2. Run `npm run generate:extension`
3. The builder automatically appears in extension snippets, completions, and hover docs

````typescript
/**
 * Build a custom handler configuration
 *
 * @param options - Handler options
 * @returns Validated handler configuration
 *
 * @example
 * ```typescript
 * const handler = buildCustomHandler({ setting: "value" });
 * ```
 */
export function buildCustomHandler(options: BuildCustomHandlerOptions): CustomHandler {
  // Implementation
}
````

### Adding New Handlers

When a new Caddy handler is added:

1. Add the handler interface to `src/types.ts`
2. Add to the `CaddyRouteHandler` union type
3. Add handler info to `scripts/extract-metadata.ts` `handlerInfo` object
4. Run `npm run generate:extension`

### Code Size Comparison

| Approach                           | Lines of Code |
| ---------------------------------- | ------------- |
| Traditional (duplicate everything) | ~5,000+       |
| Synergy (thin view)                | ~1,100        |

### Extension Development Rules

1. **Don't duplicate** - If metadata exists in the library, import it
2. **Regenerate after changes** - Run `npm run generate:extension` after modifying builders
3. **JSDoc is the source** - Improve JSDoc in library, not extension docs
4. **Test the pipeline** - Run `npm run generate:all` to verify the full flow
5. **Check local/todo.md** - Contains known improvements and backlog items (not published)
