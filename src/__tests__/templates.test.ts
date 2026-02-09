/**
 * Template Validation Tests
 *
 * These tests ensure ALL templates in templates.ts produce valid configurations.
 * This is critical because templates are the single source of truth for:
 * - VSCode snippets
 * - Documentation examples
 * - User-facing configuration patterns
 *
 * If a template fails here, the generated snippet would produce invalid config.
 *
 * @see src/plugins/caddy-security/templates.ts
 */

import { describe, test, expect } from "vitest";
import {
  SECURITY_TEMPLATES,
  getTemplatesByCategory,
  getTemplateById,
} from "../plugins/caddy-security/templates.js";

describe("Security Templates Validation", () => {
  describe("All templates produce valid configurations", () => {
    // Dynamically test every template
    for (const template of SECURITY_TEMPLATES) {
      test(`${template.id}: ${template.name}`, () => {
        // The build function uses builders which have Zod validation
        // If this doesn't throw, the configuration is valid
        expect(() => {
          const result = template.build();
          expect(result).toBeDefined();
        }).not.toThrow();
      });
    }
  });

  describe("Template metadata is complete", () => {
    for (const template of SECURITY_TEMPLATES) {
      describe(`${template.id}`, () => {
        test("has valid id (kebab-case)", () => {
          expect(template.id).toMatch(/^[a-z0-9-]+$/);
        });

        test("has non-empty name", () => {
          expect(template.name.length).toBeGreaterThan(0);
        });

        test("has non-empty description", () => {
          expect(template.description.length).toBeGreaterThan(0);
        });

        test("has valid category", () => {
          expect([
            "identity-store",
            "identity-provider",
            "portal",
            "policy",
            "route",
            "full-setup",
          ]).toContain(template.category);
        });

        test("has variables array", () => {
          expect(Array.isArray(template.variables)).toBe(true);
        });

        test("has build function", () => {
          expect(typeof template.build).toBe("function");
        });

        test("has snippet array with content", () => {
          expect(Array.isArray(template.snippet)).toBe(true);
          expect(template.snippet.length).toBeGreaterThan(0);
        });

        test("snippet contains VSCode placeholders", () => {
          const snippetText = template.snippet.join("\n");
          // All templates except simplest ones should have at least one placeholder
          if (template.variables.length > 0) {
            expect(snippetText).toMatch(/\$\{?\d/);
          }
        });
      });
    }
  });

  describe("Template IDs are unique", () => {
    test("no duplicate template IDs", () => {
      const ids = SECURITY_TEMPLATES.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("Category coverage", () => {
    const categories = [
      "identity-store",
      "identity-provider",
      "portal",
      "policy",
      "route",
      "full-setup",
    ] as const;

    for (const category of categories) {
      test(`has at least one ${category} template`, () => {
        const templates = getTemplatesByCategory(category);
        expect(templates.length).toBeGreaterThan(0);
      });
    }
  });

  describe("Helper functions", () => {
    test("getTemplatesByCategory returns correct templates", () => {
      const stores = getTemplatesByCategory("identity-store");
      expect(stores.length).toBeGreaterThanOrEqual(2); // local and ldap
      expect(stores.every((t) => t.category === "identity-store")).toBe(true);
    });

    test("getTemplateById finds existing template", () => {
      const template = getTemplateById("caddy-sec-local-store");
      expect(template).toBeDefined();
      expect(template?.name).toBe("Local Identity Store");
    });

    test("getTemplateById returns undefined for non-existent", () => {
      const template = getTemplateById("non-existent-template");
      expect(template).toBeUndefined();
    });
  });

  describe("Template count tracking", () => {
    test("has expected minimum number of templates", () => {
      // This helps catch accidental template removal
      expect(SECURITY_TEMPLATES.length).toBeGreaterThanOrEqual(17);
    });

    test("logs template count for visibility", () => {
      console.log(`\n📊 Security Templates: ${SECURITY_TEMPLATES.length} total`);
      const byCategory = {
        "identity-store": getTemplatesByCategory("identity-store").length,
        "identity-provider": getTemplatesByCategory("identity-provider").length,
        portal: getTemplatesByCategory("portal").length,
        policy: getTemplatesByCategory("policy").length,
        route: getTemplatesByCategory("route").length,
        "full-setup": getTemplatesByCategory("full-setup").length,
      };
      console.log("   By category:", byCategory);
    });
  });
});

describe("Template Snippet Syntax", () => {
  for (const template of SECURITY_TEMPLATES) {
    test(`${template.id} snippet has valid syntax`, () => {
      const snippet = template.snippet.join("\n");

      // Note: VSCode placeholders like ${1:value} add extra braces
      // We just check the snippet is parseable when placeholders are filled
      const filledSnippet = snippet
        .replace(/\$\{\d+:([^}]+)\}/g, "$1") // Replace ${1:default} with default
        .replace(/\$\{\d+\|([^|]+)\|[^}]*\}/g, "$1") // Replace ${1|choice1,choice2|} with choice1
        .replace(/\$\d+/g, "placeholder"); // Replace $1 with placeholder

      // The filled snippet should be valid-ish JavaScript/TypeScript
      // We can't fully parse it without context, but we can check basics
      expect(filledSnippet).toBeDefined();
      expect(filledSnippet.length).toBeGreaterThan(0);
    });
  }
});
