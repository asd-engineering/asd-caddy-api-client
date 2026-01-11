// @ts-check
// ESLint flat config for TypeScript NPM package
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Ignore patterns
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "local/**",
      ".asd/**",
      "demo/**", // Demo files are standalone
      "examples/**", // Example files are standalone demos
      "docs/api/**", // Generated TypeDoc documentation
      "src/generated/**", // Generated type files from Caddy Go source
      "scripts/**", // Build/generation scripts
      "*.config.ts",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  // Base config for all files
  js.configs.recommended,
  // TypeScript files
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // See AGENTS.md - any is prohibited unless explicitly justified
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": "off",
    },
  },
  // Test files - relaxed rules
  {
    files: ["**/*.test.ts", "**/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/require-await": "off",
    },
  }
);
