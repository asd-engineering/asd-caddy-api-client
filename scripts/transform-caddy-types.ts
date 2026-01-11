/**
 * Post-process generated TypeScript types for Caddy-specific patterns
 *
 * This script fixes:
 * 1. `any` with caddy.Duration comment -> `Duration` (uses the Duration type alias)
 * 2. `any` with caddytls comment -> imports from caddy-tls module
 * 3. Ensures proper cross-module imports
 * 4. Adds missing unexported Go type definitions
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GENERATED_DIR = join(__dirname, "../src/generated");

// Missing types that need to be added to specific files
// These are unexported Go types that tygo doesn't generate but are referenced
const MISSING_TYPES: Record<string, string> = {
  "caddy-rewrite.ts": `
// Types for unexported Go structs (approximated from Caddy source)
export interface substrReplacer {
  find?: string;
  replace?: string;
  limit?: number;
}

export interface regexReplacer {
  find?: string;
  replace?: string;
}

export interface queryOps {
  delete?: string[];
  set?: Record<string, string>;
  add?: Record<string, string[]>;
  replace?: Record<string, string[]>;
  rename?: { [key: string]: string }[];
}
`,
};

function transformFile(filename: string): void {
  const filepath = join(GENERATED_DIR, filename);
  let content = readFileSync(filepath, "utf-8");
  const originalContent = content;

  // Track what imports we need to add
  const importsNeeded = new Set<string>();

  // Add missing types for this file if needed
  if (MISSING_TYPES[filename] && !content.includes("// Types for unexported Go structs")) {
    // Insert after the first source comment block
    const sourceCommentEnd = content.indexOf("\n\n", content.indexOf("// source:"));
    if (sourceCommentEnd !== -1) {
      content =
        content.slice(0, sourceCommentEnd) +
        "\n" +
        MISSING_TYPES[filename] +
        content.slice(sourceCommentEnd);
    }
  }

  // Fix caddy.Duration -> Duration (already defined in caddy-core.ts)
  // Pattern: any /* caddy.Duration */
  content = content.replace(/any \/\* caddy\.Duration \*\//g, "Duration");

  // For HTTP and TLS files, add import for Duration from caddy-core
  if (filename !== "caddy-core.ts" && content.includes("Duration")) {
    importsNeeded.add("Duration");
  }

  // Fix caddytls.ConnectionPolicies -> ConnectionPolicy[]
  if (filename !== "caddy-tls.ts") {
    content = content.replace(
      /any \/\* caddytls\.ConnectionPolicies \*\//g,
      "TlsConnectionPolicy[]"
    );
    if (content.includes("TlsConnectionPolicy[]")) {
      importsNeeded.add("TlsConnectionPolicy");
    }
  } else {
    content = content.replace(/any \/\* caddytls\.ConnectionPolicies \*\//g, "ConnectionPolicy[]");
  }

  // Fix caddytls.* references
  content = content.replace(/any \/\* caddytls\.(\w+) \*\//g, (_, typeName) => {
    if (filename !== "caddy-tls.ts") {
      importsNeeded.add(`TLS_${typeName}`);
      return `Tls${typeName}`;
    }
    return typeName;
  });

  // Fix caddy.ModuleMap references
  content = content.replace(/any \/\* caddy\.ModuleMap \*\//g, "ModuleMap");
  if (filename !== "caddy-core.ts" && content.includes("ModuleMap")) {
    importsNeeded.add("ModuleMap");
  }

  // Fix time.Time -> string (ISO date string)
  content = content.replace(/any \/\* time\.Time \*\//g, "string");

  // Fix context.Context -> any (internal Go type)
  content = content.replace(/any \/\* context\.Context \*\//g, "unknown");

  // Fix sync.RWMutex -> any (internal Go type)
  content = content.replace(/any \/\* sync\.RWMutex \*\//g, "unknown");

  // Fix Go error type -> Error | null (TypeScript)
  // Handle various patterns where Go's error type appears
  content = content.replace(/: error;/g, ": Error | null;");
  content = content.replace(/: error\|/g, ": Error |");
  content = content.replace(/: error}/g, ": Error | null}");
  content = content.replace(/: error\)/g, ": Error | null)");
  content = content.replace(/: error,/g, ": Error | null,");

  // Fix bigInt -> BigInt (TypeScript built-in)
  content = content.replace(/bigInt\[\]/g, "bigint[]");
  content = content.replace(/: bigInt;/g, ": bigint;");
  content = content.replace(/: bigInt\|/g, ": bigint |");
  content = content.replace(/: bigInt\)/g, ": bigint)");

  // Fix invalid `export const X = any;` -> comment it out (Go context keys)
  content = content.replace(
    /export const (\w+) = any;/g,
    "// export const $1 = any; // Disabled - Go context key"
  );

  // Add imports if needed
  if (importsNeeded.size > 0 && filename !== "caddy-core.ts") {
    const coreImports = Array.from(importsNeeded).filter(
      (i) => !i.startsWith("TLS_") && !i.startsWith("Tls")
    );
    const tlsImports = Array.from(importsNeeded)
      .filter((i) => i.startsWith("TLS_"))
      .map((i) => i.replace("TLS_", "") + " as Tls" + i.replace("TLS_", ""));

    // Add TlsConnectionPolicy if needed
    if (importsNeeded.has("TlsConnectionPolicy")) {
      tlsImports.push("ConnectionPolicy as TlsConnectionPolicy");
    }

    let importStatements = "";

    if (coreImports.length > 0) {
      importStatements += `import type { ${coreImports.join(", ")} } from "./caddy-core";\n`;
    }

    if (tlsImports.length > 0 && filename !== "caddy-tls.ts") {
      importStatements += `import type { ${tlsImports.join(", ")} } from "./caddy-tls";\n`;
    }

    if (importStatements) {
      // Add imports after the "DO NOT EDIT" comment
      content = content.replace(
        "// Code generated by tygo. DO NOT EDIT.\n",
        `// Code generated by tygo. DO NOT EDIT.\n\n${importStatements}`
      );
    }
  }

  // Only write if changed
  if (content !== originalContent) {
    writeFileSync(filepath, content);
    console.log(`  ✓ Transformed ${filename}`);
  } else {
    console.log(`  - No changes needed for ${filename}`);
  }
}

// Process all generated files
console.log("Post-processing generated TypeScript files...");

// Core modules
transformFile("caddy-core.ts");
transformFile("caddy-http.ts");
transformFile("caddy-tls.ts");

// Handler modules
const handlerModules = [
  "caddy-reverseproxy.ts",
  "caddy-fileserver.ts",
  "caddy-encode.ts",
  "caddy-headers.ts",
  "caddy-rewrite.ts",
  "caddy-auth.ts",
  "caddy-templates.ts",
  "caddy-map.ts",
  "caddy-push.ts",
  "caddy-requestbody.ts",
  "caddy-intercept.ts",
  "caddy-tracing.ts",
  "caddy-logging.ts",
];

handlerModules.forEach((module) => {
  try {
    transformFile(module);
  } catch {
    console.log(`  - Skipping ${module} (not found)`);
  }
});

console.log("Done!");
