# Justfile for @accelerated-software-development/caddy-api-client

# ASD@latest
import? ".asd/cli.just"

export DOTENV_SOURCES := ".env.example .asd/workspace/.env.asd"
set dotenv-load

ASD_INIT := `if [ -d ".asd/.git" ] || [ -f ".asd/cli.just" ]; then echo 1; else echo 0; fi`

# Default recipe - show available commands
default:
    @just --list

# Initialize ASD submodule
all:
	@echo "→ Checking ASD submodule..."
	@if [ {{ASD_INIT}} -eq 0 ]; then \
		echo "⚙️  Initializing .asd submodule..."; \
		rm -rf .asd; \
		git submodule update --init --recursive .asd || exit 1; \
		echo "✅  Submodule initialized. Please rerun your last command."; \
	else \
		echo "✅  ASD submodule already initialized."; \
		if [ ! -f ".asd/cli.just" ]; then \
			echo "⚠️  Missing .asd content. Re-initializing..."; \
			rm -rf .asd; \
			git submodule update --init --recursive .asd || exit 1; \
			echo "✅  Submodule re-initialized. Please rerun your last command."; \
		else \
			just asd init env-merge; \
		fi \
	fi

# Install dependencies
install:
    bun install

# Build the package
build:
    bun run build

# Start, run, stop entire test suite
test-all: test-infra-up test test-integration test-infra-down

# Run tests
test:
    bun run test

# Run tests in watch mode
test-watch:
    bun run test:watch

# Run tests with coverage
test-coverage:
    bun run test:coverage

# Run integration tests (requires Caddy running)
test-integration:
    #!/usr/bin/env bash
    set -e
    echo "🔍 Checking if Caddy is running..."
    if ! curl -s http://127.0.0.1:2019 > /dev/null 2>&1; then
        echo "⚠️  Caddy not running. Starting with docker compose..."
        docker compose -f docker-compose.test.yml up -d
        echo "⏳ Waiting for Caddy to start..."
        sleep 2
    fi
    echo ""
    echo "🧪 Running integration tests..."
    bun run test:integration
    echo ""
    echo "✅ Integration tests completed!"

# Update integration test snapshots (Caddy config fixtures)
test-integration-update-snapshots:
    #!/usr/bin/env bash
    set -e
    echo "🔍 Checking if Caddy is running..."
    if ! curl -s http://127.0.0.1:2019 > /dev/null 2>&1; then
        echo "⚠️  Caddy not running. Starting with docker compose..."
        docker compose -f docker-compose.test.yml up -d
        echo "⏳ Waiting for Caddy to start..."
        sleep 2
    fi
    echo ""
    echo "📸 Running integration tests with UPDATE_SNAPSHOTS=true..."
    UPDATE_SNAPSHOTS=true bun run test:integration
    echo ""
    echo "✅ Snapshots updated in src/__tests__/integration/__fixtures__/"
    echo "   Review the changes and commit if correct."

# Start test infrastructure (Caddy + backends)
test-infra-up:
    docker compose -f docker-compose.test.yml up -d
    @echo "✅ Test infrastructure started"
    @echo "   Caddy Admin API: http://127.0.0.1:2019"
    @echo "   Echo server: http://127.0.0.1:5678"

# Stop test infrastructure
test-infra-down:
    docker compose -f docker-compose.test.yml down
    @echo "✅ Test infrastructure stopped"

# Type check
typecheck:
    bun run typecheck

# Lint code
lint:
    bun run lint

# Format code
format:
    bun run format

# Check formatting without fixing
format-check:
    bun run format:check

# Run all quality checks (format-check, lint, typecheck, test)
check:
    #!/usr/bin/env bash
    set -e
    echo "🔍 Running format check..."
    bun run format:check
    echo ""
    echo "🔍 Running linter..."
    bun run lint
    echo ""
    echo "🔍 Running type check..."
    bun run typecheck
    echo ""
    echo "🧪 Running tests..."
    bun run test
    echo ""
    echo "✅ All checks passed!"

# Link package locally for testing
link:
    #!/usr/bin/env bash
    set -e
    echo "📦 Building package..."
    bun run build
    echo ""
    echo "🔗 Linking package globally..."
    bun link
    echo ""
    echo "✅ Package linked! Use 'bun link @accelerated-software-development/caddy-api-client' in other projects."
    echo ""
    echo "To test in .asd project:"
    echo "  cd .asd"
    echo "  bun link @accelerated-software-development/caddy-api-client"

# Unlink package
unlink:
    bun unlink

# Preview next release (dry-run)
release-dry:
    #!/usr/bin/env bash
    set -e
    echo "🔍 Preview of next release (dry-run)..."
    echo ""
    bun run release:dry
    echo ""
    echo "✅ Preview completed. No changes made."

# Create a new release (patch version)
release:
    #!/usr/bin/env bash
    set -e
    echo "📦 Creating new release (patch)..."
    echo ""
    echo "This will:"
    echo "  1. Run all checks (lint, typecheck, tests)"
    echo "  2. Bump version in package.json"
    echo "  3. Generate CHANGELOG.md"
    echo "  4. Create git commit and tag"
    echo ""
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Release cancelled"
        exit 1
    fi
    echo ""
    bun run release
    echo ""
    echo "✅ Release created!"
    echo ""
    echo "Next steps:"
    echo "  1. Review the changes: git show HEAD"
    echo "  2. Push to GitHub: git push --follow-tags origin main"
    echo "  3. GitHub Actions will auto-publish to npm"

# Create minor version release
release-minor:
    #!/usr/bin/env bash
    set -e
    echo "📦 Creating minor version release..."
    bun run release:minor

# Create major version release
release-major:
    #!/usr/bin/env bash
    set -e
    echo "📦 Creating major version release..."
    bun run release:major

# First release (initializes CHANGELOG without bumping from 0.1.0)
release-first:
    #!/usr/bin/env bash
    set -e
    echo "📦 Creating first release..."
    bun run release:first

# Verify package contents before publishing
verify-package:
    #!/usr/bin/env bash
    set -e
    echo "🔍 Verifying package contents..."
    echo ""
    bun run build
    echo ""
    echo "📦 Package contents (npm pack --dry-run):"
    bun run verify:pack
    echo ""
    echo "✅ Verification complete!"

# Publish to NPM (dry-run by default)
publish-dry:
    #!/usr/bin/env bash
    set -e
    echo "🔍 Running all checks..."
    just check
    echo ""
    echo "📦 Dry-run publish..."
    npm publish --dry-run
    echo ""
    echo "✅ Dry-run completed! Package is ready to publish."
    echo ""
    echo "To publish for real, run: just publish"

# Publish to NPM (requires npm login)
publish:
    #!/usr/bin/env bash
    set -e
    echo "⚠️  Publishing to NPM registry..."
    echo ""
    read -p "Are you sure you want to publish? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Publish cancelled"
        exit 1
    fi
    echo ""
    echo "🔍 Running all checks..."
    just check
    echo ""
    echo "📦 Publishing to NPM..."
    npm publish
    echo ""
    echo "✅ Published successfully!"

# Clean build artifacts
clean:
    rm -rf dist coverage

# Clean everything including node_modules
clean-all:
    rm -rf dist coverage node_modules

# Clean and reinstall
clean-install: clean-all install

# Development mode (watch and rebuild)
dev:
    bun run dev

# Run example scripts
example script:
    bun run examples/{{script}}.ts

# Show package info
info:
    #!/usr/bin/env bash
    echo "Package: @accelerated-software-development/caddy-api-client"
    echo "Version: $(cat package.json | grep '"version"' | cut -d'"' -f4)"
    echo ""
    echo "Build outputs:"
    ls -lh dist/ 2>/dev/null | grep -E '\.(js|d\.ts)$' | awk '{print "  " $9, $5}' || echo "  No build files (run 'just build')"
    echo ""
    echo "Test status:"
    bun run test 2>&1 | tail -1 || echo "  Tests not run"

# Run all checks and build (CI mode)
ci: check build
    @echo "✅ CI checks completed successfully"

# Utility: git diff to log file
glog:
    git diff HEAD > git.log

# Utility: run Claude Code
claude:
    claude --allow-dangerously-skip-permissions

# VSCode Extension: run Playwright tests (headless)
vscode-test:
    cd vscode-extension && npm test

# VSCode Extension: run Playwright tests with visible browser
vscode-test-headed:
    cd vscode-extension && npx playwright test --headed

# VSCode Extension: run Playwright tests in debug mode
vscode-test-debug:
    cd vscode-extension && npx playwright test --debug

# VSCode Extension: build and package
vscode-build:
    cd vscode-extension && npm run package

# VSCode Extension: install in local VSCode
vscode-install: vscode-build
    #!/usr/bin/env bash
    set -e
    VSIX=$(ls -t vscode-extension/vscode-caddy-tools-*.vsix | head -1)
    echo "📦 Installing ASD Caddy Configuration Tools extension..."
    echo "   Publisher: asd-host (Accelerated Software Development B.V.)"
    echo "   Package:   $VSIX"
    echo ""
    code --install-extension "$VSIX" --force
    echo ""
    echo "✅ Extension installed! Restart VS Code or reload window to activate."
    echo "   Open any .caddy.json file to see IntelliSense, validation, and snippets."

# MITMproxy demo: just demo start|stop|url
[no-cd]
demo action:
    #!/usr/bin/env bash
    cd demo
    case "{{action}}" in
        start)
            docker compose up -d --build
            echo 'Waiting for services...'
            sleep 30
            echo ''
            echo '======================================================================'
            echo 'MITMproxy Traffic Inspection Demo'
            echo '======================================================================'
            echo ''
            echo 'Open this URL in your browser:'
            echo ''
            echo '   http://localhost:9080/dashboard'
            echo ''
            echo '======================================================================'
            ;;
        stop)  docker compose down -v ;;
        url)   echo 'http://localhost:9080/dashboard' ;;
        *)     echo "Usage: just demo [start|stop|url]" ;;
    esac
