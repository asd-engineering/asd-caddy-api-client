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
const GENERATED_DIR = join(__dirname, "../src/generated");

// List of all modules to generate Zod schemas for
const modules = [
  // Core modules
  "caddy-core",
  "caddy-http",
  "caddy-tls",
  // Handler modules
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

console.log("Generating Zod schemas...");

for (const module of modules) {
  const inputFile = join(GENERATED_DIR, `${module}.ts`);
  const outputFile = join(GENERATED_DIR, `${module}.zod.ts`);

  if (!existsSync(inputFile)) {
    console.log(`  - Skipping ${module} (source not found)`);
    continue;
  }

  try {
    // Use execFileSync with npx for safety (no shell injection possible)
    execFileSync(
      "npx",
      ["ts-to-zod", inputFile, outputFile, "--skipValidation"],
      { stdio: "pipe" }
    );
    console.log(`  ✓ Generated ${module}.zod.ts`);
  } catch {
    console.error(`  ✗ Failed to generate ${module}.zod.ts`);
  }
}

console.log("Done!");
