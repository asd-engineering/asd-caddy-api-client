import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "caddy/index": "src/caddy/index.ts",
    "mitm/index": "src/mitm/index.ts",
    "caddy-types": "src/caddy-types.ts",
    "plugins/index": "src/plugins/index.ts",
    "plugins/caddy-security/index": "src/plugins/caddy-security/index.ts",
    "generated/extension-assets": "src/generated/extension-assets.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  outDir: "dist",
  esbuildOptions(options) {
    // Enable JSON imports for VERSION sync from package.json
    options.resolveExtensions = [".ts", ".js", ".json"];
  },
});
