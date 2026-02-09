/**
 * Generate TypeScript types and Zod schemas for Caddy plugins
 *
 * This script:
 * 1. Runs tygo in each plugin's local directory to generate TypeScript types
 * 2. Runs ts-to-zod to generate Zod schemas from the TypeScript types
 */

import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const LOCAL_DIR = join(ROOT_DIR, "local");
const GENERATED_DIR = join(ROOT_DIR, "src/generated/plugins");

// Plugin configurations
interface PluginConfig {
  name: string;
  localPath: string;
  outputFile: string;
  /** Multiple output files (e.g., go-authcrunch generates many files) */
  multiFile?: boolean;
}

const plugins: PluginConfig[] = [
  {
    name: "caddy-security",
    localPath: "caddy-security",
    outputFile: "caddy-security",
  },
  {
    name: "go-authcrunch",
    localPath: "go-authcrunch",
    outputFile: "authcrunch-core", // Main file, but generates many
    multiFile: true, // Generates multiple authcrunch-*.ts files
  },
];

function findTygo(): string {
  // Try common locations
  const home = process.env.HOME || "";
  const locations = [join(home, "go/bin/tygo"), "/usr/local/go/bin/tygo"];

  for (const loc of locations) {
    if (existsSync(loc)) {
      return loc;
    }
  }

  throw new Error("tygo not found. Install with: go install github.com/gzuidhof/tygo@latest");
}

function generateTypesForPlugin(plugin: PluginConfig, tygoPath: string): boolean {
  const pluginDir = join(LOCAL_DIR, plugin.localPath);
  const tygoConfig = join(pluginDir, "tygo.yaml");

  if (!existsSync(pluginDir)) {
    console.log(`  - Skipping ${plugin.name} (directory not found: ${pluginDir})`);
    return false;
  }

  if (!existsSync(tygoConfig)) {
    console.log(`  - Skipping ${plugin.name} (tygo.yaml not found)`);
    return false;
  }

  try {
    execFileSync(tygoPath, ["generate"], {
      cwd: pluginDir,
      stdio: "pipe",
    });
    console.log(`  ✓ Generated TypeScript types for ${plugin.name}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to generate types for ${plugin.name}`);
    if (error instanceof Error) {
      console.error(`    ${error.message}`);
    }
    return false;
  }
}

function generateZodSchema(plugin: PluginConfig): boolean {
  const inputFile = join(GENERATED_DIR, `${plugin.outputFile}.ts`);
  const outputFile = join(GENERATED_DIR, `${plugin.outputFile}.zod.ts`);

  // Use relative paths from ROOT_DIR for ts-to-zod
  const relativeInput = `src/generated/plugins/${plugin.outputFile}.ts`;
  const relativeOutput = `src/generated/plugins/${plugin.outputFile}.zod.ts`;

  if (!existsSync(inputFile)) {
    console.log(`  - Skipping Zod generation for ${plugin.name} (TypeScript file not found)`);
    return false;
  }

  try {
    execFileSync("npx", ["ts-to-zod", relativeInput, relativeOutput, "--skipValidation"], {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });
    console.log(`  ✓ Generated Zod schema for ${plugin.name}`);
    return true;
  } catch {
    console.error(`  ✗ Failed to generate Zod schema for ${plugin.name}`);
    return false;
  }
}

function runScript(scriptPath: string, description: string): boolean {
  console.log(`\n${description}...`);
  try {
    execFileSync("npx", ["tsx", scriptPath], {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });
    return true;
  } catch {
    console.error(`  ✗ Failed: ${description}`);
    return false;
  }
}

// Main execution
console.log("Generating plugin types...\n");

let tygoPath: string;
try {
  tygoPath = findTygo();
  console.log(`Using tygo at: ${tygoPath}\n`);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

console.log("Step 1: Generate TypeScript from Go source (tygo)");
for (const plugin of plugins) {
  generateTypesForPlugin(plugin, tygoPath);
}

console.log("\nStep 2: Resolve cross-package references");
if (!runScript(join(__dirname, "resolve-cross-refs.ts"), "Resolving cross-package references")) {
  process.exit(1);
}

console.log("\nStep 3: Generate Zod schemas from TypeScript (ts-to-zod)");
for (const plugin of plugins) {
  // Skip multiFile plugins - they're handled by generate-zod-schemas.ts
  if (!plugin.multiFile) {
    generateZodSchema(plugin);
  } else {
    console.log(
      `  - Skipping ${plugin.name} (multiFile - run generate:types for full Zod generation)`
    );
  }
}

console.log("\nDone!");
