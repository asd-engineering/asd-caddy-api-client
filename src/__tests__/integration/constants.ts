/**
 * Integration test timing constants
 *
 * These values can be tuned based on environment performance
 */

/**
 * Caddy Admin API URL (docker-compose port 46019 -> internal 2019)
 */
export const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:46019";

/**
 * Caddy HTTP URL (docker-compose port 46080 -> internal 80)
 */
export const CADDY_HTTP_URL = process.env.CADDY_HTTP_URL ?? "http://127.0.0.1:46080";

/**
 * Caddy HTTPS URL (docker-compose port 46443 -> internal 443)
 */
export const CADDY_HTTPS_URL = process.env.CADDY_HTTPS_URL ?? "https://127.0.0.1:46443";

/**
 * Caddy HTTP port (for httpRequest calls)
 */
export const CADDY_HTTP_PORT = parseInt(process.env.CADDY_HTTP_PORT ?? "46080", 10);

/**
 * Caddy HTTPS port (for https requests)
 */
export const CADDY_HTTPS_PORT = parseInt(process.env.CADDY_HTTPS_PORT ?? "46443", 10);

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
