/**
 * Re-export comprehensive Caddy JSON type definitions from caddy-json-types.
 *
 * These types provide complete coverage of Caddy's JSON configuration format,
 * including advanced features like:
 * - 50+ DNS providers for ACME challenges
 * - Layer 4 (TCP/UDP) proxy configuration
 * - PKI/CA management
 * - Storage backends (Redis, S3, DynamoDB, etc.)
 *
 * Use these types for advanced Caddy configurations beyond what our
 * Zod-validated builders provide.
 *
 * @example
 * ```typescript
 * import type { IConfig, IModulesCaddyhttpRoute } from "@accelerated-software-development/caddy-api-client/caddy-types";
 *
 * const config: IConfig = {
 *   apps: {
 *     http: {
 *       servers: {
 *         srv0: {
 *           listen: [":443"],
 *           routes: []
 *         }
 *       }
 *     }
 *   }
 * };
 * ```
 *
 * @packageDocumentation
 * @module caddy-types
 */

export * from "caddy-json-types";
