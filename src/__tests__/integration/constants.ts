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

/**
 * MITMproxy Web UI URL (docker-compose port 8081)
 */
export const MITMPROXY_WEB_URL = "http://127.0.0.1:8081";

/**
 * MITMproxy proxy URL (docker-compose port 8082)
 */
export const MITMPROXY_PROXY_URL = "http://127.0.0.1:8082";

/**
 * Backend test service URL (docker-compose port 5681)
 */
export const BACKEND_URL = "http://127.0.0.1:5681";
