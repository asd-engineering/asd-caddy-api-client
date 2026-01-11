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
