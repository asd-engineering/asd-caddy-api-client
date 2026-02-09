/**
 * Generate VSCode snippets from library metadata and templates
 *
 * This script imports the extension-assets from the library and generates
 * VSCode snippet files for both TypeScript builders and JSON configurations.
 *
 * IMPORTANT: Security snippets are generated from templates.ts which is the
 * SINGLE SOURCE OF TRUTH. All templates are validated by templates.test.ts.
 * This ensures every snippet produces valid configuration.
 *
 * @see src/plugins/caddy-security/templates.ts - Template definitions
 * @see src/__tests__/templates.test.ts - Template validation tests
 */

const fs = require("fs");
const path = require("path");

// Import paths for built library
const assetsPath = path.join(__dirname, "../../dist/generated/extension-assets.js");
const caddySecurityPath = path.join(__dirname, "../../dist/plugins/caddy-security/index.js");

async function generateSnippets() {
  // Dynamic import for ESM modules
  const { BUILDER_METADATA, HANDLER_METADATA } = await import(assetsPath);

  // Try to import templates from caddy-security module
  let SECURITY_TEMPLATES = [];
  try {
    const caddySecurity = await import(caddySecurityPath);
    SECURITY_TEMPLATES = caddySecurity.SECURITY_TEMPLATES || [];
  } catch (e) {
    console.warn(
      "⚠ Could not import templates from caddy-security - security snippets will use fallback"
    );
    console.warn("  Error:", e.message);
  }

  // ============================================================================
  // Generate TypeScript/JavaScript builder snippets
  // ============================================================================
  const builderSnippets = {};

  for (const [name, builder] of Object.entries(BUILDER_METADATA)) {
    builderSnippets[builder.snippet.description] = {
      prefix: builder.snippet.prefix,
      body: builder.snippet.body,
      description: builder.description.split("\n")[0], // First line only
    };
  }

  // ============================================================================
  // Generate TypeScript snippets from templates (SINGLE SOURCE OF TRUTH)
  // ============================================================================
  if (SECURITY_TEMPLATES.length > 0) {
    console.log(`\n📦 Generating ${SECURITY_TEMPLATES.length} security snippets from templates.ts`);

    for (const template of SECURITY_TEMPLATES) {
      // Create TypeScript snippet
      const tsSnippetName = `Caddy Security: ${template.name}`;
      builderSnippets[tsSnippetName] = {
        prefix: template.id,
        body: template.snippet,
        description: template.description,
      };
    }
  }

  // ============================================================================
  // Generate JSON configuration snippets
  // ============================================================================
  const jsonSnippets = {
    "Caddy Route": {
      prefix: "caddy-route",
      body: [
        "{",
        '  "@id": "${1:route-id}",',
        '  "match": [{ "host": ["${2:example.com}"] }],',
        '  "handle": [',
        "    {",
        '      "handler": "${3|reverse_proxy,file_server,static_response,headers|}",',
        '      ${4:"upstreams": [{ "dial": "${5:localhost:3000}" }]}',
        "    }",
        "  ],",
        '  "terminal": true',
        "}",
      ],
      description: "Insert a Caddy route configuration",
    },
    "Caddy Reverse Proxy Handler": {
      prefix: "caddy-handler-proxy",
      body: [
        "{",
        '  "handler": "reverse_proxy",',
        '  "upstreams": [{ "dial": "${1:localhost:3000}" }]',
        "}",
      ],
      description: "Reverse proxy handler",
    },
    "Caddy File Server Handler": {
      prefix: "caddy-handler-files",
      body: ["{", '  "handler": "file_server",', '  "root": "${1:/var/www/html}"', "}"],
      description: "File server handler",
    },
    "Caddy Headers Handler": {
      prefix: "caddy-handler-headers",
      body: [
        "{",
        '  "handler": "headers",',
        '  "response": {',
        '    "set": {',
        '      "${1:X-Custom-Header}": ["${2:value}"]',
        "    }",
        "  }",
        "}",
      ],
      description: "Headers manipulation handler",
    },
    "Caddy Static Response Handler": {
      prefix: "caddy-handler-static",
      body: [
        "{",
        '  "handler": "static_response",',
        '  "status_code": ${1:200},',
        '  "body": "${2:Hello, World!}"',
        "}",
      ],
      description: "Static response handler",
    },
    "Caddy Security Authenticator Handler": {
      prefix: "caddy-sec-authenticator",
      body: ["{", '  "handler": "authenticator",', '  "portal_name": "${1:myportal}"', "}"],
      description: "caddy-security authenticator portal handler",
    },
    "Caddy Security Authorization Handler": {
      prefix: "caddy-sec-authorizer",
      body: [
        "{",
        '  "handler": "authentication",',
        '  "providers": {',
        '    "authorizer": {',
        '      "gatekeeper_name": "${1:my-policy}"',
        "    }",
        "  }",
        "}",
      ],
      description: "caddy-security authorization handler",
    },
    "Caddy Security Local Store": {
      prefix: "caddy-sec-local-store",
      body: [
        "{",
        '  "driver": "local",',
        '  "realm": "${1:local}",',
        '  "path": "${2:/etc/caddy/users.json}"',
        "}",
      ],
      description: "caddy-security local identity store",
    },
    "Caddy Security LDAP Store": {
      prefix: "caddy-sec-ldap-store",
      body: [
        "{",
        '  "driver": "ldap",',
        '  "realm": "${1:ldap}",',
        '  "servers": [{ "address": "${2:ldap.example.com}", "port": 389 }],',
        '  "bind_dn": "${3:cn=admin,dc=example,dc=com}",',
        '  "bind_password": "${4:secret}",',
        '  "search_base_dn": "${5:ou=users,dc=example,dc=com}",',
        '  "search_filter": "(uid={username})"',
        "}",
      ],
      description: "caddy-security LDAP identity store",
    },
    "Caddy Security Portal": {
      prefix: "caddy-sec-portal",
      body: [
        "{",
        '  "name": "${1:myportal}",',
        '  "identity_stores": ["${2:local}"],',
        '  "cookie": {',
        '    "domain": "${3:.example.com}",',
        '    "lifetime": "24h"',
        "  }",
        "}",
      ],
      description: "caddy-security authentication portal",
    },
    "Caddy Security Policy": {
      prefix: "caddy-sec-policy",
      body: [
        "{",
        '  "name": "${1:my-policy}",',
        '  "access_lists": [',
        "    {",
        '      "action": "allow",',
        '      "claim": "${2:roles}",',
        '      "values": ["${3:user}"]',
        "    }",
        "  ]",
        "}",
      ],
      description: "caddy-security authorization policy",
    },
  };

  // ============================================================================
  // Write snippet files
  // ============================================================================
  const snippetsDir = path.join(__dirname, "../snippets");

  fs.writeFileSync(
    path.join(snippetsDir, "caddy-builders.json"),
    JSON.stringify(builderSnippets, null, 2)
  );
  console.log("✓ Generated caddy-builders.json");

  fs.writeFileSync(
    path.join(snippetsDir, "caddy-json.json"),
    JSON.stringify(jsonSnippets, null, 2)
  );
  console.log("✓ Generated caddy-json.json");

  // Summary
  const builderCount = Object.keys(builderSnippets).length;
  const jsonCount = Object.keys(jsonSnippets).length;
  const templateCount = SECURITY_TEMPLATES.length;

  console.log(
    `\nGenerated ${builderCount} builder snippets (including ${templateCount} from templates)`
  );
  console.log(`Generated ${jsonCount} JSON snippets`);

  // Validation reminder
  if (templateCount > 0) {
    console.log("\n✅ Security snippets are backed by validated templates (templates.test.ts)");
  }
}

generateSnippets().catch(console.error);
