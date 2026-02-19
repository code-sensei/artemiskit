#!/bin/bash
# run-owasp-tests.sh
# ==================
# Comprehensive OWASP LLM Top 10 security testing script
# 
# Usage:
#   ./run-owasp-tests.sh              # Run all tests
#   ./run-owasp-tests.sh quick        # Quick critical-only scan
#   ./run-owasp-tests.sh category LLM01  # Test specific category
#   ./run-owasp-tests.sh mutation bad-likert-judge  # Test specific mutation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCENARIO="$SCRIPT_DIR/scenarios/chatbot.yaml"
CLI="$REPO_ROOT/packages/cli/bin/artemis.ts"
REPORT_DIR="$SCRIPT_DIR/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Ensure report directory exists
mkdir -p "$REPORT_DIR"

# Print banner
print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║        ArtemisKit OWASP LLM Top 10 Security Testing         ║"
    echo "║                         v0.3.0                               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Print section header
section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}▸ $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Print success message
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Print warning message
warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Print error message
error() {
    echo -e "${RED}✗ $1${NC}"
}

# Run a single mutation test
test_mutation() {
    local mutation="$1"
    local description="$2"
    
    echo -e "\n${CYAN}Testing: ${mutation}${NC}"
    echo -e "  ${description}"
    
    if bun "$CLI" redteam "$SCENARIO" --mutations "$mutation" --count 3 -v; then
        success "Completed: $mutation"
    else
        warning "Test completed with findings: $mutation"
    fi
}

# Run category-based test
test_category() {
    local category="$1"
    local description="$2"
    
    echo -e "\n${CYAN}Testing OWASP Category: ${category}${NC}"
    echo -e "  ${description}"
    
    if bun "$CLI" redteam "$SCENARIO" --owasp "$category" --count 3 -v; then
        success "Completed: $category"
    else
        warning "Test completed with findings: $category"
    fi
}

# Test individual mutations
run_individual_mutations() {
    section "Individual Mutation Tests"
    
    echo "Testing each OWASP mutation individually..."
    
    # LLM01 - Prompt Injection
    test_mutation "bad-likert-judge" \
        "LLM01: Cognitive bias exploit using Likert scale evaluation"
    
    test_mutation "crescendo" \
        "LLM01: Multi-turn gradual escalation attack"
    
    test_mutation "deceptive-delight" \
        "LLM01: Emotional/contextual framing bypass"
    
    # LLM02 - Insecure Output Handling
    test_mutation "output-injection" \
        "LLM02: XSS, SQL injection, and command injection payloads"
    
    # LLM06 - Sensitive Information Disclosure
    test_mutation "system-extraction" \
        "LLM06: System prompt and configuration extraction"
    
    # LLM08 - Excessive Agency
    test_mutation "excessive-agency" \
        "LLM08: Unauthorized action and privilege escalation"
    
    # LLM09 - Misinformation
    test_mutation "hallucination-trap" \
        "LLM09: Misinformation and fabrication traps"
}

# Test OWASP categories
run_category_tests() {
    section "OWASP Category Tests"
    
    echo "Testing by OWASP LLM Top 10 category..."
    
    test_category "LLM01" "Prompt Injection"
    test_category "LLM02" "Insecure Output Handling"
    test_category "LLM06" "Sensitive Information Disclosure"
    test_category "LLM08" "Excessive Agency"
    test_category "LLM09" "Overreliance / Misinformation"
}

# Test multiple categories together
run_multi_category_tests() {
    section "Multi-Category Tests"
    
    echo -e "${CYAN}Testing LLM01 + LLM06 (Injection + Disclosure)${NC}"
    bun "$CLI" redteam "$SCENARIO" --owasp LLM01,LLM06 --count 2 -v || true
    
    echo -e "\n${CYAN}Testing LLM02 + LLM08 (Output + Agency)${NC}"
    bun "$CLI" redteam "$SCENARIO" --owasp LLM02,LLM08 --count 2 -v || true
}

# Run full OWASP compliance scan
run_full_scan() {
    section "Full OWASP Compliance Scan"
    
    echo "Running comprehensive scan with all testable OWASP mutations..."
    echo "This tests: LLM01, LLM02, LLM06, LLM08, LLM09"
    echo ""
    
    bun "$CLI" redteam "$SCENARIO" --owasp-full --count 5 -v \
        --export markdown --export-output "$REPORT_DIR" || true
    
    success "Full scan complete. Report saved to: $REPORT_DIR"
}

# Test severity filtering
run_severity_tests() {
    section "Severity-Based Tests"
    
    echo -e "${CYAN}Testing: Critical severity only${NC}"
    bun "$CLI" redteam "$SCENARIO" --owasp-full --min-severity critical --count 2 -v || true
    
    echo -e "\n${CYAN}Testing: High+ severity${NC}"
    bun "$CLI" redteam "$SCENARIO" --owasp-full --min-severity high --count 2 -v || true
    
    echo -e "\n${CYAN}Testing: Medium+ severity${NC}"
    bun "$CLI" redteam "$SCENARIO" --owasp-full --min-severity medium --count 2 -v || true
}

# Quick scan (critical only)
run_quick_scan() {
    section "Quick Security Scan (Critical Only)"
    
    echo "Running quick scan with critical severity attacks..."
    bun "$CLI" redteam "$SCENARIO" --owasp-full --min-severity critical --count 3 -v || true
    success "Quick scan complete"
}

# Generate reports
generate_reports() {
    section "Generating Reports"
    
    echo "Generating Markdown report..."
    bun "$CLI" redteam "$SCENARIO" --owasp-full --count 3 \
        --export markdown --export-output "$REPORT_DIR" || true
    
    echo -e "\nGenerating JUnit XML report..."
    bun "$CLI" redteam "$SCENARIO" --owasp-full --count 3 \
        --export junit --export-output "$REPORT_DIR" || true
    
    success "Reports saved to: $REPORT_DIR"
    ls -la "$REPORT_DIR"
}

# Print summary
print_summary() {
    section "Test Summary"
    
    echo "OWASP LLM Top 10 Categories Tested:"
    echo "  ✓ LLM01 - Prompt Injection (bad-likert-judge, crescendo, deceptive-delight)"
    echo "  ✓ LLM02 - Insecure Output Handling (output-injection)"
    echo "  ✓ LLM06 - Sensitive Information Disclosure (system-extraction)"
    echo "  ✓ LLM08 - Excessive Agency (excessive-agency)"
    echo "  ✓ LLM09 - Overreliance / Misinformation (hallucination-trap)"
    echo ""
    echo "  ✗ LLM03 - Training Data Poisoning (not testable via mutations)"
    echo "  ✗ LLM04 - Model DoS (use stress testing tools)"
    echo "  ✗ LLM05 - Supply Chain (use dependency scanning)"
    echo "  ✗ LLM07 - Insecure Plugin Design (requires integration testing)"
    echo "  ✗ LLM10 - Model Theft (requires access control testing)"
    echo ""
    echo -e "Reports directory: ${CYAN}$REPORT_DIR${NC}"
}

# Main execution
main() {
    print_banner
    
    # Check dependencies
    if ! command -v bun &> /dev/null; then
        error "bun is not installed. Please install bun first."
        exit 1
    fi
    
    if [ ! -f "$CLI" ]; then
        error "CLI not found at: $CLI"
        exit 1
    fi
    
    if [ ! -f "$SCENARIO" ]; then
        error "Scenario not found at: $SCENARIO"
        exit 1
    fi
    
    # Parse command line arguments
    case "${1:-all}" in
        "quick")
            run_quick_scan
            ;;
        "category")
            if [ -z "$2" ]; then
                error "Please specify a category (e.g., LLM01)"
                exit 1
            fi
            test_category "$2" "User-specified category test"
            ;;
        "mutation")
            if [ -z "$2" ]; then
                error "Please specify a mutation (e.g., bad-likert-judge)"
                exit 1
            fi
            test_mutation "$2" "User-specified mutation test"
            ;;
        "individual")
            run_individual_mutations
            ;;
        "categories")
            run_category_tests
            ;;
        "severity")
            run_severity_tests
            ;;
        "full")
            run_full_scan
            ;;
        "reports")
            generate_reports
            ;;
        "all"|*)
            run_individual_mutations
            run_category_tests
            run_multi_category_tests
            run_severity_tests
            run_full_scan
            generate_reports
            print_summary
            ;;
    esac
    
    echo ""
    success "Testing complete!"
}

# Run main function
main "$@"
