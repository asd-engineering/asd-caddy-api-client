/**
 * Verifies every field on every KnownCaddyHandlerSchema member actually
 * reaches the generated editor JSON schema (src/generated/schemas/
 * caddy-handler.json) -- the direction schema-strictness-audit.test.ts
 * doesn't cover (it only catches a field becoming too PERMISSIVE, not a
 * field going MISSING).
 *
 * Born from a real bug (0.9.0's xhigh review): `queryOpsSchema`'s shape was
 * corrected from map-based to array-based, and a regression test confirmed
 * the *runtime* schema rejected the old shape -- but `RewriteHandlerSchema`
 * never actually declared a `query` field at all, so the fix had zero
 * effect on the generated editor schema (`additionalProperties: false`
 * rejected `query` outright, on a real, `caddy validate`-verified config).
 * The bug wasn't "wrong shape", it was "field never wired into the
 * discriminated union member the editor schema is built from" -- this test
 * catches that class directly by diffing Zod shape keys against the
 * generated JSON schema's properties for every handler.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { KnownCaddyHandlerSchema } from "../schemas.js";
import { z } from "zod";

const schemaPath = join(__dirname, "../generated/schemas/caddy-handler.json");
const generated = JSON.parse(readFileSync(schemaPath, "utf-8"));
const branches: { properties?: Record<string, unknown> }[] =
  generated.definitions["caddy-handler"].anyOf;

function discriminatorValue(branch: { properties?: Record<string, unknown> }): string | undefined {
  const handlerProp = branch.properties?.handler as { const?: string } | undefined;
  return handlerProp?.const;
}

const generatedByHandler = new Map<string, Set<string>>(
  branches.map((branch) => [
    discriminatorValue(branch) ?? "",
    new Set(Object.keys(branch.properties ?? {})),
  ])
);

describe("every KnownCaddyHandlerSchema field reaches the generated editor JSON schema", () => {
  for (const member of KnownCaddyHandlerSchema.options) {
    const shape = (member as z.ZodObject<z.ZodRawShape>).shape;
    const handlerField = shape.handler;
    const discriminator =
      handlerField instanceof z.ZodLiteral ? (handlerField.value as string) : undefined;

    test.skipIf(!discriminator)(`handler:${discriminator}`, () => {
      const generatedKeys = generatedByHandler.get(discriminator!);
      expect(
        generatedKeys,
        `No branch for handler:${discriminator} found in caddy-handler.json's anyOf -- ` +
          `the generated schema and KnownCaddyHandlerSchema have drifted out of sync entirely.`
      ).toBeDefined();

      const zodKeys = Object.keys(shape).filter((k) => k !== "@id"); // @id is injected post-hoc, not a Zod field
      const missing = zodKeys.filter((k) => !generatedKeys!.has(k));

      expect(
        missing,
        `handler:${discriminator} has field(s) in its Zod schema that never reached the ` +
          `generated editor JSON schema: ${missing.join(", ")}. This is the exact bug class ` +
          `that made the queryOps fix invisible in the editor -- the runtime shape was ` +
          `correct but the field was never declared at all, so additionalProperties:false ` +
          `rejected it outright. Re-run \`npm run generate:json-schemas\` after adding the ` +
          `field, or check whether it needs to be added to the handler schema itself.`
      ).toEqual([]);
    });
  }
});
