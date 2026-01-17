#!/usr/bin/env bash
#
# Fix workspace:* dependencies before publishing
#
# This script replaces "workspace:*" with actual version numbers
# in all package.json files. Required because bun workspaces use
# workspace:* protocol which npm doesn't understand.
#
# Usage: ./scripts/fix-workspace-deps.sh [--restore]
#
# Compatible with bash 3.2+ (macOS default)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Package directories in dependency order
PACKAGES=(
  "packages/core"
  "packages/adapters/openai"
  "packages/adapters/anthropic"
  "packages/adapters/vercel-ai"
  "packages/redteam"
  "packages/reports"
  "packages/cli"
)

# Function to get version from package.json
get_version() {
  local pkg_dir="$1"
  grep '"version"' "$ROOT_DIR/$pkg_dir/package.json" | head -1 | sed 's/.*: "\(.*\)".*/\1/'
}

# Function to get package name from package.json
get_name() {
  local pkg_dir="$1"
  grep '"name"' "$ROOT_DIR/$pkg_dir/package.json" | head -1 | sed 's/.*: "\(.*\)".*/\1/'
}

# Restore mode - revert to workspace:*
if [ "$1" = "--restore" ]; then
  echo -e "${BLUE}Restoring workspace:* dependencies...${NC}"

  for pkg_dir in "${PACKAGES[@]}"; do
    pkg_json="$ROOT_DIR/$pkg_dir/package.json"
    if [ -f "$pkg_json" ]; then
      # Replace any @artemiskit/* version back to workspace:*
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/"\(@artemiskit\/[^"]*\)": "[0-9][^"]*"/"\1": "workspace:*"/g' "$pkg_json"
      else
        sed -i 's/"\(@artemiskit\/[^"]*\)": "[0-9][^"]*"/"\1": "workspace:*"/g' "$pkg_json"
      fi
    fi
  done

  echo -e "${GREEN}✓ Restored workspace:* dependencies${NC}"
  exit 0
fi

echo -e "${BLUE}Fixing workspace:* dependencies...${NC}"
echo ""

# Build version arrays (bash 3.2 compatible - no associative arrays)
# We use two parallel arrays: PKG_NAMES and PKG_VERSIONS
PKG_NAMES=()
PKG_VERSIONS=()

for pkg_dir in "${PACKAGES[@]}"; do
  name=$(get_name "$pkg_dir")
  version=$(get_version "$pkg_dir")
  PKG_NAMES+=("$name")
  PKG_VERSIONS+=("$version")
  echo -e "  ${name}: ${version}"
done

echo ""

# Function to get version by package name (bash 3.2 compatible lookup)
get_version_for_pkg() {
  local search_name="$1"
  local i=0
  for name in "${PKG_NAMES[@]}"; do
    if [ "$name" = "$search_name" ]; then
      echo "${PKG_VERSIONS[$i]}"
      return 0
    fi
    i=$((i + 1))
  done
  echo ""
}

# Replace workspace:* with actual versions in each package
for pkg_dir in "${PACKAGES[@]}"; do
  pkg_json="$ROOT_DIR/$pkg_dir/package.json"
  pkg_name=$(get_name "$pkg_dir")

  if [ -f "$pkg_json" ]; then
    echo -e "${YELLOW}Processing $pkg_name...${NC}"

    # Replace each @artemiskit dependency
    for dep_name in "${PKG_NAMES[@]}"; do
      dep_version=$(get_version_for_pkg "$dep_name")

      if [ -n "$dep_version" ]; then
        # Use different sed syntax for macOS vs Linux
        if [[ "$OSTYPE" == "darwin"* ]]; then
          sed -i '' "s|\"$dep_name\": \"workspace:\*\"|\"$dep_name\": \"$dep_version\"|g" "$pkg_json"
        else
          sed -i "s|\"$dep_name\": \"workspace:\*\"|\"$dep_name\": \"$dep_version\"|g" "$pkg_json"
        fi
      fi
    done
  fi
done

echo ""
echo -e "${GREEN}✓ Fixed all workspace:* dependencies${NC}"
echo ""
echo -e "${YELLOW}Note: Run './scripts/fix-workspace-deps.sh --restore' after publishing to revert.${NC}"
