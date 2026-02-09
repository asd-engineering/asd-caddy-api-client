/**
 * Caddy Plugin Integrations
 *
 * This module provides type-safe integrations for third-party Caddy plugins.
 * Each plugin integration includes:
 *
 * - **Types**: TypeScript interfaces for handler configurations
 * - **Schemas**: Zod schemas for runtime validation
 * - **Builders**: Helper functions for creating configurations
 *
 * ## Supported Plugins
 *
 * - **caddy-security**: Authentication and authorization (JWT, OAuth, LDAP, etc.)
 *
 * ## Usage
 *
 * Import directly from the plugin subpath for tree-shaking:
 *
 * ```typescript
 * import { buildProtectedRoute } from "@.../caddy-api-client/plugins/caddy-security";
 * ```
 *
 * Or import all plugins from this barrel:
 *
 * ```typescript
 * import { caddySecurity } from "@.../caddy-api-client";
 * const handler = caddySecurity.buildAuthenticationHandler({ portalName: "myportal" });
 * ```
 *
 * ## Plugin Lifecycle
 *
 * Each plugin follows a documentation-first integration approach:
 *
 * 1. **Analyze**: Document plugin in `local/plugins/<name>/README.md`
 * 2. **Types**: Define TypeScript interfaces in `src/plugins/<name>/types.ts`
 * 3. **Schemas**: Create Zod schemas in `src/plugins/<name>/schemas.ts`
 * 4. **Builders**: Add helper functions in `src/plugins/<name>/builders.ts`
 * 5. **Export**: Re-export from this index
 *
 * See `local/plugins/_template.md` for the documentation template.
 *
 * @packageDocumentation
 */

// Re-export caddy-security as a namespace
import * as caddySecurity from "./caddy-security/index.js";
export { caddySecurity };

// Also export individual items for direct imports
export * from "./caddy-security/index.js";
