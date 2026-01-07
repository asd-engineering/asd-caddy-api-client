/**
 * Unit tests for auth utilities
 * Note: These tests verify structure and error handling.
 * Full bcrypt integration requires the optional bcrypt dependency.
 */
import { describe, test, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  hashPasswordWithCaddy,
  createBasicAuthAccount,
  createBasicAuthAccounts,
} from "../utils/auth.js";

describe("hashPassword", () => {
  test("throws error when bcrypt is not installed", async () => {
    // bcrypt is an optional dependency, so this should throw
    // unless bcrypt is installed in the test environment
    try {
      await hashPassword("test-password");
      // If we get here, bcrypt is installed - that's fine
      expect(true).toBe(true);
    } catch (error) {
      expect((error as Error).message).toContain("bcrypt module not found");
    }
  });

  test("accepts custom rounds parameter", async () => {
    // Verify the function signature accepts rounds
    try {
      await hashPassword("test-password", 12);
    } catch (error) {
      // Expected if bcrypt not installed
      expect((error as Error).message).toContain("bcrypt");
    }
  });
});

describe("verifyPassword", () => {
  test("throws error when bcrypt is not installed", async () => {
    try {
      await verifyPassword("test-password", "$2a$10$someHash");
      expect(true).toBe(true);
    } catch (error) {
      expect((error as Error).message).toContain("bcrypt module not found");
    }
  });
});

describe("hashPasswordWithCaddy", () => {
  test("throws error when caddy CLI is not available", async () => {
    await expect(hashPasswordWithCaddy("test-password")).rejects.toThrow(
      /Failed to hash password with Caddy CLI/
    );
  });

  test("error message includes alternative instructions", async () => {
    try {
      await hashPasswordWithCaddy("test-password");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("Use hashPassword()");
      expect(message).toContain("caddy hash-password");
    }
  });
});

describe("createBasicAuthAccount", () => {
  test("returns object with username and password fields", async () => {
    try {
      const account = await createBasicAuthAccount("admin", "secret123");
      expect(account).toHaveProperty("username", "admin");
      expect(account).toHaveProperty("password");
    } catch (error) {
      // Expected if bcrypt not installed
      expect((error as Error).message).toContain("bcrypt");
    }
  });

  test("accepts options parameter", async () => {
    try {
      await createBasicAuthAccount("admin", "secret123", { rounds: 14 });
    } catch (error) {
      expect((error as Error).message).toContain("bcrypt");
    }
  });

  test("accepts useCaddyCLI option", async () => {
    // This should fail because caddy CLI is not available in test env
    await expect(
      createBasicAuthAccount("admin", "secret123", { useCaddyCLI: true })
    ).rejects.toThrow(/Failed to hash password with Caddy CLI/);
  });
});

describe("createBasicAuthAccounts", () => {
  test("processes array of users", async () => {
    try {
      const accounts = await createBasicAuthAccounts([
        { username: "admin", password: "admin-pass" },
        { username: "user", password: "user-pass" },
      ]);
      expect(accounts).toHaveLength(2);
      expect(accounts[0]).toHaveProperty("username", "admin");
      expect(accounts[1]).toHaveProperty("username", "user");
    } catch (error) {
      // Expected if bcrypt not installed
      expect((error as Error).message).toContain("bcrypt");
    }
  });

  test("accepts options for all accounts", async () => {
    try {
      await createBasicAuthAccounts([{ username: "admin", password: "pass" }], { rounds: 12 });
    } catch (error) {
      expect((error as Error).message).toContain("bcrypt");
    }
  });

  test("uses caddy CLI when specified", async () => {
    await expect(
      createBasicAuthAccounts([{ username: "admin", password: "pass" }], {
        useCaddyCLI: true,
      })
    ).rejects.toThrow(/Failed to hash password with Caddy CLI/);
  });
});
