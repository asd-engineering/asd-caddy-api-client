/**
 * Validation utilities for wrapping Zod errors in ValidationError
 *
 * @module utils/validation
 */
import { resolve, normalize, isAbsolute } from "path";
import { ZodError, type ZodType, type ZodTypeDef, type ZodIssue } from "zod";
import { ValidationError } from "../errors.js";

/**
 * Validate a file path to prevent path traversal attacks
 *
 * Detects and blocks paths containing ".." traversal sequences that could
 * be used to access files outside intended directories.
 *
 * @param filePath - The file path to validate
 * @param options - Validation options
 * @param options.baseDir - Optional base directory to resolve relative paths against
 * @param options.requireWithinBase - If true, requires the path to be within baseDir (default: false)
 * @returns The resolved, normalized absolute path
 * @throws {ValidationError} If path contains traversal sequences
 *
 * @example
 * ```typescript
 * // Valid paths
 * validateFilePath("./config.json");           // OK - relative path
 * validateFilePath("/etc/caddy/config.json");  // OK - absolute path
 * validateFilePath("config/app.json");         // OK - relative path
 *
 * // Invalid paths (throws ValidationError)
 * validateFilePath("../../../etc/passwd");     // Throws! - traversal attempt
 * validateFilePath("config/../../../etc/passwd"); // Throws! - hidden traversal
 * ```
 */
export function validateFilePath(
  filePath: string,
  options?: { baseDir?: string; requireWithinBase?: boolean }
): string {
  const { baseDir, requireWithinBase = false } = options ?? {};

  // Check for path traversal sequences BEFORE normalization
  // This catches attempts like "foo/../../../etc/passwd"
  if (filePath.includes("..")) {
    throw new ValidationError(`Path traversal detected: "${filePath}" contains ".." segments`, [
      {
        code: "custom",
        path: ["filePath"],
        message: 'Path must not contain ".." traversal segments',
      },
    ]);
  }

  // Normalize and resolve the path
  const normalizedPath = normalize(filePath);
  const resolvedPath = isAbsolute(normalizedPath)
    ? normalizedPath
    : resolve(baseDir ?? process.cwd(), normalizedPath);

  // If strict mode is enabled, ensure path is within base directory
  if (requireWithinBase && baseDir) {
    const resolvedBase = resolve(baseDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new ValidationError(
        `Path "${filePath}" resolves outside allowed directory "${baseDir}"`,
        [
          {
            code: "custom",
            path: ["filePath"],
            message: "Path must be within the allowed directory",
          },
        ]
      );
    }
  }

  return resolvedPath;
}

/**
 * Validate data against a Zod schema, wrapping errors in ValidationError
 *
 * This helper ensures consistent error handling across the library by converting
 * raw ZodError instances into ValidationError with proper context.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param context - Optional context string to include in error message (e.g., "adapt options")
 * @returns The validated and typed data (output type of the schema)
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * import { validateOrThrow } from "./utils/validation.js";
 * import { CaddyAdapterSchema } from "./schemas.js";
 *
 * // With context for better error messages
 * const adapter = validateOrThrow(
 *   CaddyAdapterSchema,
 *   userInput,
 *   "adapter parameter"
 * );
 * // Throws: ValidationError: adapter parameter: Invalid enum value...
 *
 * // Without context
 * const adapter = validateOrThrow(CaddyAdapterSchema, userInput);
 * // Throws: ValidationError: Invalid enum value...
 * ```
 */
export function validateOrThrow<Output, Def extends ZodTypeDef, Input>(
  schema: ZodType<Output, Def, Input>,
  data: unknown,
  context?: string
): Output {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = context ? `${context}: ${formatZodError(error)}` : formatZodError(error);

      throw new ValidationError(message, error.errors);
    }
    throw error;
  }
}

/**
 * Format a ZodError into a human-readable message
 *
 * @param error - The ZodError to format
 * @returns Formatted error message
 */
function formatZodError(error: ZodError): string {
  // If there's only one issue, use its message directly
  if (error.issues.length === 1) {
    const issue = error.issues[0];
    return formatIssue(issue);
  }

  // Multiple issues: list them
  return error.issues.map((issue, i) => `${i + 1}. ${formatIssue(issue)}`).join("; ");
}

/**
 * Format a single Zod issue
 */
function formatIssue(issue: ZodIssue): string {
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}
