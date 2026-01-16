#!/usr/bin/env bash
#
# ArtemisKit Publishing Script
#
# Usage: ./scripts/publish.sh [--dry-run] [--skip-tests] [--skip-changeset]
#
# Prerequisites:
#   - NPM_API_KEY in .env file
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
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
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
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      echo "Usage: ./scripts/publish.sh [options]"
      echo ""
      echo "Options:"
      echo "  --dry-run        Run without actually publishing"
      echo "  --skip-tests     Skip running tests"
      echo "  --skip-changeset Skip changeset creation (use existing)"
      echo "  --force          Continue even with uncommitted changes"
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

# Check if .env exists and has NPM_API_KEY
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found${NC}"
  exit 1
fi

if ! grep -q "NPM_API_KEY" .env; then
  echo -e "${RED}Error: NPM_API_KEY not found in .env${NC}"
  exit 1
fi

# Load environment variables
set -a
source .env
set +a

if [ -z "$NPM_API_KEY" ]; then
  echo -e "${RED}Error: NPM_API_KEY is empty${NC}"
  exit 1
fi

echo -e "${GREEN}✓ NPM_API_KEY found${NC}"

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
bun install
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

if [ "$SKIP_CHANGESET" = false ]; then
  if [ "$PENDING_CHANGESETS" -eq 0 ]; then
    echo "No pending changesets found. Creating one now..."
    echo ""
    bun run changeset

    # Check if changeset was created
    NEW_CHANGESETS=$(ls .changeset/*.md 2>/dev/null | grep -v README.md | wc -l | tr -d ' ')
    if [ "$NEW_CHANGESETS" -eq 0 ]; then
      echo -e "${YELLOW}No changeset created. Exiting.${NC}"
      exit 0
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

# Apply version bumps
echo ""
echo "Applying version bumps..."
bun run version

# Show what changed
echo ""
echo -e "${BLUE}Version changes:${NC}"
git diff --stat package.json packages/*/package.json packages/adapters/*/package.json 2>/dev/null || true

# Commit version changes if there are any
if [ -n "$(git status --porcelain)" ]; then
  echo ""
  echo "Committing version changes..."
  git add -A
  git commit -m "chore: version packages for release"
  echo -e "${GREEN}✓ Version changes committed${NC}"
fi

# Step 8: Publish
echo ""
echo -e "${YELLOW}[8/8] Publishing to npm...${NC}"

# Configure npm with token
npm config set //registry.npmjs.org/:_authToken=$NPM_API_KEY

# Verify npm authentication
echo "Verifying npm authentication..."
NPM_USER=$(npm whoami 2>/dev/null || echo "")
if [ -z "$NPM_USER" ]; then
  echo -e "${RED}Error: npm authentication failed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Authenticated as: $NPM_USER${NC}"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${YELLOW}=== DRY RUN MODE ===${NC}"
  echo "Would publish the following packages:"
  echo ""

  # List packages that would be published
  for pkg in packages/core packages/adapters/openai packages/adapters/anthropic packages/adapters/vercel-ai packages/redteam packages/reports packages/cli; do
    if [ -f "$pkg/package.json" ]; then
      PKG_NAME=$(grep '"name"' "$pkg/package.json" | head -1 | sed 's/.*: "\(.*\)".*/\1/')
      PKG_VERSION=$(grep '"version"' "$pkg/package.json" | head -1 | sed 's/.*: "\(.*\)".*/\1/')
      echo "  - $PKG_NAME@$PKG_VERSION"
    fi
  done

  echo ""
  echo -e "${YELLOW}Run without --dry-run to actually publish${NC}"
else
  # Actually publish
  echo ""
  changeset publish

  echo ""
  echo -e "${GREEN}✓ Packages published successfully!${NC}"

  # Create git tag
  echo ""
  echo "Creating git tags..."

  # Push commits and tags
  echo ""
  read -p "Push commits and tags to origin? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin main --follow-tags
    echo -e "${GREEN}✓ Pushed to origin${NC}"
  else
    echo -e "${YELLOW}Skipped push. Run 'git push origin main --follow-tags' manually.${NC}"
  fi
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Publishing complete!${NC}"
echo -e "${GREEN}========================================${NC}"
