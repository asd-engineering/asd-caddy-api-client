/**
 * Runs a mutated config through up to three validators: Zod (runtime),
 * ajv against the generated editor schema (catches permissiveness bugs Zod
 * misses, since Zod silently strips unknown keys), and real `caddy validate`
 * (ground truth, handlers/matchers only -- caddy-security validation panics
 * with a nil-pointer deref in `ResolveRuntimeAppConfig`, so `caddyVerdict`
 * is `undefined` for security-schema checks).
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { z } from "zod";
import type Ajv from "ajv";

const execFileAsync = promisify(execFile);

export interface CheckResult {
  zod: boolean;
  ajv: boolean;
  caddy?: boolean;
  zodError?: string;
  ajvErrors?: string;
  caddyError?: string;
}

export function checkZod(schema: z.ZodTypeAny, value: unknown): { ok: boolean; error?: string } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true };
  return {
    ok: false,
    error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}

export function checkAjv(
  validate: ReturnType<Ajv["compile"]>,
  value: unknown
): { ok: boolean; error?: string } {
  const ok = validate(value) as boolean;
  if (ok) return { ok: true };
  return {
    ok: false,
    error: (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("; "),
  };
}

/**
 * Wraps a single mutated route/handler into the minimal full Caddy JSON
 * config shape `caddy validate` accepts (see
 * src/__tests__/generated-schemas.test.ts's own "@id everywhere" test for
 * the same shape). `route` is the full route object (`{match, handle}` or
 * just `{handle}`).
 */
export function wrapAsFullConfig(route: Record<string, unknown>): object {
  return {
    admin: { listen: "localhost:2019" },
    apps: {
      http: {
        servers: {
          srv0: {
            listen: [":443"],
            routes: [route],
          },
        },
      },
    },
  };
}

export async function checkCaddy(config: object): Promise<{ ok: boolean; error?: string }> {
  const dir = mkdtempSync(join(tmpdir(), "caddy-fuzz-"));
  const configPath = join(dir, "config.json");
  try {
    writeFileSync(configPath, JSON.stringify(config));
    await execFileAsync("caddy", ["validate", "--config", configPath]);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface ThreeWayCheckParams {
  zodSchema: z.ZodTypeAny;
  ajvValidate: ReturnType<Ajv["compile"]>;
  value: unknown;
  /** Wraps `value` into a full Caddy config for the real-caddy leg; omit to skip that leg entirely (caddy-security schemas). */
  toCaddyConfig?: (value: unknown) => object;
}

export async function threeWayCheck(params: ThreeWayCheckParams): Promise<CheckResult> {
  const zod = checkZod(params.zodSchema, params.value);
  const ajv = checkAjv(params.ajvValidate, params.value);

  if (!params.toCaddyConfig) {
    return { zod: zod.ok, ajv: ajv.ok, zodError: zod.error, ajvErrors: ajv.error };
  }

  const caddy = await checkCaddy(params.toCaddyConfig(params.value));
  return {
    zod: zod.ok,
    ajv: ajv.ok,
    caddy: caddy.ok,
    zodError: zod.error,
    ajvErrors: ajv.error,
    caddyError: caddy.error,
  };
}
