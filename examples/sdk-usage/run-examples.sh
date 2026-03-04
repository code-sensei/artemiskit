#!/bin/bash
#
# run-examples.sh
#
# Script to run ArtemisKit SDK examples.
# 
# Usage:
#   ./run-examples.sh          # Run all examples
#   ./run-examples.sh basic    # Run specific example
#   ./run-examples.sh --help   # Show help
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Available examples
EXAMPLES=(
  "basic-run"
  "with-events"
  "redteam-example"
  "stress-example"
)

# Function to print usage
print_usage() {
  echo -e "${CYAN}ArtemisKit SDK Examples Runner${NC}"
  echo ""
  echo "Usage:"
  echo "  ./run-examples.sh              Run all examples sequentially"
  echo "  ./run-examples.sh <example>    Run a specific example"
  echo "  ./run-examples.sh --list       List available examples"
  echo "  ./run-examples.sh --help       Show this help message"
  echo ""
  echo "Available examples:"
  for example in "${EXAMPLES[@]}"; do
    echo "  - $example"
  done
  echo ""
  echo "Test framework examples:"
  echo "  - jest (run: npx jest jest-integration.test.ts)"
  echo "  - vitest (run: npx vitest run vitest-integration.test.ts)"
  echo ""
  echo "Environment:"
  echo "  Ensure OPENAI_API_KEY is set (or your provider's key)"
}

# Function to check prerequisites
check_prerequisites() {
  # Check for bun or tsx
  if command -v bun &> /dev/null; then
    RUNNER="bun run"
    echo -e "${GREEN}✓ Using bun${NC}"
  elif command -v tsx &> /dev/null; then
    RUNNER="tsx"
    echo -e "${GREEN}✓ Using tsx${NC}"
  elif command -v npx &> /dev/null; then
    RUNNER="npx tsx"
    echo -e "${YELLOW}! Using npx tsx (may be slower)${NC}"
  else
    echo -e "${RED}✗ Error: No TypeScript runner found${NC}"
    echo "  Please install bun (recommended) or tsx:"
    echo "    npm install -g bun"
    echo "    # or"
    echo "    npm install -g tsx"
    exit 1
  fi

  # Check for API key
  if [[ -z "${OPENAI_API_KEY}" && -z "${ANTHROPIC_API_KEY}" && -z "${AZURE_OPENAI_API_KEY}" ]]; then
    echo -e "${YELLOW}! Warning: No API key found in environment${NC}"
    echo "  Set OPENAI_API_KEY or your provider's key before running"
  fi
}

# Function to run a single example
run_example() {
  local example="$1"
  local file="${SCRIPT_DIR}/${example}.ts"
  
  if [[ ! -f "$file" ]]; then
    echo -e "${RED}✗ Example not found: ${example}${NC}"
    return 1
  fi
  
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}Running: ${example}${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  
  cd "$SCRIPT_DIR"
  if $RUNNER "$file"; then
    echo ""
    echo -e "${GREEN}✓ ${example} completed successfully${NC}"
    return 0
  else
    echo ""
    echo -e "${RED}✗ ${example} failed${NC}"
    return 1
  fi
}

# Function to run all examples
run_all() {
  local passed=0
  local failed=0
  local results=()
  
  echo -e "${CYAN}Running all ArtemisKit SDK examples...${NC}"
  
  for example in "${EXAMPLES[@]}"; do
    if run_example "$example"; then
      ((passed++))
      results+=("${GREEN}✓${NC} $example")
    else
      ((failed++))
      results+=("${RED}✗${NC} $example")
    fi
  done
  
  # Summary
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}Summary${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  for result in "${results[@]}"; do
    echo -e "  $result"
  done
  echo ""
  echo -e "  ${GREEN}Passed: $passed${NC}"
  echo -e "  ${RED}Failed: $failed${NC}"
  
  if [[ $failed -gt 0 ]]; then
    exit 1
  fi
}

# Main
main() {
  case "${1:-}" in
    --help|-h)
      print_usage
      exit 0
      ;;
    --list|-l)
      echo "Available examples:"
      for example in "${EXAMPLES[@]}"; do
        echo "  - $example"
      done
      exit 0
      ;;
    "")
      check_prerequisites
      run_all
      ;;
    *)
      # Run specific example
      check_prerequisites
      
      # Allow partial matching
      local matched=""
      for example in "${EXAMPLES[@]}"; do
        if [[ "$example" == *"$1"* ]]; then
          matched="$example"
          break
        fi
      done
      
      if [[ -n "$matched" ]]; then
        run_example "$matched"
      else
        echo -e "${RED}✗ Unknown example: $1${NC}"
        echo "  Use --list to see available examples"
        exit 1
      fi
      ;;
  esac
}

main "$@"
