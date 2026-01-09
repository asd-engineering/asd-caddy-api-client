/**
 * Unit tests for custom error classes
 */
import { describe, test, expect } from "vitest";
import {
  CaddyApiClientError,
  ValidationError,
  CaddyApiError,
  NetworkError,
  TimeoutError,
  DomainNotFoundError,
  DomainAlreadyExistsError,
  MitmproxyNotInstalledError,
  MitmproxyStartError,
} from "../errors.js";

describe("CaddyApiClientError", () => {
  test("creates error with message", () => {
    const error = new CaddyApiClientError("Test error");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CaddyApiClientError);
    expect(error.name).toBe("CaddyApiClientError");
    expect(error.message).toBe("Test error");
    expect(error.context).toBeUndefined();
  });

  test("creates error with context", () => {
    const context = { foo: "bar", count: 42 };
    const error = new CaddyApiClientError("Test error", context);
    expect(error.context).toEqual(context);
  });

  test("maintains prototype chain", () => {
    const error = new CaddyApiClientError("Test error");
    expect(Object.getPrototypeOf(error)).toBe(CaddyApiClientError.prototype);
  });
});

describe("ValidationError", () => {
  test("creates error with validation errors", () => {
    const errors = [{ field: "domain", message: "Invalid format" }];
    const error = new ValidationError("Validation failed", errors);
    expect(error).toBeInstanceOf(CaddyApiClientError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe("ValidationError");
    expect(error.message).toBe("Validation failed");
    expect(error.errors).toEqual(errors);
    expect(error.context?.errors).toEqual(errors);
  });

  test("creates error without validation errors", () => {
    const error = new ValidationError("Validation failed");
    expect(error.errors).toBeUndefined();
  });
});

describe("CaddyApiError", () => {
  test("creates error with status code", () => {
    const error = new CaddyApiError("Request failed", 500);
    expect(error).toBeInstanceOf(CaddyApiClientError);
    expect(error).toBeInstanceOf(CaddyApiError);
    expect(error.name).toBe("CaddyApiError");
    expect(error.message).toBe("Request failed");
    expect(error.statusCode).toBe(500);
    expect(error.responseBody).toBeUndefined();
    expect(error.context?.statusCode).toBe(500);
  });

  test("creates error with response body", () => {
    const body = '{"error": "Internal server error"}';
    const error = new CaddyApiError("Request failed", 500, body);
    expect(error.statusCode).toBe(500);
    expect(error.responseBody).toBe(body);
    expect(error.context?.responseBody).toBe(body);
  });

  test("handles different status codes", () => {
    expect(new CaddyApiError("Not found", 404).statusCode).toBe(404);
    expect(new CaddyApiError("Forbidden", 403).statusCode).toBe(403);
    expect(new CaddyApiError("Bad request", 400).statusCode).toBe(400);
  });

  test("includes URL in error", () => {
    const error = new CaddyApiError(
      "Request failed",
      500,
      "Error body",
      "http://127.0.0.1:2019/config/"
    );
    expect(error.url).toBe("http://127.0.0.1:2019/config/");
    expect(error.context?.url).toBe("http://127.0.0.1:2019/config/");
  });

  test("includes method in error", () => {
    const error = new CaddyApiError(
      "Request failed",
      500,
      "Error body",
      "http://127.0.0.1:2019/config/",
      "POST"
    );
    expect(error.method).toBe("POST");
    expect(error.context?.method).toBe("POST");
  });

  test("includes full request context", () => {
    const error = new CaddyApiError(
      "POST http://127.0.0.1:2019/load - 400 Bad Request",
      400,
      '{"error":"invalid config"}',
      "http://127.0.0.1:2019/load",
      "POST"
    );
    expect(error.statusCode).toBe(400);
    expect(error.url).toBe("http://127.0.0.1:2019/load");
    expect(error.method).toBe("POST");
    expect(error.responseBody).toBe('{"error":"invalid config"}');
  });
});

describe("NetworkError", () => {
  test("creates error with cause", () => {
    const cause = new Error("Connection refused");
    const error = new NetworkError("Network failed", cause);
    expect(error).toBeInstanceOf(CaddyApiClientError);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.name).toBe("NetworkError");
    expect(error.message).toBe("Network failed");
    expect(error.cause).toBe(cause);
    expect(error.context?.cause).toBe("Connection refused");
  });

  test("creates error without cause", () => {
    const error = new NetworkError("Network failed");
    expect(error.cause).toBeUndefined();
  });
});

describe("TimeoutError", () => {
  test("creates error with timeout value", () => {
    const error = new TimeoutError("Request timed out", 5000);
    expect(error).toBeInstanceOf(CaddyApiClientError);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.name).toBe("TimeoutError");
    expect(error.message).toBe("Request timed out");
    expect(error.timeoutMs).toBe(5000);
    expect(error.context?.timeoutMs).toBe(5000);
  });

  test("handles different timeout values", () => {
    expect(new TimeoutError("Timeout", 1000).timeoutMs).toBe(1000);
    expect(new TimeoutError("Timeout", 30000).timeoutMs).toBe(30000);
  });
});

describe("DomainNotFoundError", () => {
  test("creates error with domain", () => {
    const error = new DomainNotFoundError("example.com");
    expect(error).toBeInstanceOf(CaddyApiClientError);
    expect(error).toBeInstanceOf(DomainNotFoundError);
    expect(error.name).toBe("DomainNotFoundError");
    expect(error.message).toBe("Domain not found: example.com");
    expect(error.domain).toBe("example.com");
    expect(error.context?.domain).toBe("example.com");
  });
});

describe("DomainAlreadyExistsError", () => {
  test("creates error with domain", () => {
    const error = new DomainAlreadyExistsError("example.com");
    expect(error).toBeInstanceOf(CaddyApiClientError);
    expect(error).toBeInstanceOf(DomainAlreadyExistsError);
    expect(error.name).toBe("DomainAlreadyExistsError");
    expect(error.message).toBe("Domain already exists: example.com");
    expect(error.domain).toBe("example.com");
    expect(error.context?.domain).toBe("example.com");
  });
});

describe("MitmproxyNotInstalledError", () => {
  test("creates error with default message", () => {
    const error = new MitmproxyNotInstalledError();
    expect(error).toBeInstanceOf(CaddyApiClientError);
    expect(error).toBeInstanceOf(MitmproxyNotInstalledError);
    expect(error.name).toBe("MitmproxyNotInstalledError");
    expect(error.message).toBe("MITMproxy is not installed");
  });

  test("creates error with custom message", () => {
    const error = new MitmproxyNotInstalledError("Custom install message");
    expect(error.message).toBe("Custom install message");
  });
});

describe("MitmproxyStartError", () => {
  test("creates error with exit code", () => {
    const error = new MitmproxyStartError("Failed to start", 1);
    expect(error).toBeInstanceOf(CaddyApiClientError);
    expect(error).toBeInstanceOf(MitmproxyStartError);
    expect(error.name).toBe("MitmproxyStartError");
    expect(error.message).toBe("Failed to start");
    expect(error.exitCode).toBe(1);
    expect(error.context?.exitCode).toBe(1);
  });

  test("creates error without exit code", () => {
    const error = new MitmproxyStartError("Failed to start");
    expect(error.exitCode).toBeUndefined();
  });
});

describe("Error serialization", () => {
  test("errors can be serialized to JSON", () => {
    const error = new CaddyApiError("Request failed", 500, "Error body");
    const serialized = JSON.stringify({
      name: error.name,
      message: error.message,
      context: error.context,
    });

    expect(serialized).toContain("CaddyApiError");
    expect(serialized).toContain("Request failed");
    expect(serialized).toContain("500");
  });

  test("errors maintain stack trace", () => {
    const error = new CaddyApiClientError("Test error");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("CaddyApiClientError");
  });
});
