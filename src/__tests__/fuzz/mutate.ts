/**
 * Pure mutation strategies for the differential fuzz-testing harness (0.10
 * priority 6). Each strategy takes a known-valid seed object and a target
 * top-level key, and returns a mutated shallow copy -- never mutates the
 * seed itself, so the same seed can be reused across many mutations.
 */

export type MutationStrategy = "typo-field" | "add-unknown-key" | "wrong-type" | "remove-required";

export interface Mutation {
  strategy: MutationStrategy;
  /** The field the mutation targets (for reporting; the value itself carries the actual change). */
  field: string;
  value: Record<string, unknown>;
}

/** Renames a key by dropping its last character (e.g. "upstreams" -> "upstream"). */
export function typoField(seed: Record<string, unknown>, field: string): Record<string, unknown> {
  const { [field]: value, ...rest } = seed;
  const typoKey = field.length > 1 ? field.slice(0, -1) : `${field}x`;
  return { ...rest, [typoKey]: value };
}

/** Adds a field no schema declares. */
export function addUnknownKey(seed: Record<string, unknown>): Record<string, unknown> {
  return { ...seed, __totally_unknown_field__: "unexpected" };
}

/** Replaces a field's value with a value of a different JSON type. */
export function wrongType(seed: Record<string, unknown>, field: string): Record<string, unknown> {
  const current = seed[field];
  let replacement: unknown;
  if (Array.isArray(current)) {
    replacement = "not-an-array";
  } else if (typeof current === "string") {
    replacement = 12345;
  } else if (typeof current === "number") {
    replacement = "not-a-number";
  } else if (typeof current === "boolean") {
    replacement = "not-a-boolean";
  } else if (typeof current === "object" && current !== null) {
    replacement = "not-an-object";
  } else {
    replacement = { unexpected: "object" };
  }
  return { ...seed, [field]: replacement };
}

/** Deletes a field entirely. */
export function removeField(seed: Record<string, unknown>, field: string): Record<string, unknown> {
  const { [field]: _omit, ...rest } = seed;
  return rest;
}

/**
 * Generates every mutation to try for a seed: a typo + wrong-type mutation
 * for each of `mutableFields` (fields present in the seed worth targeting),
 * a remove-required mutation for each of `requiredFields`, and one
 * add-unknown-key mutation (field-independent).
 */
export function mutationsFor(
  seed: Record<string, unknown>,
  mutableFields: string[],
  requiredFields: string[]
): Mutation[] {
  const mutations: Mutation[] = [];

  for (const field of mutableFields) {
    if (!(field in seed)) continue;
    mutations.push({ strategy: "typo-field", field, value: typoField(seed, field) });
    mutations.push({ strategy: "wrong-type", field, value: wrongType(seed, field) });
  }

  for (const field of requiredFields) {
    mutations.push({ strategy: "remove-required", field, value: removeField(seed, field) });
  }

  mutations.push({ strategy: "add-unknown-key", field: "(n/a)", value: addUnknownKey(seed) });

  return mutations;
}
