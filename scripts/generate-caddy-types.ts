/**
 * Generate TypeScript types and Zod schemas for core Caddy
 *
 * This script:
 * 1. Runs tygo in local/caddy to generate TypeScript types
 * 2. Runs transform-caddy-types.ts to post-process the types
 * 3. Runs generate-zod-schemas.ts to generate Zod schemas
 */

import { execFileSync, spawnSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const CADDY_DIR = join(ROOT_DIR, "local/caddy");

function findTygo(): string {
  const home = process.env.HOME || "";
  const locations = [join(home, "go/bin/tygo"), "/usr/local/go/bin/tygo"];

  for (const loc of locations) {
    if (existsSync(loc)) {
      return loc;
    }
  }

  throw new Error("tygo not found. Install with: go install github.com/gzuidhof/tygo@latest");
}

function runScript(scriptPath: string, description: string): boolean {
  console.log(`\n${description}...`);
  try {
    const result = spawnSync("npx", ["tsx", scriptPath], {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      console.error(`  ✗ Failed: ${description}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`  ✗ Failed: ${description}`);
    if (error instanceof Error) {
      console.error(`    ${error.message}`);
    }
    return false;
  }
}

// Main execution
console.log("Generating Caddy types...\n");

// Step 1: Check prerequisites
if (!existsSync(CADDY_DIR)) {
  console.error(`Error: Caddy source not found at ${CADDY_DIR}`);
  console.error("Clone it with: git clone https://github.com/caddyserver/caddy local/caddy");
  process.exit(1);
}

const tygoConfig = join(CADDY_DIR, "tygo.yaml");
if (!existsSync(tygoConfig)) {
  console.error(`Error: tygo.yaml not found at ${tygoConfig}`);
  process.exit(1);
}

// Step 2: Find tygo
let tygoPath: string;
try {
  tygoPath = findTygo();
  console.log(`Using tygo at: ${tygoPath}`);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

// Step 3: Run tygo
console.log("\nStep 1: Generate TypeScript from Go source (tygo)");
try {
  execFileSync(tygoPath, ["generate"], {
    cwd: CADDY_DIR,
    stdio: "inherit",
  });
  console.log("  ✓ Generated TypeScript types");
} catch (error) {
  console.error("  ✗ Failed to generate TypeScript types");
  process.exit(1);
}

// Step 4: Resolve cross-package references
if (
  !runScript(join(__dirname, "resolve-cross-refs.ts"), "Step 2: Resolve cross-package references")
) {
  process.exit(1);
}

// Step 5: Generate Zod schemas
if (!runScript(join(__dirname, "generate-zod-schemas.ts"), "Step 3: Generate Zod schemas")) {
  process.exit(1);
}

console.log("\n✓ Caddy type generation complete!");
