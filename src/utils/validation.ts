/**
 * Validation utilities for wrapping Zod errors in ValidationError
 *
 * @module utils/validation
 */
import { ZodError, type ZodType, type ZodTypeDef, type ZodIssue } from "zod";
import { ValidationError } from "../errors.js";

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
