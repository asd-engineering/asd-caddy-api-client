# VSCode Extension Development Guide

This document describes how to develop, test, and debug the Caddy Configuration Tools VSCode extension.

## Architecture Overview

The extension follows a **thin layer** architecture where most logic is derived from the main library:

```
asd-caddy-api-client (library)
    ├── src/generated/extension-assets.ts  ← Auto-generated metadata
    ├── schemas/*.json                      ← JSON Schemas from Zod
    └── exports: ./extension-assets, ./schemas

vscode-extension (thin UI layer)
    ├── src/providers/                      ← Uses imported metadata
    ├── src/wizards/                         ← Uses imported schemas
    └── imports from library
```

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- code-server (for testing) - installed via `.asd`

### Initial Setup

```bash
# From project root
npm install

# Build the library and generate extension assets
npm run generate:all

# Build the extension
cd vscode-extension
npm install
npm run build
```

### Development Workflow

1. **Make changes to library** (builders, schemas, types)
2. **Regenerate assets**: `npm run generate:extension`
3. **Rebuild extension**: `cd vscode-extension && npm run build`
4. **Test**: `npm test` (runs Playwright tests)

## Testing

### Test Infrastructure

The extension uses **Playwright** with **code-server** for browser-based testing. This approach:

- Tests the actual extension in a real editor environment
- Verifies all UI interactions work correctly
- Catches issues that unit tests would miss

### Test Files

```
vscode-extension/tests/
├── extension.spec.ts      # Main test file
├── fixtures.ts            # Test utilities and helpers
├── global-setup.ts        # Starts code-server before tests
├── global-teardown.ts     # Stops code-server after tests
├── test-files/            # Test fixture files
│   ├── valid.caddy.json
│   └── invalid.caddy.json
└── playwright.config.ts   # Playwright configuration
```

### Running Tests

```bash
cd vscode-extension

# Run all tests (headless)
npm test

# Run tests with visible browser
npm run test:headed

# Run tests in debug mode
npm run test:debug
```

### Test Coverage

The test suite covers:

| Feature                | Test                                    |
| ---------------------- | --------------------------------------- |
| Extension activation   | Verifies extension loads without errors |
| Handler completions    | Tests autocomplete for 21 handler types |
| Hover documentation    | Tests hover info for handlers           |
| Code lens              | Tests docs links above handlers         |
| JSON snippets          | Tests snippet expansion (41+ snippets)  |
| Diagnostics            | Tests validation error display          |
| Route wizard           | Tests wizard command availability       |
| Security wizard        | Tests security wizard command           |
| TypeScript completions | Tests builder function completions      |

### Code-Server Integration

Tests use code-server (browser-based VS Code) managed by the global setup:

1. **global-setup.ts**:
   - Checks for code-server binary (installs via `just asd codeserver-install-linux` if missing)
   - Builds and packages extension as `.vsix`
   - Installs extension in code-server
   - Starts code-server on a dynamic port
   - Writes port to `.codeserver-port` file

2. **fixtures.ts**:
   - Reads port from setup
   - Provides test utilities (`createFile`, `triggerCompletion`, etc.)

3. **global-teardown.ts**:
   - Kills code-server process
   - Cleans up temporary files

### Writing New Tests

```typescript
import { test, expect, createFile, triggerCompletion } from "./fixtures";

test("my new feature", async ({ page, codeServerUrl }) => {
  // Navigate to code-server
  await page.goto(codeServerUrl);
  await page.waitForSelector(".monaco-workbench", { timeout: 30000 });

  // Create a test file
  await createFile(page, "test.caddy.json", '{"handler": "');

  // Trigger completion
  await triggerCompletion(page);

  // Assert
  await expect(page.locator(".suggest-widget")).toBeVisible();
});
```

## Debugging

### Debug Extension in VS Code

1. Open `vscode-extension/` folder in VS Code
2. Press F5 to launch Extension Development Host
3. Set breakpoints in TypeScript files
4. Test features in the new window

### Debug Tests

```bash
# Run with Playwright inspector
npm run test:debug

# Run single test
npx playwright test -g "handler completions"

# Show browser during test
npm run test:headed
```

### View code-server Logs

```bash
# During test runs with DEBUG=true
DEBUG=true npm test
```

## Extension Features

### Providers

| Provider    | File                           | Purpose                   |
| ----------- | ------------------------------ | ------------------------- |
| Completion  | `src/providers/completion.ts`  | Handler autocomplete      |
| Hover       | `src/providers/hover.ts`       | Documentation on hover    |
| Code Lens   | `src/providers/codeLens.ts`    | Docs links above handlers |
| Diagnostics | `src/providers/diagnostics.ts` | Validation errors         |
| Snippets    | `src/providers/snippets.ts`    | Code snippets             |

### Wizards

| Wizard   | File                            | Purpose                    |
| -------- | ------------------------------- | -------------------------- |
| Route    | `src/wizards/routeWizard.ts`    | Interactive route creation |
| Security | `src/wizards/securityWizard.ts` | Security config wizard     |

### Commands

Registered commands (in `package.json`):

- `caddy.routeWizard` - Route Configuration Wizard
- `caddy.securityWizard` - Security Configuration Wizard
- `caddy.openDocs` - Open Caddy Documentation

## Build & Package

### Build Extension

```bash
cd vscode-extension
npm run build          # Compile TypeScript
npm run package        # Create .vsix file
```

### Install in code-server

```bash
# Via .asd
just asd codeserver-install-linux
just asd code start

# Manual install
code-server --install-extension vscode-caddy-tools-0.1.0.vsix
```

## Troubleshooting

### code-server not found

```bash
# Install via .asd
just asd codeserver-install-linux
```

### Extension not loading

1. Check extension is built: `npm run build`
2. Check extension is packaged: `npm run package`
3. Reinstall in code-server: see global-setup.ts

### Tests timing out

- Increase timeout in `playwright.config.ts`
- Check code-server is starting properly
- Run with `DEBUG=true` to see logs

### Schema validation not working

1. Regenerate schemas: `npm run generate:json-schemas`
2. Copy schemas: `npm run copy-schemas`
3. Rebuild: `npm run build`

## CI Integration

The tests can be run in CI:

```yaml
- name: Install code-server
  run: just asd codeserver-install-linux

- name: Run extension tests
  run: |
    cd vscode-extension
    npm test
```

## Related Documentation

- [VSCode Extension API](https://code.visualstudio.com/api)
- [Playwright Testing](https://playwright.dev/)
- [code-server](https://github.com/coder/code-server)
- [Extension Plan](/.claude/plans/) - Full implementation plan
