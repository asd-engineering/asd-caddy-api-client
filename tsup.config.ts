import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "caddy/index": "src/caddy/index.ts",
    "mitm/index": "src/mitm/index.ts",
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
