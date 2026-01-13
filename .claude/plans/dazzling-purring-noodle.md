# VSCode Extension Testing Plan

## Goal

Test the VSCode extension (vscode-caddy-tools) using code-server and Playwright to verify:

1. Extension loads correctly
2. Snippets work
3. Completions appear for handler types
4. Hover documentation shows
5. Code lens appears above handlers
6. Diagnostics highlight validation errors

## Approach: Playwright Only

Pure Playwright tests that:

1. Start code-server with extension pre-installed
2. Open code-server in browser
3. Create/open test files
4. Verify extension features via UI interactions

## Implementation Steps

### Step 1: Add Package Script

Update `vscode-extension/package.json`:

```json
"scripts": {
  "package": "vsce package --no-dependencies"
}
```

### Step 2: Create Playwright Test Config

**File**: `vscode-extension/playwright.config.ts`

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  use: {
    baseURL: process.env.CODESERVER_URL || "http://localhost:8443",
  },
});
```

### Step 3: Create Test Fixtures

**File**: `vscode-extension/tests/fixtures.ts`

```typescript
import { test as base, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";

// Custom fixture that manages code-server lifecycle
export const test = base.extend<{
  codeServer: { url: string; process: ChildProcess };
}>({
  codeServer: async ({}, use) => {
    // Start code-server with extension
    // ... lifecycle management
    await use({ url, process });
    // Cleanup
  },
});
```

### Step 4: Create Test File

**File**: `vscode-extension/tests/extension.spec.ts`

```typescript
import { test, expect } from "./fixtures";

test.describe("Caddy Extension", () => {
  test("extension activates", async ({ page, codeServer }) => {
    await page.goto(codeServer.url);
    // Wait for editor to load
    await page.waitForSelector(".monaco-editor");
    // Check extension is active via Extensions view
  });

  test("handler completions appear", async ({ page, codeServer }) => {
    // Create new .caddy.json file
    // Type "handler": "
    // Verify completion list shows reverse_proxy, file_server, etc.
  });

  test("hover shows documentation", async ({ page, codeServer }) => {
    // Open file with handler
    // Hover over "reverse_proxy"
    // Verify hover shows "Reverse Proxy" and Caddy docs link
  });

  test("code lens shows docs link", async ({ page, codeServer }) => {
    // Open file with handler definition
    // Verify 📖 Docs link appears above handler
  });

  test("snippets expand correctly", async ({ page, codeServer }) => {
    // Open new .ts file
    // Type "caddy-route" and trigger expansion
    // Verify snippet expands with placeholders
  });

  test("diagnostics show validation errors", async ({ page, codeServer }) => {
    // Open invalid .caddy.json
    // Verify error squiggles appear
  });
});
```

### Step 5: Add Test Script

**File**: `vscode-extension/package.json`

```json
"scripts": {
  "test": "playwright test",
  "test:headed": "playwright test --headed"
}
```

## Critical Files to Create

| File                                                   | Purpose                          |
| ------------------------------------------------------ | -------------------------------- |
| `vscode-extension/playwright.config.ts`                | Playwright configuration         |
| `vscode-extension/tests/fixtures.ts`                   | Code-server lifecycle management |
| `vscode-extension/tests/extension.spec.ts`             | All extension tests              |
| `vscode-extension/tests/test-files/valid.caddy.json`   | Test fixture                     |
| `vscode-extension/tests/test-files/invalid.caddy.json` | Test fixture                     |

## Test Scenarios

| Test                 | What it verifies                                             |
| -------------------- | ------------------------------------------------------------ |
| Extension Activation | Extension loads without console errors                       |
| Handler Completions  | `"handler": "` triggers completion list with 21 handlers     |
| Hover Documentation  | Hovering handler shows displayName + description + docs link |
| Code Lens            | `📖 Reverse Proxy Docs` appears above handler definitions    |
| Snippets (JSON)      | `caddy-route` expands to route template                      |
| Snippets (TS)        | `buildLocalIdentityStore` expands with params                |
| Diagnostics          | Invalid handler type shows error                             |

## Verification Steps

```bash
# 1. Install code-server (if not installed)
just asd codeserver-install-linux

# 2. Build and package extension
cd vscode-extension
npm run build
npm run package

# 3. Install extension in code-server
../.asd/workspace/code/code-server/bin/code-server \
  --install-extension ./vscode-caddy-tools-0.1.0.vsix \
  --extensions-dir ../.asd/workspace/code/data/extensions

# 4. Run tests
npm test

# 5. Run with visible browser (debugging)
npm run test:headed
```

## Dependencies to Add

```bash
cd vscode-extension
npm install -D @playwright/test
npx playwright install chromium
```

---

## Phase 6: Bidirectional Feedback Loop (Document in local/todo.md)

When implementation is complete, add this to `local/todo.md`:

```markdown
## Priority 6: Feedback Loop (Phase 6)

- [ ] **Track snippet usage analytics**
  - Which snippets are used most → prioritize documentation
  - Identify underused features → improve discoverability

- [ ] **Identify missing annotations**
  - Find builders without `@default` JSDoc → add to library
  - Find handlers without descriptions → add to types.ts

- [ ] **Collect error patterns**
  - Common validation errors → improve error messages
  - Frequently misconfigured fields → add better defaults

- [ ] **Create issue templates**
  - Extension bug reports
  - Feature requests
  - Documentation improvements
```

This phase is ongoing maintenance, not code development.

---

## Documentation Updates

### Create `docs/vscode-extension/DEVELOPMENT.md`

Document the extension development workflow:

```markdown
# VSCode Extension Development

## Architecture

The extension follows a **synergy architecture** where it imports metadata from the library:

\`\`\`
asd-caddy-api-client/
├── src/generated/extension-assets.ts # Exported metadata
├── src/generated/schemas/\*.json # JSON Schemas
└── vscode-extension/ # Thin UI layer
├── src/providers/ # VSCode providers
└── src/wizards/ # Configuration wizards
\`\`\`

## Build Pipeline

\`\`\`bash

# 1. Generate metadata from library

npm run generate:extension

# 2. Generate JSON schemas

npm run generate:json-schemas

# 3. Build extension

cd vscode-extension && npm run build

# 4. Package for distribution

npm run package
\`\`\`

## Testing

### Running Tests

\`\`\`bash

# Install dependencies

npm install -D @playwright/test
npx playwright install chromium

# Run tests

npm test

# Run with visible browser

npm run test:headed
\`\`\`

### Test Coverage

- Extension activation
- Handler completions (21 handlers)
- Hover documentation
- Code lens (📖 Docs links)
- Snippets (41 builders + 11 JSON)
- Diagnostics (validation errors)

## Adding New Features

### Adding a New Builder

1. Add function with JSDoc to `src/plugins/*/builders.ts`
2. Run `npm run generate:extension`
3. Snippet auto-generated in extension

### Adding a New Handler

1. Add type to `src/types.ts` and `CaddyRouteHandler` union
2. Add handler info to `scripts/extract-metadata.ts`
3. Run `npm run generate:extension`
```

### Update `AGENTS.md`

Already updated with synergy architecture documentation.
