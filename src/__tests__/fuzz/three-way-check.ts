/**
 * Runs a mutated config fragment through up to three independent
 * validators and reports whether they agree (0.10 priority 6):
 *
 * 1. Zod's `.safeParse()` -- what the npm client actually enforces at
 *    runtime.
 * 2. `ajv` against the generated editor JSON schema -- what VS Code's
 *    built-in JSON language service enforces (see this session's
 *    established rigor pattern: a Zod-only check can miss permissiveness
 *    bugs `ajv` catches, since Zod silently strips unknown keys by default).
 * 3. The real `caddy` binary (`caddy validate`) -- ground truth.
 *
 * Leg 3 is only available for handlers/matchers: real `caddy validate`
 * genuinely panics when provisioning a `caddy-security` app (a nil-pointer
 * dereference in `ResolveRuntimeAppConfig`, confirmed by hand this
 * session against the `androw/caddy-security:2.11.2_1.1.59` image -- the
 * project's own integration tests avoid this entirely by using
 * `docker-compose up` + the Admin API instead of the CLI). Security-schema
 * checks are Zod-vs-ajv only; `caddyVerdict` is `undefined` for them.
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
