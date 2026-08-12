/**
 * Diffs every KnownCaddyHandlerSchema member's Zod field set against the
 * generated caddy-handler.json's properties for that handler -- catches a
 * field that exists at runtime but was never wired into the discriminated
 * union member the editor schema is generated from (the inverse of
 * schema-strictness-audit.test.ts, which only catches over-permissive fields).
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
          `generated editor JSON schema: ${missing.join(", ")}. Re-run ` +
          `\`npm run generate:json-schemas\`, or add the field to the handler schema itself.`
      ).toEqual([]);
    });
  }
});
