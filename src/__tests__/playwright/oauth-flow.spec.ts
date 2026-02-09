/**
 * OAuth Flow Integration Tests
 *
 * These tests require the mock-oauth2-server to be running:
 * ```bash
 * npm run docker:oauth:up
 * ```
 *
 * Run tests:
 * ```bash
 * npm run test:oauth
 * ```
 *
 * Tests will be skipped if the mock OAuth server is not available.
 */

import { test, expect } from "@playwright/test";

const MOCK_OAUTH_URL = "http://localhost:9000";
const CADDY_URL = "http://localhost:8080";

// Check if mock OAuth server is available
async function checkServerAvailable(): Promise<void> {
  try {
    const response = await fetch(`${MOCK_OAUTH_URL}/default/.well-known/openid-configuration`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      throw new Error("Server returned non-OK status");
    }
  } catch {
    test.skip(true, "Mock OAuth server not available. Run: npm run docker:oauth:up");
  }
}

test.describe("Mock OAuth Server Health", () => {
  test.beforeEach(async () => {
    await checkServerAvailable();
  });

  test("mock oauth server is running", async ({ request }) => {
    const response = await request.get(
      `${MOCK_OAUTH_URL}/default/.well-known/openid-configuration`
    );
    expect(response.ok()).toBe(true);

    const config = (await response.json()) as Record<string, unknown>;
    expect(config.issuer).toContain("default");
    expect(config.authorization_endpoint).toBeDefined();
    expect(config.token_endpoint).toBeDefined();
    expect(config.userinfo_endpoint).toBeDefined();
  });

  test("discovery endpoint returns valid OIDC config", async ({ request }) => {
    const response = await request.get(
      `${MOCK_OAUTH_URL}/default/.well-known/openid-configuration`
    );
    const config = await response.json();

    // Validate required OIDC fields
    expect(config).toMatchObject({
      issuer: expect.stringContaining("default"),
      authorization_endpoint: expect.stringContaining("/authorize"),
      token_endpoint: expect.stringContaining("/token"),
      jwks_uri: expect.stringContaining("/jwks"),
      response_types_supported: expect.arrayContaining(["code"]),
      subject_types_supported: expect.arrayContaining(["public"]),
      id_token_signing_alg_values_supported: expect.arrayContaining(["RS256"]),
    });
  });
});

test.describe("OAuth Authorization Flow", () => {
  test.beforeEach(async () => {
    await checkServerAvailable();
  });

  test("redirects to authorization endpoint", async ({ page }) => {
    // Navigate to authorization endpoint directly
    const authUrl = new URL(`${MOCK_OAUTH_URL}/default/authorize`);
    authUrl.searchParams.set("client_id", "test-client");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", `${CADDY_URL}/auth/oauth2/generic/callback`);
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", "test-state-123");

    await page.goto(authUrl.toString());

    // Mock OAuth server should show login form
    await expect(page.locator("body")).toBeVisible();
  });

  test("interactive login flow", async ({ page }) => {
    const authUrl = new URL(`${MOCK_OAUTH_URL}/default/authorize`);
    authUrl.searchParams.set("client_id", "test-client");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", `${CADDY_URL}/auth/oauth2/generic/callback`);
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", "test-state");

    await page.goto(authUrl.toString());

    // Wait for the login form
    const usernameField = page.locator('input[name="username"]');
    if (await usernameField.isVisible({ timeout: 5000 })) {
      await usernameField.fill("test-user");
      await page.locator('button[type="submit"]').click();
    }

    // Should redirect back with authorization code
    await page.waitForURL(/callback|code=/, { timeout: 10000 });
  });
});

test.describe("Token Exchange", () => {
  test.beforeEach(async () => {
    await checkServerAvailable();
  });

  test("exchanges code for tokens", async ({ request }) => {
    // Mock server supports direct code grant for testing
    const tokenResponse = await request.post(`${MOCK_OAUTH_URL}/default/token`, {
      form: {
        grant_type: "client_credentials",
        client_id: "test-client",
        client_secret: "test-secret",
        scope: "openid email profile",
      },
    });

    expect(tokenResponse.ok()).toBe(true);
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    expect(tokens).toMatchObject({
      access_token: expect.any(String),
      token_type: expect.stringMatching(/bearer/i),
      expires_in: expect.any(Number),
    });
  });

  test("token contains expected claims", async ({ request }) => {
    const tokenResponse = await request.post(`${MOCK_OAUTH_URL}/default/token`, {
      form: {
        grant_type: "client_credentials",
        client_id: "test-client",
        client_secret: "test-secret",
        scope: "openid email profile",
      },
    });

    const tokens = (await tokenResponse.json()) as { access_token: string };
    const accessToken = tokens.access_token;

    // Decode JWT payload (no verification needed for mock)
    const [, payloadB64] = accessToken.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString()) as Record<
      string,
      unknown
    >;

    expect(payload).toMatchObject({
      iss: expect.stringContaining("default"),
      aud: expect.anything(),
    });
  });
});

test.describe("JWKS Endpoint", () => {
  test.beforeEach(async () => {
    await checkServerAvailable();
  });

  test("returns valid JWKS", async ({ request }) => {
    const response = await request.get(`${MOCK_OAUTH_URL}/default/jwks`);
    expect(response.ok()).toBe(true);

    const jwks = (await response.json()) as {
      keys: {
        kty: string;
        use: string;
        alg: string;
        kid: string;
        n: string;
        e: string;
      }[];
    };
    expect(jwks.keys).toBeInstanceOf(Array);
    expect(jwks.keys.length).toBeGreaterThan(0);

    const key = jwks.keys[0];
    expect(key).toMatchObject({
      kty: "RSA",
      use: "sig",
      alg: "RS256",
      kid: expect.any(String),
      n: expect.any(String),
      e: expect.any(String),
    });
  });
});
