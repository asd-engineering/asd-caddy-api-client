/**
 * Error handling patterns for @accelerated-software-development/caddy-api-client
 *
 * This example demonstrates:
 * 1. Distinguishing between error types
 * 2. Retry patterns for network errors
 * 3. Idempotent vs non-idempotent operations
 */
import type { CaddyRoute } from "@accelerated-software-development/caddy-api-client";
import {
  CaddyClient,
  buildServiceRoutes,
  addDomainWithAutoTls,
  ValidationError,
  CaddyApiError,
  NetworkError,
  TimeoutError,
  DomainAlreadyExistsError,
} from "@accelerated-software-development/caddy-api-client";

// ============================================================================
// Example 1: Distinguishing Error Types
// ============================================================================

async function handleErrorTypes() {
  const client = new CaddyClient();

  try {
    await client.addRoute("https_server", {
      match: [{ host: ["api.example.com"] }],
      handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "localhost:3000" }] }],
    });
    console.log("✅ Route added successfully");
  } catch (error) {
    if (error instanceof ValidationError) {
      // Client-side validation failed before sending to Caddy
      console.error("❌ Invalid configuration:", error.message);
      console.error("   Validation errors:", error.errors);
      // Fix the configuration and retry
    } else if (error instanceof CaddyApiError) {
      // Caddy rejected the request
      console.error(`❌ Caddy API error (${error.statusCode}):`, error.message);
      console.error("   Response:", error.responseBody);
      console.error("   Request: ", error.method, error.url);

      if (error.statusCode === 400) {
        // Bad request - configuration is invalid per Caddy
        console.error("   Hint: Check Caddy logs for details");
      } else if (error.statusCode === 404) {
        // Server not found - might need to create it first
        console.error("   Hint: Server may not exist");
      }
    } else if (error instanceof NetworkError) {
      // Connection to Caddy failed
      console.error("❌ Cannot connect to Caddy:", error.message);
      console.error("   Is Caddy running? Check admin API at", client);
    } else if (error instanceof TimeoutError) {
      // Request timed out
      console.error(`❌ Request timed out after ${error.timeoutMs}ms`);
      console.error("   Consider increasing client timeout");
    } else {
      // Unknown error
      throw error;
    }
  }
}

// ============================================================================
// Example 2: Retry Pattern for Network Errors
// ============================================================================

async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; backoff?: boolean } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = true } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Only retry on network/timeout errors
      if (error instanceof NetworkError || error instanceof TimeoutError) {
        if (attempt === maxRetries) {
          console.error(`❌ All ${maxRetries} attempts failed`);
          throw error;
        }

        const delay = backoff ? delayMs * attempt : delayMs;
        console.log(`⚠️  Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Don't retry validation or API errors - they won't succeed
        throw error;
      }
    }
  }

  throw new Error("Unexpected: retry loop completed without returning");
}

async function demonstrateRetry() {
  const client = new CaddyClient({ timeout: 2000 });

  const routes: CaddyRoute[] = await withRetry<CaddyRoute[]>(
    () => client.getRoutes("https_server"),
    { maxRetries: 3, delayMs: 500, backoff: true }
  );

  console.log(`✅ Got ${routes.length} routes (with retry support)`);
}

// ============================================================================
// Example 3: Idempotent vs Non-Idempotent Operations
// ============================================================================

async function demonstrateIdempotency() {
  const client = new CaddyClient();

  // IDEMPOTENT: addRoutes() returns { added, skipped }
  // Safe to call multiple times - existing routes are skipped
  const routes = buildServiceRoutes({
    host: "api.localhost",
    dial: "127.0.0.1:3000",
    serviceId: "my-api",
  });

  // First call
  let result = await client.addRoutes("https_server", routes);
  console.log(`First call: added=${result.added}, skipped=${result.skipped}`);

  // Second call - same routes already exist
  result = await client.addRoutes("https_server", routes);
  console.log(`Second call: added=${result.added}, skipped=${result.skipped}`);
  // Output: added=0, skipped=N (all routes already exist)

  // NON-IDEMPOTENT: addDomainWithAutoTls() throws on duplicates
  // Must handle DomainAlreadyExistsError explicitly
  try {
    await addDomainWithAutoTls({
      domain: "example.com",
      target: "127.0.0.1",
      targetPort: 3000,
    });
    console.log("✅ Domain added");
  } catch (error) {
    if (error instanceof DomainAlreadyExistsError) {
      console.log("ℹ️  Domain already exists, skipping");
      // Could use updateDomain() here if needed
    } else {
      throw error;
    }
  }
}

// ============================================================================
// Example 4: Graceful Degradation
// ============================================================================

async function demonstrateGracefulDegradation(): Promise<{ apps: Record<string, unknown> }> {
  const client = new CaddyClient({ timeout: 1000 });

  // Try to get config, fall back to cached/default if Caddy is unavailable
  try {
    const config = await client.getConfig();
    console.log("✅ Got live config from Caddy");
    return config as { apps: Record<string, unknown> };
  } catch (error) {
    if (error instanceof NetworkError || error instanceof TimeoutError) {
      console.log("⚠️  Caddy unavailable, using cached config");
      return { apps: {} }; // Default/cached config
    }
    throw error;
  }
}

// ============================================================================
// Example 5: Validation Before API Calls
// ============================================================================

function demonstrateEarlyValidation() {
  // Validation happens BEFORE any network call
  // This allows catching errors immediately

  try {
    buildServiceRoutes({
      host: "api.localhost",
      dial: "invalid-dial-address", // Missing port!
      serviceId: "my-api",
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log("✅ Caught validation error before network call:");
      console.log("   ", error.message);
      // No network request was made - fast failure
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("=== Error Handling Examples ===\n");

  console.log("1. Distinguishing Error Types");
  await handleErrorTypes().catch((e) => console.error("  Example error:", e.message));

  console.log("\n2. Retry Pattern");
  await demonstrateRetry().catch((e) => console.error("  Example error:", e.message));

  console.log("\n3. Idempotent vs Non-Idempotent");
  await demonstrateIdempotency().catch((e) => console.error("  Example error:", e.message));

  console.log("\n4. Graceful Degradation");
  await demonstrateGracefulDegradation().catch((e) => console.error("  Example error:", e.message));

  console.log("\n5. Early Validation");
  demonstrateEarlyValidation();
}

main().catch(console.error);
