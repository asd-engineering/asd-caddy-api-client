/**
 * Tests for validation utilities
 */
import { describe, test, expect } from "vitest";
import { z } from "zod";
import { validateOrThrow } from "../utils/validation.js";
import { ValidationError } from "../errors.js";

describe("validateOrThrow", () => {
  const TestSchema = z.object({
    name: z.string().min(1),
    age: z.number().positive(),
  });

  test("returns valid data unchanged", () => {
    const input = { name: "John", age: 30 };
    const result = validateOrThrow(TestSchema, input);
    expect(result).toEqual(input);
  });

  test("applies schema defaults", () => {
    const SchemaWithDefaults = z.object({
      name: z.string().min(1),
      active: z.boolean().optional().default(true),
    });

    const result = validateOrThrow(SchemaWithDefaults, { name: "Test" });
    expect(result.name).toBe("Test");
    expect(result.active).toBe(true);
  });

  test("throws ValidationError for invalid data", () => {
    expect(() => validateOrThrow(TestSchema, { name: "", age: -1 })).toThrow(ValidationError);
  });

  test("includes context in error message", () => {
    try {
      validateOrThrow(TestSchema, { name: "" }, "user input");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("user input");
    }
  });

  test("preserves Zod error details in errors array", () => {
    try {
      validateOrThrow(TestSchema, { name: "", age: "not a number" });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.errors).toBeDefined();
      expect(Array.isArray(validationError.errors)).toBe(true);
      expect(validationError.errors!.length).toBeGreaterThan(0);
    }
  });

  test("handles single field error", () => {
    try {
      validateOrThrow(z.string().email(), "not-an-email", "email field");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("email field");
      expect((error as ValidationError).message).toContain("Invalid email");
    }
  });

  test("handles nested object validation", () => {
    const NestedSchema = z.object({
      user: z.object({
        profile: z.object({
          name: z.string().min(1),
        }),
      }),
    });

    try {
      validateOrThrow(NestedSchema, { user: { profile: { name: "" } } });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("user.profile.name");
    }
  });

  test("passes through non-Zod errors", () => {
    const BrokenSchema = z.string().transform(() => {
      throw new Error("Custom error");
    });

    expect(() => validateOrThrow(BrokenSchema, "test")).toThrow("Custom error");
  });

  test("works with union schemas", () => {
    const UnionSchema = z.union([z.string(), z.number()]);

    expect(validateOrThrow(UnionSchema, "hello")).toBe("hello");
    expect(validateOrThrow(UnionSchema, 42)).toBe(42);
    expect(() => validateOrThrow(UnionSchema, { invalid: true })).toThrow(ValidationError);
  });

  test("works with enum schemas", () => {
    const EnumSchema = z.enum(["a", "b", "c"]);

    expect(validateOrThrow(EnumSchema, "a")).toBe("a");
    expect(() => validateOrThrow(EnumSchema, "d")).toThrow(ValidationError);
  });
});
