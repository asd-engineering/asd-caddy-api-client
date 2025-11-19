/**
 * Authentication utilities for Caddy
 * Provides bcrypt password hashing for HTTP Basic Auth
 */

// Type definition for bcrypt module (optional dependency)
interface BcryptModule {
  hash(password: string, rounds: number): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
}

/**
 * Hash a password using bcrypt
 * This uses Node.js crypto module to generate bcrypt hashes
 * compatible with Caddy's basic_auth handler.
 *
 * @param password - Plain text password
 * @param rounds - Bcrypt cost factor (default: 10, range: 4-31)
 * @returns Promise resolving to bcrypt hash string
 *
 * @example
 * const hash = await hashPassword("my-secret-password");
 * // Returns: $2a$10$... (bcrypt hash)
 */
export async function hashPassword(password: string, rounds = 10): Promise<string> {
  // Import bcrypt dynamically to avoid bundling if not used
  try {
    // Try to use bcrypt if available
    // Using dynamic import with variable to avoid TypeScript compile-time resolution
    const moduleName = "bcrypt";
    const bcrypt = (await import(moduleName)) as unknown as BcryptModule;
    return await bcrypt.hash(password, rounds);
  } catch {
    throw new Error("bcrypt module not found. Install it with: npm install bcrypt @types/bcrypt");
  }
}

/**
 * Verify a password against a bcrypt hash
 * Useful for testing authentication configurations
 *
 * @param password - Plain text password
 * @param hash - Bcrypt hash to verify against
 * @returns Promise resolving to true if password matches
 *
 * @example
 * const isValid = await verifyPassword("my-password", hash);
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const moduleName = "bcrypt";
    const bcrypt = (await import(moduleName)) as unknown as BcryptModule;
    return await bcrypt.compare(password, hash);
  } catch {
    throw new Error("bcrypt module not found. Install it with: npm install bcrypt @types/bcrypt");
  }
}

/**
 * Generate a bcrypt hash synchronously using Caddy's caddy hash-password command
 * This is useful for generating hashes without the bcrypt npm module
 *
 * @param password - Plain text password
 * @returns Promise resolving to bcrypt hash or instructions
 *
 * @example
 * const hash = await hashPasswordWithCaddy("my-password");
 */
export async function hashPasswordWithCaddy(password: string): Promise<string> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("caddy", ["hash-password", "--plaintext", password]);
    return stdout.trim();
  } catch {
    throw new Error(
      `Failed to hash password with Caddy CLI. Is Caddy installed?\n` +
        `Alternative: Use hashPassword() with npm install bcrypt\n` +
        `Or manually run: caddy hash-password --plaintext "${password}"`
    );
  }
}

/**
 * Create basic auth account configuration for Caddy
 *
 * @param username - Username for authentication
 * @param password - Plain text password (will be hashed with bcrypt)
 * @param options - Optional configuration
 * @returns Promise resolving to account object with hashed password
 *
 * @example
 * const account = await createBasicAuthAccount("admin", "secret123");
 * // Returns: { username: "admin", password: "$2a$10$..." }
 */
export async function createBasicAuthAccount(
  username: string,
  password: string,
  options?: {
    rounds?: number;
    useCaddyCLI?: boolean;
  }
): Promise<{ username: string; password: string }> {
  const passwordHash = options?.useCaddyCLI
    ? await hashPasswordWithCaddy(password)
    : await hashPassword(password, options?.rounds);

  return {
    username,
    password: passwordHash,
  };
}

/**
 * Create multiple basic auth accounts at once
 *
 * @param users - Array of {username, password} pairs
 * @param options - Optional configuration
 * @returns Promise resolving to array of account objects with hashed passwords
 *
 * @example
 * const accounts = await createBasicAuthAccounts([
 *   { username: "admin", password: "admin-pass" },
 *   { username: "user", password: "user-pass" }
 * ]);
 */
export async function createBasicAuthAccounts(
  users: { username: string; password: string }[],
  options?: {
    rounds?: number;
    useCaddyCLI?: boolean;
  }
): Promise<{ username: string; password: string }[]> {
  return Promise.all(
    users.map((user) => createBasicAuthAccount(user.username, user.password, options))
  );
}
