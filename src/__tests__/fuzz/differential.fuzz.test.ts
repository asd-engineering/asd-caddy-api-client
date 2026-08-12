/**
 * Differential fuzz harness: mutates known-valid matcher/handler/
 * caddy-security configs and asserts Zod, the generated editor JSON schema
 * (via `ajv`), and (for matchers/handlers) real `caddy validate` all agree
 * on whether the mutation is valid. A disagreement means one of our schemas
 * is wrong relative to real Caddy or to each other.
 *
 * Gated behind FUZZ_TEST=true (like src/__tests__/integration/): shells out
 * to `caddy` per mutation (~100-300ms each), not part of the default
 * `bun run test` loop. Run with: `FUZZ_TEST=true npx vitest run src/__tests__/fuzz`.
 */
import { describe, test, expect, beforeAll } from "vitest";
import Ajv from "ajv";
import { readFileSync } from "fs";
import { join } from "path";
import { ALL_SEEDS } from "./seeds.js";
import { mutationsFor } from "./mutate.js";
import { threeWayCheck, type CheckResult } from "./three-way-check.js";

const runFuzz = process.env.FUZZ_TEST === "true";
const describeFuzz = runFuzz ? describe : describe.skip;

const MATCHER_COUNT = ALL_SEEDS.filter((s) => s.name.startsWith("matcher:")).length;
const HANDLER_COUNT = ALL_SEEDS.filter((s) => s.name.startsWith("handler:")).length;
const SECURITY_COUNT = ALL_SEEDS.filter((s) => s.name.startsWith("security:")).length;

const schemasDir = join(__dirname, "../../generated/schemas");
const ajv = new Ajv({ strict: false, allErrors: true });
const compiledCache = new Map<string, ReturnType<Ajv["compile"]>>();

function compileFor(fileName: string): ReturnType<Ajv["compile"]> {
  const cached = compiledCache.get(fileName);
  if (cached) return cached;
  const schema = JSON.parse(readFileSync(join(schemasDir, fileName), "utf-8")) as object;
  const compiled = ajv.compile(schema);
  compiledCache.set(fileName, compiled);
  return compiled;
}

/** All three (or two, for security schemas) legs must agree: either all pass or all fail. */
function verdictsAgree(result: CheckResult): boolean {
  const verdicts = [result.zod, result.ajv, ...(result.caddy !== undefined ? [result.caddy] : [])];
  return verdicts.every((v) => v === verdicts[0]);
}

function describeResult(result: CheckResult): string {
  const parts = [`zod=${result.zod}`, `ajv=${result.ajv}`];
  if (result.caddy !== undefined) parts.push(`caddy=${result.caddy}`);
  if (!result.zod && result.zodError) parts.push(`zodError="${result.zodError}"`);
  if (!result.ajv && result.ajvErrors) parts.push(`ajvErrors="${result.ajvErrors}"`);
  if (result.caddy === false && result.caddyError) parts.push(`caddyError="${result.caddyError}"`);
  return parts.join(", ");
}

let totalChecked = 0;
const checkedByCategory: Record<string, number> = { matcher: 0, handler: 0, security: 0 };

beforeAll(() => {
  if (!runFuzz) {
    console.log("Skipping fuzz suite (set FUZZ_TEST=true to run it).");
  }
});

describeFuzz("differential fuzz: seed baselines are actually valid", () => {
  for (const seed of ALL_SEEDS) {
    test(`${seed.name} baseline passes all validators`, async () => {
      const result = await threeWayCheck({
        zodSchema: seed.zodSchema,
        ajvValidate: compileFor(seed.jsonSchemaFile),
        value: seed.value,
        toCaddyConfig: seed.toCaddyConfig,
      });
      expect(
        result.zod && result.ajv && result.caddy !== false,
        `Seed "${seed.name}" is supposed to be valid but isn't: ${describeResult(result)}`
      ).toBe(true);
    });
  }
});

describeFuzz("differential fuzz: mutations", () => {
  for (const seed of ALL_SEEDS) {
    const category = seed.name.split(":")[0];
    const mutations = mutationsFor(seed.value, seed.mutableFields, seed.requiredFields);

    describe(seed.name, () => {
      for (const mutation of mutations) {
        test(`${mutation.strategy} on "${mutation.field}"`, async () => {
          const result = await threeWayCheck({
            zodSchema: seed.zodSchema,
            ajvValidate: compileFor(seed.jsonSchemaFile),
            value: mutation.value,
            toCaddyConfig: seed.toCaddyConfig,
          });
          totalChecked++;
          checkedByCategory[category] = (checkedByCategory[category] ?? 0) + 1;

          expect(
            verdictsAgree(result),
            `Validators disagree on ${seed.name} / ${mutation.strategy}("${mutation.field}"): ` +
              `${describeResult(result)}. This means our schemas disagree with each other or with ` +
              `real Caddy -- one of them is wrong.`
          ).toBe(true);
        });
      }
    });
  }

  test("coverage summary", () => {
    // Not a real assertion -- surfaces coverage gaps in the log.
    console.log(
      `\nFuzz coverage: ${totalChecked} mutations checked (${JSON.stringify(checkedByCategory)}). ` +
        `${ALL_SEEDS.length} seeds (${MATCHER_COUNT} matchers, ${HANDLER_COUNT} handlers, ${SECURITY_COUNT} security schemas).`
    );
    expect(totalChecked).toBeGreaterThan(0);
  });
});
