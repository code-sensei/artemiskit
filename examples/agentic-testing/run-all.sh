#!/usr/bin/env bash
#
# ArtemisKit Agentic Testing - Run All Tests
#
# This script runs all agentic adapter test scenarios.
#
# Usage:
#   ./run-all.sh           # Run all tests
#   ./run-all.sh langchain # Run only LangChain tests
#   ./run-all.sh deepagents # Run only DeepAgents tests
#   ./run-all.sh --verbose # Run with verbose output
#   ./run-all.sh --report  # Generate HTML reports

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI_PATH="$REPO_ROOT/packages/cli/bin/artemis.ts"

# Default options
VERBOSE=""
REPORT=""
TARGET="all"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        langchain|deepagents)
            TARGET="$1"
            shift
            ;;
        --verbose|-v)
            VERBOSE="--verbose"
            shift
            ;;
        --report|-r)
            REPORT="--report html"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [langchain|deepagents] [--verbose] [--report]"
            echo ""
            echo "Options:"
            echo "  langchain    Run only LangChain adapter tests"
            echo "  deepagents   Run only DeepAgents adapter tests"
            echo "  --verbose    Enable verbose output"
            echo "  --report     Generate HTML reports"
            echo "  --help       Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if CLI exists
if [[ ! -f "$CLI_PATH" ]]; then
    echo -e "${RED}Error: ArtemisKit CLI not found at $CLI_PATH${NC}"
    echo "Please run 'bun install' from the repository root first."
    exit 1
fi

# Print header
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     ArtemisKit Agentic Adapter Test Suite             ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Track results
TOTAL=0
PASSED=0
FAILED=0

# Function to run a test scenario
run_test() {
    local scenario="$1"
    local provider="$2"
    local name="$3"
    
    TOTAL=$((TOTAL + 1))
    
    echo -e "${YELLOW}Running:${NC} $name"
    echo "  Scenario: $scenario"
    echo "  Provider: $provider"
    
    # Build report output path if needed
    local report_args=""
    if [[ -n "$REPORT" ]]; then
        local report_name=$(basename "$scenario" .yaml)
        report_args="$REPORT --output $SCRIPT_DIR/reports/${provider}-${report_name}.html"
        mkdir -p "$SCRIPT_DIR/reports"
    fi
    
    # Run the test
    if bun "$CLI_PATH" run "$scenario" --provider "$provider" $VERBOSE $report_args; then
        echo -e "  ${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# Function to run TypeScript test files
run_ts_test() {
    local test_file="$1"
    local name="$2"
    
    TOTAL=$((TOTAL + 1))
    
    echo -e "${YELLOW}Running:${NC} $name"
    echo "  File: $test_file"
    
    if bun "$test_file"; then
        echo -e "  ${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# Run LangChain tests
run_langchain_tests() {
    echo -e "${BLUE}═══ LangChain Adapter Tests ═══${NC}"
    echo ""
    
    # TypeScript tests (programmatic)
    if [[ -f "$SCRIPT_DIR/langchain/test-chain.ts" ]]; then
        run_ts_test "$SCRIPT_DIR/langchain/test-chain.ts" "LangChain Chain Test"
    fi
    
    if [[ -f "$SCRIPT_DIR/langchain/test-agent.ts" ]]; then
        run_ts_test "$SCRIPT_DIR/langchain/test-agent.ts" "LangChain Agent Test"
    fi
    
    # YAML scenario tests
    if [[ -f "$SCRIPT_DIR/langchain/scenarios/chain-eval.yaml" ]]; then
        run_test "$SCRIPT_DIR/langchain/scenarios/chain-eval.yaml" "langchain" "LangChain Chain Evaluation Scenarios"
    fi
}

# Run DeepAgents tests
run_deepagents_tests() {
    echo -e "${BLUE}═══ DeepAgents Adapter Tests ═══${NC}"
    echo ""
    
    # TypeScript tests (programmatic)
    if [[ -f "$SCRIPT_DIR/deepagents/test-multi-agent.ts" ]]; then
        run_ts_test "$SCRIPT_DIR/deepagents/test-multi-agent.ts" "DeepAgents Multi-Agent Test"
    fi
    
    # YAML scenario tests
    if [[ -f "$SCRIPT_DIR/deepagents/scenarios/multi-agent-eval.yaml" ]]; then
        run_test "$SCRIPT_DIR/deepagents/scenarios/multi-agent-eval.yaml" "deepagents" "DeepAgents Multi-Agent Evaluation Scenarios"
    fi
}

# Main execution
cd "$REPO_ROOT"

case $TARGET in
    langchain)
        run_langchain_tests
        ;;
    deepagents)
        run_deepagents_tests
        ;;
    all)
        run_langchain_tests
        run_deepagents_tests
        ;;
esac

# Print summary
echo -e "${BLUE}═══ Test Summary ═══${NC}"
echo ""
echo "Total:  $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. See output above for details.${NC}"
    exit 1
fi
