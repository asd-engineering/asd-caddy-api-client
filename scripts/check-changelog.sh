#!/bin/bash
#
# check-changelog.sh - Ensures CHANGELOG is updated when version changes
#
# This script checks if package.json version was modified and if so,
# requires that CHANGELOG.md was also modified in the same commit.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check a specific package
check_package() {
  local pkg_path="$1"
  local changelog_path="$2"
  local name="$3"

  # Get staged changes
  local pkg_changed=$(git diff --cached --name-only | grep -E "^${pkg_path}$" || true)
  local changelog_changed=$(git diff --cached --name-only | grep -E "^${changelog_path}$" || true)

  if [ -n "$pkg_changed" ]; then
    # Check if version field specifically changed
    local version_changed=$(git diff --cached "$pkg_path" | grep -E '^\+.*"version"' || true)

    if [ -n "$version_changed" ]; then
      if [ -z "$changelog_changed" ]; then
        echo -e "${RED}❌ ${name} version changed but CHANGELOG.md was not updated${NC}"
        echo ""
        echo "  Version change detected in: $pkg_path"
        echo "  Please update: $changelog_path"
        echo ""
        echo "  Add an entry for the new version following Keep a Changelog format:"
        echo "  https://keepachangelog.com/en/1.1.0/"
        echo ""
        return 1
      else
        echo -e "${GREEN}✓ ${name} version and CHANGELOG both updated${NC}"
      fi
    fi
  fi

  return 0
}

echo "Checking changelog updates..."

# Track if any check failed
failed=0

# Check main library
if ! check_package "package.json" "CHANGELOG.md" "Main library"; then
  failed=1
fi

# Check VSCode extension
if ! check_package "vscode-extension/package.json" "vscode-extension/CHANGELOG.md" "VSCode extension"; then
  failed=1
fi

if [ $failed -eq 1 ]; then
  echo ""
  echo -e "${YELLOW}Tip: To bypass this check (not recommended), use: git commit --no-verify${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Changelog check passed${NC}"
