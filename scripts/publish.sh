#!/usr/bin/env bash
#
# ArtemisKit Publishing Script
#
# Usage: ./scripts/publish.sh [--dry-run] [--skip-tests] [--publish-only] [--preflight]
#
# Prerequisites:
#   - NPM_TOKEN or NPM_API_KEY in the environment or a local .env file
#   - Clean git working directory (or use --force)
#   - All packages buildable
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
DRY_RUN=false
SKIP_TESTS=false
SKIP_CHANGESET=false
PUBLISH_ONLY=false
PREFLIGHT_ONLY=false
FORCE=false
TEMP_NPM_CONFIG=""
PACKAGE_RELEASE=false

cleanup_release_resources() {
  # Publish credentials must never be left in a persistent npm configuration.
  if [ -n "$TEMP_NPM_CONFIG" ]; then
    rm -f "$TEMP_NPM_CONFIG"
    TEMP_NPM_CONFIG=""
  fi
}

trap cleanup_release_resources EXIT

setup_temporary_npm_config() {
  TEMP_NPM_CONFIG="$(mktemp "${TMPDIR:-/tmp}/artemiskit-npmrc.XXXXXX")"
  chmod 600 "$TEMP_NPM_CONFIG"
  printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_AUTH_TOKEN" >"$TEMP_NPM_CONFIG"
  export NPM_CONFIG_USERCONFIG="$TEMP_NPM_CONFIG"
}

run_npm_access_preflight() {
  echo "Verifying npm authentication..."
  NPM_USER="$(npm whoami 2>/dev/null || true)"
  if [ -z "$NPM_USER" ]; then
    echo -e "${RED}Error: npm authentication failed${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Authenticated as: $NPM_USER${NC}"

  echo "Package publish access is enforced by npm; no organization governance access is required."
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      PUBLISH_ONLY=true
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --skip-changeset)
      SKIP_CHANGESET=true
      shift
      ;;
    --publish-only)
      PUBLISH_ONLY=true
      shift
      ;;
    --package-release)
      PACKAGE_RELEASE=true
      shift
      ;;
    --preflight)
      PREFLIGHT_ONLY=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      echo "Usage: ./scripts/publish.sh [options]"
      echo ""
      echo "Options:"
      echo "  --dry-run        Plan committed versions without publishing, versioning or committing"
      echo "  --skip-tests     Skip running tests"
      echo "  --skip-changeset Skip changeset creation (use existing)"
      echo "  --publish-only   Publish already-versioned packages without creating a changeset"
      echo "  --package-release Independent package release after the current milestone is complete"
      echo "  --preflight      Verify npm authentication without publishing"
      echo "  --force          Skip preliminary clean check (publication still requires a committed candidate)"
      echo "  -h, --help       Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   ArtemisKit Publishing Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Check prerequisites
echo -e "${YELLOW}[1/8] Checking prerequisites...${NC}"

# Accept the GitHub Actions convention first, while retaining the local
# NPM_API_KEY convention documented for maintainers.
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

NPM_AUTH_TOKEN="${NPM_TOKEN:-${NPM_API_KEY:-}}"
if [ -z "$NPM_AUTH_TOKEN" ]; then
  echo -e "${RED}Error: set NPM_TOKEN or NPM_API_KEY before publishing${NC}"
  exit 1
fi

echo -e "${GREEN}✓ npm publish token found${NC}"
setup_temporary_npm_config
run_npm_access_preflight

if [ "$PREFLIGHT_ONLY" = true ]; then
  echo -e "${GREEN}✓ Non-publishing preflight complete${NC}"
  exit 0
fi

# Check for clean git state
if [ "$FORCE" = false ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}Error: Working directory not clean. Commit or stash changes first.${NC}"
    echo "Use --force to override (not recommended)"
    exit 1
  fi
  echo -e "${GREEN}✓ Git working directory clean${NC}"
else
  echo -e "${YELLOW}⚠ Skipping git clean check (--force)${NC}"
fi

# Check we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${YELLOW}⚠ Warning: Not on main branch (current: $CURRENT_BRANCH)${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo -e "${GREEN}✓ On main branch${NC}"
fi

# Step 2: Install dependencies
echo ""
echo -e "${YELLOW}[2/8] Installing dependencies...${NC}"
bun install --frozen-lockfile
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 3: Run type checking
echo ""
echo -e "${YELLOW}[3/8] Running type check...${NC}"
bun run typecheck
echo -e "${GREEN}✓ Type check passed${NC}"

# Step 4: Run tests
if [ "$SKIP_TESTS" = false ]; then
  echo ""
  echo -e "${YELLOW}[4/8] Running tests...${NC}"
  bun test
  echo -e "${GREEN}✓ Tests passed${NC}"
else
  echo ""
  echo -e "${YELLOW}[4/8] Skipping tests (--skip-tests)${NC}"
fi

# Step 5: Run linting
echo ""
echo -e "${YELLOW}[5/8] Running linter...${NC}"
bun run lint
echo -e "${GREEN}✓ Linting passed${NC}"

# Step 6: Build all packages
echo ""
echo -e "${YELLOW}[6/8] Building packages...${NC}"
bun run build
echo -e "${GREEN}✓ Build completed${NC}"

# Step 7: Handle changesets
echo ""
echo -e "${YELLOW}[7/8] Processing changesets...${NC}"

# Check for pending changesets
PENDING_CHANGESETS=$(ls .changeset/*.md 2>/dev/null | grep -v README.md | wc -l | tr -d ' ')

if [ "$PUBLISH_ONLY" = true ]; then
  if [ "$PENDING_CHANGESETS" -ne 0 ]; then
    echo -e "${RED}Error: --publish-only requires no pending changesets${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Publish-only mode: using committed package versions${NC}"
elif [ "$SKIP_CHANGESET" = false ]; then
  if [ "$PENDING_CHANGESETS" -eq 0 ]; then
    if [ "${CI:-}" = "true" ]; then
      echo "No pending changesets found; CI will publish committed package versions."
    else
      echo "No pending changesets found. Creating one now..."
      echo ""
      bun run changeset

      # Check if changeset was created
      NEW_CHANGESETS=$(ls .changeset/*.md 2>/dev/null | grep -v README.md | wc -l | tr -d ' ')
      if [ "$NEW_CHANGESETS" -eq 0 ]; then
        echo -e "${YELLOW}No changeset created. Exiting.${NC}"
        exit 0
      fi
      PENDING_CHANGESETS=$NEW_CHANGESETS
    fi
  else
    echo -e "${GREEN}✓ Found $PENDING_CHANGESETS pending changeset(s)${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Skipping changeset creation (--skip-changeset)${NC}"
  if [ "$PENDING_CHANGESETS" -eq 0 ]; then
    echo -e "${RED}Error: No pending changesets and --skip-changeset specified${NC}"
    exit 1
  fi
fi

APPLY_VERSION_BUMPS=true
if [ "$PUBLISH_ONLY" = true ]; then
  APPLY_VERSION_BUMPS=false
elif [ "$PENDING_CHANGESETS" -eq 0 ] && [ "${CI:-}" = "true" ]; then
  # changesets/action calls the publish command after it has already committed
  # version changes. Never start an interactive changeset prompt in that path.
  APPLY_VERSION_BUMPS=false
  echo -e "${GREEN}✓ CI publish mode: using committed package versions${NC}"
fi

if [ "$APPLY_VERSION_BUMPS" = true ]; then
  # Apply version bumps
  echo ""
  echo "Applying version bumps..."
  bun run version

  # Show what changed
  echo ""
  echo -e "${BLUE}Version changes:${NC}"
  git diff --stat package.json packages/*/package.json packages/adapters/*/package.json 2>/dev/null || true

  # Commit only version/changelog files generated by Changesets. Release
  # automation must never sweep unrelated local work into a commit.
  if [ -n "$(git status --porcelain)" ]; then
    echo ""
    echo "Committing version changes..."
    git add .changeset bun.lock package.json packages/*/package.json packages/*/CHANGELOG.md \
      packages/adapters/*/package.json packages/adapters/*/CHANGELOG.md
    git commit -m "chore: version packages for release"
    echo -e "${GREEN}✓ Version changes committed${NC}"
    # Bundles may embed package versions. Build the final versioned candidate.
    bun run build
  fi
fi

# Immutable packing translates workspace dependencies without changing source manifests.
# The maintained publisher selects exact versions, records attempts, and waits for
# public availability before creating tags. Changesets remains the versioning tool.
PUBLICATION_ARGS=()
if [ "$PACKAGE_RELEASE" = true ]; then PUBLICATION_ARGS+=(--package-release); fi
if [ "$DRY_RUN" = true ]; then PUBLICATION_ARGS+=(--dry-run); fi
bun scripts/npm-publication.mjs "${PUBLICATION_ARGS[@]}"

if [ "$DRY_RUN" = false ]; then
  echo ""
  echo -e "${GREEN}✓ Packages published successfully!${NC}"

  # The publisher creates verified package/milestone tags. Only prompt when stdin is a
  # terminal; an unattended successful publication must still exit cleanly.
  echo ""
  if [ -t 0 ]; then
    read -p "Push commits and tags to origin? (y/N) " -n 1 -r || true
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git push origin main --follow-tags
      echo -e "${GREEN}✓ Pushed to origin${NC}"
    else
      echo -e "${YELLOW}Skipped push. Run 'git push origin main --follow-tags' manually.${NC}"
    fi
  else
    echo -e "${YELLOW}Non-interactive session: skipping git push.${NC}"
  fi
fi

echo ""
echo -e "${GREEN}========================================${NC}"
if [ "$DRY_RUN" = true ]; then
  echo -e "${GREEN}   Publication plan complete (dry run)${NC}"
else
  echo -e "${GREEN}   Publishing complete!${NC}"
fi
echo -e "${GREEN}========================================${NC}"
