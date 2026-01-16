/**
 * Resolve cross-package type references in generated TypeScript files
 *
 * tygo generates `any /* package.Type * /` for cross-package references.
 * This script:
 * 1. Scans generated files for these patterns
 * 2. Maps them to the correct import from other generated files
 * 3. Rewrites the files with proper imports and types
 *
 * Usage: npx tsx scripts/resolve-cross-refs.ts [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";

const GENERATED_DIR = join(import.meta.dirname, "../src/generated");
const PLUGINS_DIR = join(GENERATED_DIR, "plugins");

interface TypeMapping {
  file: string;
  exportName: string;
}

// Go standard library types mapped to TypeScript equivalents
// These don't need imports - they're replaced inline
const GO_STDLIB_MAPPINGS: Record<string, string> = {
  // net/http types
  "http.Header": "Record<string, string[]>",
  "http.Request": "unknown",
  "http.ResponseWriter": "unknown",
  "http.FileSystem": "unknown",
  // url types
  "url.Values": "Record<string, string[]>",
  "url.URL": "string",
  // tls types
  "tls.ConnectionState": "unknown",
  // io types
  "io.WriteCloser": "unknown",
  "io.Reader": "unknown",
  "io.Writer": "unknown",
  // fmt types
  "fmt.Stringer": "unknown",
  // template types
  "template.FuncMap": "Record<string, unknown>",
  // xml types
  "xml.Name": "string",
  // x509 types
  "x509.PublicKeyAlgorithm": "number",
  // net types
  "netip.AddrPort": "string",
  "net.IP": "string",
  // acme types (external but not in our generated files)
  "acme.EAB": "{ kid?: string; hmacEncoded?: string }",
  // libdns types (external)
  "libdns.RecordGetter": "unknown",
  "libdns.RecordSetter": "unknown",
  // zap logger (external)
  "zap.Logger": "unknown",
  // Go internal types that shouldn't be exposed
  "context.Context": "unknown",
  "sync.RWMutex": "unknown",
  "time.Time": "string",
  "time.Duration": "number | string",
  "regexp.Regexp": "string",
  "json.RawMessage": "unknown",
};

// Go built-in and unexported types that need direct replacement in content
// These aren't caught by the any /* */ pattern - they're raw type names
const GO_BUILTIN_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  // Go error interface - various contexts
  { pattern: /:\s*error\s*;/g, replacement: ": Error;" },
  { pattern: /:\s*error\s*\|/g, replacement: ": Error |" },
  { pattern: /:\s*error\s*}/g, replacement: ": Error}" },
  // big.Int arrays and pointers
  { pattern: /:\s*bigInt\[\]\s*;/g, replacement: ": string[];" },
  { pattern: /:\s*bigInt\s*;/g, replacement: ": string;" },
  { pattern: /:\s*\*bigInt\s*;/g, replacement: ": string;" },
  // Go const with ctx key type (tygo generates `= any`)
  { pattern: /export const (\w+) = any;/g, replacement: "export const $1: unknown = null;" },
  // Unexported types from caddyhttp/rewrite - replace with references to added types
  { pattern: /:\s*substrReplacer\[\]\s*;/g, replacement: ": substrReplacer[];" },
  { pattern: /:\s*\(regexReplacer \| undefined\)\[\]\s*;/g, replacement: ": regexReplacer[];" },
  { pattern: /:\s*queryOps\s*;/g, replacement: ": queryOps;" },
];

// Types to add to specific files (unexported Go types)
const TYPES_TO_ADD: Record<string, string> = {
  "caddy-rewrite.ts": `
// Unexported Go types (approximated from Caddy source)
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
  rename?: { key: string; val: string }[];
}
`,
};

interface FileAnalysis {
  filePath: string;
  fileName: string;
  exports: string[];
  anyRefs: Array<{
    original: string;
    packagePath: string;
    typeName: string;
    line: number;
  }>;
}

function analyzeFile(filePath: string): FileAnalysis {
  const content = readFileSync(filePath, "utf-8");
  const fileName = basename(filePath);
  const lines = content.split("\n");

  const exports: string[] = [];
  const anyRefs: FileAnalysis["anyRefs"] = [];

  const exportPattern = /^export (?:interface|type|const) (\w+)/;
  const anyRefPattern = /any \/\* ([\w.]+)\.(\w+) \*\//g;

  lines.forEach((line, index) => {
    const exportMatch = line.match(exportPattern);
    if (exportMatch) {
      exports.push(exportMatch[1]);
    }

    let match;
    while ((match = anyRefPattern.exec(line)) !== null) {
      anyRefs.push({
        original: match[0],
        packagePath: match[1],
        typeName: match[2],
        line: index + 1,
      });
    }
  });

  return { filePath, fileName, exports, anyRefs };
}

function buildTypeIndex(analyses: FileAnalysis[]): Map<string, TypeMapping> {
  const index = new Map<string, TypeMapping>();

  // Package to file mappings
  const packageToFile: Record<string, string> = {
    // authcrunch packages
    ui: "authcrunch-ui.ts",
    cookie: "authcrunch-cookie.ts",
    icons: "authcrunch-icons.ts",
    acl: "authcrunch-acl.ts",
    kms: "authcrunch-kms.ts",
    credentials: "authcrunch-credentials.ts",
    authn: "authcrunch-authn.ts",
    authz: "authcrunch-authz.ts",
    ids: "authcrunch-ids.ts",
    idp: "authcrunch-idp.ts",
    sso: "authcrunch-sso.ts",
    oauth: "authcrunch-oauth.ts",
    saml: "authcrunch-saml.ts",
    transformer: "authcrunch-transformer.ts",
    options: "authcrunch-options.ts",
    redirects: "authcrunch-redirects.ts",
    bypass: "authcrunch-bypass.ts",
    injector: "authcrunch-injector.ts",
    authproxy: "authcrunch-authproxy.ts",
    registry: "authcrunch-registry.ts",
    messaging: "authcrunch-messaging.ts",
    // For root authcrunch package
    authcrunch: "authcrunch-core.ts",
    // Core Caddy packages
    caddy: "caddy-core.ts",
    caddyhttp: "caddy-http.ts",
    caddytls: "caddy-tls.ts",
    reverseproxy: "caddy-reverseproxy.ts",
    fileserver: "caddy-fileserver.ts",
    encode: "caddy-encode.ts",
    headers: "caddy-headers.ts",
    rewrite: "caddy-rewrite.ts",
    templates: "caddy-templates.ts",
  };

  for (const analysis of analyses) {
    for (const exportName of analysis.exports) {
      const fileBase = analysis.fileName.replace(".ts", "");

      if (fileBase.startsWith("authcrunch-")) {
        const pkg = fileBase.replace("authcrunch-", "");
        index.set(`${pkg}.${exportName}`, {
          file: analysis.fileName,
          exportName,
        });
      }

      if (fileBase.startsWith("caddy-")) {
        const pkg = fileBase.replace("caddy-", "");
        index.set(`${pkg}.${exportName}`, {
          file: analysis.fileName,
          exportName,
        });
      }
    }
  }

  for (const [pkg, file] of Object.entries(packageToFile)) {
    const analysis = analyses.find((a) => a.fileName === file);
    if (analysis) {
      for (const exportName of analysis.exports) {
        const key = `${pkg}.${exportName}`;
        if (!index.has(key)) {
          index.set(key, { file, exportName });
        }
      }
    }
  }

  return index;
}

// Generate an alias for a type based on its source file
function generateAlias(typeName: string, sourceFile: string): string {
  // Extract module name from file, e.g., "authcrunch-oauth.ts" -> "OAuth"
  const baseName = sourceFile.replace(".ts", "");
  const parts = baseName.split("-");
  const modulePart = parts[parts.length - 1];
  const prefix = modulePart.charAt(0).toUpperCase() + modulePart.slice(1);
  return `${prefix}${typeName}`;
}

interface ImportSpec {
  exportName: string;
  alias?: string;
}

function resolveFile(
  analysis: FileAnalysis,
  typeIndex: Map<string, TypeMapping>,
  dryRun: boolean
): { resolved: number; unresolved: string[]; builtinFixed: number } {
  let content = readFileSync(analysis.filePath, "utf-8");

  // Apply Go builtin type replacements (even if no anyRefs)
  let builtinFixed = 0;
  for (const { pattern, replacement } of GO_BUILTIN_REPLACEMENTS) {
    const matches = content.match(pattern);
    if (matches) {
      builtinFixed += matches.length;
      content = content.replace(pattern, replacement);
    }
  }

  // Add missing type definitions for this file
  let typesAdded = false;
  if (TYPES_TO_ADD[analysis.fileName] && !content.includes("// Unexported Go types")) {
    const insertPoint = content.indexOf("// Code generated by tygo. DO NOT EDIT.\n");
    if (insertPoint !== -1) {
      const afterComment = insertPoint + "// Code generated by tygo. DO NOT EDIT.\n".length;
      content =
        content.slice(0, afterComment) +
        TYPES_TO_ADD[analysis.fileName] +
        content.slice(afterComment);
      typesAdded = true;
    }
  }

  if (analysis.anyRefs.length === 0) {
    if (builtinFixed > 0 || typesAdded) {
      writeFileSync(analysis.filePath, content);
    }
    return { resolved: 0, unresolved: [], builtinFixed };
  }

  // Map: file -> Map<exportName, ImportSpec>
  const importsNeeded = new Map<string, Map<string, ImportSpec>>();
  const unresolved: string[] = [];
  let resolved = 0;

  // Track what local names are already used (exports from this file)
  const localNames = new Set(analysis.exports);

  for (const ref of analysis.anyRefs) {
    // First check stdlib mappings
    const stdlibKey = `${ref.packagePath}.${ref.typeName}`;
    const shortStdlibKey = `${ref.packagePath.split(".").pop()}.${ref.typeName}`;

    if (GO_STDLIB_MAPPINGS[stdlibKey]) {
      content = content.replace(ref.original, GO_STDLIB_MAPPINGS[stdlibKey]);
      resolved++;
      continue;
    }

    if (GO_STDLIB_MAPPINGS[shortStdlibKey]) {
      content = content.replace(ref.original, GO_STDLIB_MAPPINGS[shortStdlibKey]);
      resolved++;
      continue;
    }

    // Then check cross-package references
    const lookupKeys = [
      `${ref.packagePath}.${ref.typeName}`,
      `${ref.packagePath.split(".").pop()}.${ref.typeName}`,
    ];

    let found: TypeMapping | undefined;
    for (const key of lookupKeys) {
      found = typeIndex.get(key);
      if (found) break;
    }

    if (!found) {
      const shortPkg = ref.packagePath.split(".").pop() || ref.packagePath;
      for (const [key, mapping] of typeIndex.entries()) {
        if (key.endsWith(`.${ref.typeName}`) && key.startsWith(shortPkg)) {
          found = mapping;
          break;
        }
      }
    }

    if (found && found.file !== analysis.fileName) {
      if (!importsNeeded.has(found.file)) {
        importsNeeded.set(found.file, new Map());
      }
      const fileImports = importsNeeded.get(found.file)!;

      // Check if we already have this import
      if (!fileImports.has(found.exportName)) {
        // Check for name conflict with local exports or other imports
        const needsAlias = localNames.has(found.exportName);
        const alias = needsAlias ? generateAlias(found.exportName, found.file) : undefined;

        fileImports.set(found.exportName, { exportName: found.exportName, alias });

        // Add the alias (or original name) to localNames to prevent future conflicts
        localNames.add(alias || found.exportName);
      }

      // Get the name to use in content (alias or original)
      const importSpec = fileImports.get(found.exportName)!;
      const nameToUse = importSpec.alias || importSpec.exportName;
      content = content.replace(ref.original, nameToUse);
      resolved++;
    } else if (found && found.file === analysis.fileName) {
      content = content.replace(ref.original, found.exportName);
      resolved++;
    } else {
      unresolved.push(`${ref.packagePath}.${ref.typeName} (line ${ref.line})`);
    }
  }

  if (importsNeeded.size > 0) {
    const importStatements: string[] = [];

    for (const [file, imports] of importsNeeded.entries()) {
      const importParts: string[] = [];
      const sortedImports = Array.from(imports.values()).sort((a, b) =>
        a.exportName.localeCompare(b.exportName)
      );

      for (const spec of sortedImports) {
        if (spec.alias) {
          importParts.push(`${spec.exportName} as ${spec.alias}`);
        } else {
          importParts.push(spec.exportName);
        }
      }

      const isPluginFile =
        analysis.filePath.includes("/plugins/") || analysis.filePath.includes("\\plugins\\");
      const targetIsPlugin = file.startsWith("authcrunch-") || file.startsWith("caddy-security");

      let relativePath: string;
      if (isPluginFile && targetIsPlugin) {
        relativePath = `./${file.replace(".ts", "")}`;
      } else if (isPluginFile && !targetIsPlugin) {
        relativePath = `../${file.replace(".ts", "")}`;
      } else {
        relativePath = `./${file.replace(".ts", "")}`;
      }

      importStatements.push(`import type { ${importParts.join(", ")} } from "${relativePath}";`);
    }

    const insertPoint = content.indexOf("// Code generated by tygo. DO NOT EDIT.\n");
    if (insertPoint !== -1) {
      const afterComment = insertPoint + "// Code generated by tygo. DO NOT EDIT.\n".length;
      content =
        content.slice(0, afterComment) +
        "\n" +
        importStatements.join("\n") +
        "\n" +
        content.slice(afterComment);
    }
  }

  if (!dryRun && (resolved > 0 || builtinFixed > 0 || typesAdded)) {
    writeFileSync(analysis.filePath, content);
  }

  return { resolved, unresolved, builtinFixed };
}

function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Resolving cross-package type references...\n");
  if (dryRun) {
    console.log("(DRY RUN - no files will be modified)\n");
  }

  const allFiles: string[] = [];

  const coreFiles = readdirSync(GENERATED_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".zod.ts"))
    .map((f) => join(GENERATED_DIR, f));
  allFiles.push(...coreFiles);

  try {
    const pluginFiles = readdirSync(PLUGINS_DIR)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".zod.ts"))
      .map((f) => join(PLUGINS_DIR, f));
    allFiles.push(...pluginFiles);
  } catch {
    // No plugins directory yet
  }

  const analyses = allFiles.map(analyzeFile);
  const typeIndex = buildTypeIndex(analyses);

  console.log(`Found ${typeIndex.size} exported types across ${analyses.length} files\n`);

  let totalResolved = 0;
  let totalBuiltinFixed = 0;
  const allUnresolved: string[] = [];

  for (const analysis of analyses) {
    const { resolved, unresolved, builtinFixed } = resolveFile(analysis, typeIndex, dryRun);

    if (resolved > 0 || unresolved.length > 0 || builtinFixed > 0) {
      console.log(`${analysis.fileName}:`);
      if (resolved > 0) {
        console.log(`  ✓ Resolved ${resolved} references`);
      }
      if (builtinFixed > 0) {
        console.log(`  ✓ Fixed ${builtinFixed} Go builtin types`);
      }
      if (unresolved.length > 0) {
        console.log(`  ⚠ Unresolved: ${unresolved.join(", ")}`);
        allUnresolved.push(...unresolved.map((u) => `${analysis.fileName}: ${u}`));
      }
    }

    totalResolved += resolved;
    totalBuiltinFixed += builtinFixed;
  }

  console.log(`\nSummary:`);
  console.log(`  Resolved: ${totalResolved} cross-package references`);
  console.log(`  Fixed: ${totalBuiltinFixed} Go builtin types`);
  console.log(`  Unresolved: ${allUnresolved.length} references`);

  if (allUnresolved.length > 0) {
    console.log(`\nUnresolved references (may need manual mapping):`);
    for (const u of allUnresolved.slice(0, 20)) {
      console.log(`  - ${u}`);
    }
    if (allUnresolved.length > 20) {
      console.log(`  ... and ${allUnresolved.length - 20} more`);
    }
  }

  if (!dryRun && (totalResolved > 0 || totalBuiltinFixed > 0)) {
    console.log(`\n✓ Files updated. Run 'npm run lint' to verify.`);
  }
}

main();
