/**
 * Generate Zod schemas for all Caddy TypeScript type files
 *
 * This script runs ts-to-zod for each generated TypeScript file
 * to create corresponding Zod validation schemas.
 */

import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const GENERATED_DIR = join(ROOT_DIR, "src/generated");

// List of all core modules to generate Zod schemas for
const coreModules = [
  "caddy-core",
  "caddy-http",
  "caddy-tls",
  "caddy-reverseproxy",
  "caddy-fileserver",
  "caddy-encode",
  "caddy-headers",
  "caddy-rewrite",
  "caddy-auth",
  "caddy-templates",
  "caddy-map",
  "caddy-push",
  "caddy-requestbody",
  "caddy-intercept",
  "caddy-tracing",
  "caddy-logging",
];

// Plugin modules (in src/generated/plugins/)
const pluginModules = ["plugins/caddy-security"];

function generateZodSchema(
  relativeInput: string,
  relativeOutput: string,
  moduleName: string
): boolean {
  const absoluteInput = join(ROOT_DIR, relativeInput);

  if (!existsSync(absoluteInput)) {
    console.log(`  - Skipping ${moduleName} (source not found)`);
    return false;
  }

  try {
    execFileSync("npx", ["ts-to-zod", relativeInput, relativeOutput, "--skipValidation"], {
      cwd: ROOT_DIR,
      stdio: "pipe",
    });
    console.log(`  ✓ Generated ${moduleName}.zod.ts`);
    return true;
  } catch {
    console.error(`  ✗ Failed to generate ${moduleName}.zod.ts`);
    return false;
  }
}

console.log("Generating Zod schemas...\n");

console.log("Core Caddy modules:");
for (const module of coreModules) {
  const relativeInput = `src/generated/${module}.ts`;
  const relativeOutput = `src/generated/${module}.zod.ts`;
  generateZodSchema(relativeInput, relativeOutput, module);
}

console.log("\nPlugin modules:");
for (const module of pluginModules) {
  const relativeInput = `src/generated/${module}.ts`;
  const relativeOutput = `src/generated/${module}.zod.ts`;
  generateZodSchema(relativeInput, relativeOutput, module);
}

console.log("\nDone!");
