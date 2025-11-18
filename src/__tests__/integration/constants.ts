/**
 * Integration test timing constants
 *
 * These values can be tuned based on environment performance
 */

/**
 * Short delay after simple operations (route add, delete)
 */
export const DELAY_SHORT = 100;

/**
 * Medium delay after server configuration changes
 */
export const DELAY_MEDIUM = 200;

/**
 * Long delay after server creation or complex operations
 */
export const DELAY_LONG = 300;

/**
 * Extra long delay after HTTP server startup
 */
export const DELAY_SERVER_START = 500;
