# Versioning & Release Guide

This document describes the versioning and release process for `@asd/caddy-api-client`.

## Overview

We use:

- **[Semantic Versioning](https://semver.org/)** (MAJOR.MINOR.PATCH)
- **[Conventional Commits](https://www.conventionalcommits.org/)** for commit messages
- **[standard-version](https://github.com/conventional-changelog/standard-version)** for automated changelog generation and version bumping
- **GitHub Actions** for automated npm publishing

## Commit Message Format

Follow Conventional Commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature (bumps MINOR version)
- `fix`: Bug fix (bumps PATCH version)
- `docs`: Documentation changes only
- `refactor`: Code refactoring without functionality changes
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks
- `style`: Code style changes (formatting, etc.)

### Breaking Changes

For MAJOR version bumps, add `BREAKING CHANGE:` in the commit footer:

```
feat(api)!: change CaddyClient constructor signature

BREAKING CHANGE: CaddyClient now requires options object instead of individual parameters.
Migration: Replace `new CaddyClient(url)` with `new CaddyClient({ adminUrl: url })`
```

### Examples

```bash
feat(caddy): add support for load balancer health checks
fix(mitm): resolve port conflict in MITMproxy startup
docs(readme): update installation instructions
refactor(types): simplify route builder options
perf(client): cache route validation results
```

## Release Process

### 1. Preview Next Release

Preview what will change without making any commits:

```bash
just release-dry
# or
bun run release:dry
```

This shows:

- Next version number
- Changelog preview
- Files that will be modified

### 2. Create Release

#### Automatic Version (Recommended)

Let standard-version determine the version based on commits:

```bash
just release
# or
bun run release
```

This will:

1. Run all checks (lint, typecheck, tests)
2. Analyze commits since last release
3. Bump version in `package.json`
4. Generate/update `CHANGELOG.md`
5. Create git commit: `chore(release): v0.2.0`
6. Create git tag: `v0.2.0`

#### Manual Version Override

Force a specific version type:

```bash
# Bump minor version (0.1.0 → 0.2.0)
just release-minor
# or
bun run release:minor

# Bump major version (0.1.0 → 1.0.0)
just release-major
# or
bun run release:major
```

#### First Release

For the initial release (creates CHANGELOG without version bump):

```bash
just release-first
# or
bun run release:first
```

### 3. Review Changes

Before pushing, review the release commit:

```bash
git show HEAD
git log --oneline -5
cat CHANGELOG.md
```

### 4. Push to GitHub

Push both the commit and tag:

```bash
# Push to main branch with tags
git push --follow-tags origin main
```

### 5. Automated Publishing

GitHub Actions will automatically:

1. Detect the new version tag (`v*.*.*`)
2. Run all checks and tests
3. Build the package
4. Publish to npm registry
5. Create GitHub Release with notes

Monitor the workflow at:

```
https://github.com/asd-engineering/asd-caddy-api-client/actions
```

## Package Verification

Before releasing, verify package contents:

```bash
# Verify what will be included in the package
just verify-package
# or
bun run verify:pack

# Test actual publish (dry-run, no upload)
just publish-dry
# or
bun run verify:publish
```

## Version Rollback

### Before Pushing to GitHub

If you made a mistake before pushing:

```bash
# Undo the release commit and tag
git reset --hard HEAD~1
git tag -d v0.2.0
```

### After Publishing to npm

**Within 24 hours:**

```bash
# Unpublish specific version (only works within 24h)
npm unpublish @asd/caddy-api-client@0.2.0
```

**After 24 hours:**

You cannot unpublish. Instead, publish a new patch version with fixes:

```bash
# Fix the issue
git commit -m "fix: resolve critical issue in v0.2.0"

# Create new patch release
just release
# This creates v0.2.1

git push --follow-tags origin main
```

## Version Source of Truth

- **Single source**: `package.json` version field
- **Auto-synced**: `src/index.ts` imports `VERSION` from `package.json`
- **Never edit manually**: Always use `bun run release` to bump versions

```typescript
// src/index.ts (auto-synced)
import pkg from "../package.json" with { type: "json" };
export const VERSION = pkg.version;
```

## Pre-publish Checks

The `prepublishOnly` script runs automatically before `npm publish`:

```json
"prepublishOnly": "bun run build && bun run test && bun run typecheck && bun run lint"
```

This ensures you never publish broken code.

## Troubleshooting

### "Working directory not clean"

Commit all changes before releasing:

```bash
git status
git add .
git commit -m "chore: prepare for release"
```

### "No commits since last release"

You need at least one conventional commit:

```bash
git commit --allow-empty -m "chore: trigger release"
```

### "npm ERR! 403 Forbidden"

Ensure you're logged in and have publish access:

```bash
npm login
npm whoami
```

Contact repo owner to add you to `@asd` npm organization.

### "GitHub Actions publish failed"

1. Check workflow logs in GitHub Actions tab
2. Verify `NPM_TOKEN` is set in repository secrets
3. Ensure token has publish permissions

## Reference

### Quick Commands

```bash
# Development
just release-dry        # Preview next release
just verify-package     # Verify package contents

# Releasing
just release           # Create patch release (0.1.0 → 0.1.1)
just release-minor     # Create minor release (0.1.0 → 0.2.0)
just release-major     # Create major release (0.1.0 → 1.0.0)
just release-first     # First release (initialize CHANGELOG)

# After release
git push --follow-tags origin main  # Push and trigger npm publish
```

### npm Package Scopes

- Package name: `@asd/caddy-api-client`
- Registry: `https://registry.npmjs.org/`
- Access: **public** (configured in `package.json`)
- Provenance: Enabled (cryptographic build attestation via GitHub Actions)

### Changelog Generation

standard-version auto-generates `CHANGELOG.md` from commit messages:

- Groups commits by type (Features, Bug Fixes, etc.)
- Links to commits and PRs
- Follows [Keep a Changelog](https://keepachangelog.com/) format
- Configured in `.versionrc.json`

## First-Time Setup

### For Repository Owner

1. **Create npm account** (if not exists):

   ```bash
   npm adduser
   ```

2. **Create npm organization** `@asd` (if not exists):

   ```
   https://www.npmjs.com/org/create
   ```

3. **Generate npm token**:

   ```bash
   npm login
   npm token create --cidr=0.0.0.0/0
   ```

   Copy the token.

4. **Add to GitHub Secrets**:
   - Go to: Repository → Settings → Secrets → Actions
   - Add secret: `NPM_TOKEN` = `<your-token>`

5. **Enable GitHub Pages**:
   - Go to: Repository → Settings → Pages
   - Source: Deploy from branch `gh-pages`
   - Wait for first docs workflow to run

### For Contributors

1. Install dependencies:

   ```bash
   bun install
   ```

2. Set up git hooks:

   ```bash
   bun run prepare
   ```

3. Learn commit message format:
   - Read: https://www.conventionalcommits.org/
   - Use: `feat:`, `fix:`, `docs:`, etc.

## License

See [LICENSE](./LICENSE) (MIT).
