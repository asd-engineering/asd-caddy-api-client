# Justfile for @asd/caddy-api-client

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

# Run tests
test:
    bun run test

# Run tests in watch mode
test-watch:
    bun run test:watch

# Run tests with coverage
test-coverage:
    bun run test:coverage

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
    echo "✅ Package linked! Use 'bun link @asd/caddy-api-client' in other projects."
    echo ""
    echo "To test in .asd project:"
    echo "  cd .asd"
    echo "  bun link @asd/caddy-api-client"

# Unlink package
unlink:
    bun unlink

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
    echo "Package: @asd/caddy-api-client"
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
