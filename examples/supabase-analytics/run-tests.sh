#!/bin/bash

# =============================================================================
# ArtemisKit Supabase Analytics - Test Runner
# =============================================================================
#
# This script runs all Supabase analytics examples.
#
# Prerequisites:
#   - Supabase project with schema applied (see setup.md)
#   - Environment variables set (SUPABASE_URL, SUPABASE_ANON_KEY)
#
# Usage:
#   ./run-tests.sh              # Run all tests
#   ./run-tests.sh case-results # Run specific test
#   ./run-tests.sh --help       # Show help
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_color() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Print header
print_header() {
    echo ""
    print_color "$BLUE" "═══════════════════════════════════════════════════════════════"
    print_color "$BLUE" "  $1"
    print_color "$BLUE" "═══════════════════════════════════════════════════════════════"
    echo ""
}

# Print success
print_success() {
    print_color "$GREEN" "✅ $1"
}

# Print error
print_error() {
    print_color "$RED" "❌ $1"
}

# Print warning
print_warning() {
    print_color "$YELLOW" "⚠️  $1"
}

# Show help
show_help() {
    cat << EOF
ArtemisKit Supabase Analytics - Test Runner

Usage:
    ./run-tests.sh [command]

Commands:
    all             Run all tests (default)
    case-results    Run case results tests
    baselines       Run baseline management tests
    metrics         Run metrics trending tests
    --help, -h      Show this help message

Environment Variables:
    SUPABASE_URL        Supabase project URL (required)
    SUPABASE_ANON_KEY   Supabase anonymous key (required)

Examples:
    ./run-tests.sh
    ./run-tests.sh baselines
    SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=xxx ./run-tests.sh

For setup instructions, see: setup.md
EOF
    exit 0
}

# Check environment variables
check_env() {
    local missing=0

    if [ -z "$SUPABASE_URL" ]; then
        print_warning "SUPABASE_URL is not set"
        missing=1
    fi

    if [ -z "$SUPABASE_ANON_KEY" ]; then
        print_warning "SUPABASE_ANON_KEY is not set"
        missing=1
    fi

    if [ $missing -eq 1 ]; then
        echo ""
        print_error "Missing required environment variables"
        echo ""
        echo "Set them before running:"
        echo "  export SUPABASE_URL=https://your-project.supabase.co"
        echo "  export SUPABASE_ANON_KEY=your-anon-key"
        echo ""
        echo "Or run with inline variables:"
        echo "  SUPABASE_URL=... SUPABASE_ANON_KEY=... ./run-tests.sh"
        exit 1
    fi

    print_success "Environment variables configured"
}

# Run a single test file
run_test() {
    local name=$1
    local file=$2

    print_header "Running: $name"

    if [ ! -f "$file" ]; then
        print_error "Test file not found: $file"
        return 1
    fi

    if bun run "$file"; then
        print_success "$name completed"
        return 0
    else
        print_error "$name failed"
        return 1
    fi
}

# Run all tests
run_all() {
    local failed=0

    run_test "Case Results Tests" "./test-case-results.ts" || ((failed++))
    run_test "Baseline Management Tests" "./test-baselines.ts" || ((failed++))
    run_test "Metrics Trending Tests" "./test-metrics-trending.ts" || ((failed++))

    echo ""
    print_header "Test Summary"

    if [ $failed -eq 0 ]; then
        print_success "All tests passed!"
    else
        print_error "$failed test(s) failed"
        exit 1
    fi
}

# Run case results tests
run_case_results() {
    run_test "Case Results Tests" "./test-case-results.ts"
}

# Run baseline tests
run_baselines() {
    run_test "Baseline Management Tests" "./test-baselines.ts"
}

# Run metrics tests
run_metrics() {
    run_test "Metrics Trending Tests" "./test-metrics-trending.ts"
}

# Main entry point
main() {
    print_header "ArtemisKit Supabase Analytics Tests"

    # Parse arguments
    case "${1:-all}" in
        --help|-h)
            show_help
            ;;
        all)
            check_env
            run_all
            ;;
        case-results)
            check_env
            run_case_results
            ;;
        baselines)
            check_env
            run_baselines
            ;;
        metrics)
            check_env
            run_metrics
            ;;
        *)
            print_error "Unknown command: $1"
            echo ""
            show_help
            ;;
    esac
}

main "$@"
