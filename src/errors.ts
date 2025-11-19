/**
 * Custom error classes for Caddy API client
 */

/**
 * Base error class for all Caddy API client errors
 */
export class CaddyApiClientError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CaddyApiClientError";
    Object.setPrototypeOf(this, CaddyApiClientError.prototype);
  }
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends CaddyApiClientError {
  constructor(
    message: string,
    public readonly errors?: unknown[]
  ) {
    super(message, { errors });
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when Caddy API returns an error response
 */
export class CaddyApiError extends CaddyApiClientError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string
  ) {
    super(message, { statusCode, responseBody });
    this.name = "CaddyApiError";
    Object.setPrototypeOf(this, CaddyApiError.prototype);
  }
}

/**
 * Error thrown when network request fails
 */
export class NetworkError extends CaddyApiClientError {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message, { cause: cause?.message });
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Error thrown when request times out
 */
export class TimeoutError extends CaddyApiClientError {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message, { timeoutMs });
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Error thrown when domain is not found
 */
export class DomainNotFoundError extends CaddyApiClientError {
  constructor(public readonly domain: string) {
    super(`Domain not found: ${domain}`, { domain });
    this.name = "DomainNotFoundError";
    Object.setPrototypeOf(this, DomainNotFoundError.prototype);
  }
}

/**
 * Error thrown when domain already exists
 */
export class DomainAlreadyExistsError extends CaddyApiClientError {
  constructor(public readonly domain: string) {
    super(`Domain already exists: ${domain}`, { domain });
    this.name = "DomainAlreadyExistsError";
    Object.setPrototypeOf(this, DomainAlreadyExistsError.prototype);
  }
}

/**
 * Error thrown when MITMproxy is not installed
 */
export class MitmproxyNotInstalledError extends CaddyApiClientError {
  constructor(message = "MITMproxy is not installed") {
    super(message);
    this.name = "MitmproxyNotInstalledError";
    Object.setPrototypeOf(this, MitmproxyNotInstalledError.prototype);
  }
}

/**
 * Error thrown when MITMproxy fails to start
 */
export class MitmproxyStartError extends CaddyApiClientError {
  constructor(
    message: string,
    public readonly exitCode?: number
  ) {
    super(message, { exitCode });
    this.name = "MitmproxyStartError";
    Object.setPrototypeOf(this, MitmproxyStartError.prototype);
  }
}
