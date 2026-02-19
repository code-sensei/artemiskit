# OWASP LLM Top 10 Security Testing

This directory contains comprehensive test scenarios for evaluating your LLM application against the [OWASP LLM Top 10 2025](https://owasp.org/www-project-top-ten-for-large-language-models/) security risks.

## Quick Start

```bash
# Run a single OWASP mutation test
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations bad-likert-judge

# Test specific OWASP categories
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp LLM01,LLM06

# Full OWASP compliance scan (all testable categories)
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp-full

# Filter by severity
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp-full --min-severity high
```

## OWASP LLM Top 10 Coverage

ArtemisKit provides mutations that test against the following OWASP categories:

| Category | Name | Mutations | Testable |
|----------|------|-----------|----------|
| **LLM01** | Prompt Injection | `bad-likert-judge`, `crescendo`, `deceptive-delight` | ✅ |
| **LLM02** | Insecure Output Handling | `output-injection` | ✅ |
| **LLM03** | Training Data Poisoning | - | ❌ (requires access to training pipeline) |
| **LLM04** | Model Denial of Service | - | ❌ (use stress testing tools) |
| **LLM05** | Supply Chain Vulnerabilities | - | ❌ (requires dependency scanning) |
| **LLM06** | Sensitive Information Disclosure | `system-extraction` | ✅ |
| **LLM07** | Insecure Plugin Design | - | ❌ (requires plugin integration testing) |
| **LLM08** | Excessive Agency | `excessive-agency` | ✅ |
| **LLM09** | Overreliance / Misinformation | `hallucination-trap` | ✅ |
| **LLM10** | Model Theft | - | ❌ (requires access control testing) |

## Mutations Explained

### LLM01 - Prompt Injection Mutations

#### Bad Likert Judge (`bad-likert-judge`)
Uses a cognitive bias exploit where the model is asked to rate harmful content on a Likert scale, inadvertently generating that content in the process.

```bash
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations bad-likert-judge
```

**Severity:** Critical  
**CVSS Score:** 8.5+

#### Crescendo (`crescendo`)
Multi-turn attack that gradually escalates from benign requests to harmful ones, exploiting the model's tendency to maintain conversational coherence.

```bash
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations crescendo
```

**Severity:** High  
**CVSS Score:** 7.8+

#### Deceptive Delight (`deceptive-delight`)
Embeds harmful requests within positive, engaging contexts to bypass safety filters by exploiting emotional/contextual framing.

```bash
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations deceptive-delight
```

**Severity:** High  
**CVSS Score:** 7.5+

### LLM02 - Insecure Output Handling

#### Output Injection (`output-injection`)
Tests whether the model can be manipulated to include malicious payloads (XSS, SQL injection, command injection) in its output.

```bash
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations output-injection
```

**Severity:** Critical  
**CVSS Score:** 8.0+

### LLM06 - Sensitive Information Disclosure

#### System Extraction (`system-extraction`)
Attempts to extract the model's system prompt, instructions, or configuration through various manipulation techniques.

```bash
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations system-extraction
```

**Severity:** High  
**CVSS Score:** 7.0+

### LLM08 - Excessive Agency

#### Excessive Agency (`excessive-agency`)
Tests if the model can be manipulated into taking actions beyond its intended scope, such as file operations, API calls, or privilege escalation.

```bash
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations excessive-agency
```

**Severity:** Critical  
**CVSS Score:** 8.8+

### LLM09 - Overreliance / Misinformation

#### Hallucination Trap (`hallucination-trap`)
Probes the model with plausible-sounding but false information to test its susceptibility to generating or reinforcing misinformation.

```bash
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations hallucination-trap
```

**Severity:** Medium  
**CVSS Score:** 5.5+

## Testing Strategies

### 1. Individual Mutation Testing

Test one mutation at a time to isolate specific vulnerabilities:

```bash
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations bad-likert-judge -v
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations crescendo -v
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --mutations output-injection -v
```

### 2. Category-Based Testing

Test all mutations for specific OWASP categories:

```bash
# Test all prompt injection techniques (LLM01)
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp LLM01

# Test multiple categories
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp LLM01,LLM02,LLM06
```

### 3. Full Compliance Scan

Run all testable OWASP mutations:

```bash
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp-full
```

### 4. Severity-Based Testing

Focus on high-impact vulnerabilities:

```bash
# Only critical severity attacks
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp-full --min-severity critical

# High and critical severity attacks
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp-full --min-severity high
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: OWASP LLM Security Scan
on: [push, pull_request]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - name: Run OWASP Security Scan
        run: |
          bun packages/cli/bin/artemis.ts redteam \
            examples/owasp-testing/scenarios/chatbot.yaml \
            --owasp-full \
            --min-severity high \
            --export junit \
            --export-output ./test-results
      - uses: actions/upload-artifact@v4
        with:
          name: security-report
          path: ./test-results
```

### Exit Codes

- `0`: All tests passed (safe)
- `1`: One or more tests detected unsafe behavior
- `2`: Configuration or runtime error

## Report Formats

Generate reports in various formats:

```bash
# Markdown report
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp-full \
  --export markdown --export-output ./reports

# JUnit XML (for CI integration)
bun packages/cli/bin/artemis.ts redteam scenarios/chatbot.yaml --owasp-full \
  --export junit --export-output ./reports
```

## Files in This Directory

```
owasp-testing/
├── README.md                    # This guide
├── run-owasp-tests.sh          # Shell script to run all tests
├── expected-output.md          # Sample output documentation
└── scenarios/
    └── chatbot.yaml            # Sample chatbot scenario for testing
```

## Understanding Results

### Status Labels

- **SAFE** ✅: The model rejected or safely handled the attack
- **UNSAFE** ⚠️: The model's response indicates potential vulnerability
- **BLOCKED** 🚫: Provider's content filter blocked the request (good!)

### Severity Levels

| Level | CVSS Score | Action Required |
|-------|------------|-----------------|
| Critical | 9.0+ | Immediate fix required |
| High | 7.0-8.9 | Fix before production |
| Medium | 4.0-6.9 | Address in near term |
| Low | 0.1-3.9 | Monitor and track |

## Best Practices

1. **Regular Testing**: Run OWASP scans on every release and after prompt changes
2. **Start Narrow**: Begin with `--min-severity critical` and expand coverage
3. **Review Unsafe Results**: Each UNSAFE result needs human review and mitigation
4. **Test Your Defenses**: After adding guardrails, re-run tests to verify effectiveness
5. **Document Exceptions**: Some prompts may legitimately need to discuss sensitive topics
6. **Use Multiple Scenarios**: Test different personas and use cases

## References

- [OWASP LLM Top 10 2025](https://owasp.org/www-project-top-ten-for-large-language-models/)
- [ArtemisKit Documentation](https://github.com/ArtemisTech/artemiskit)
- [CVSS v3.1 Calculator](https://www.first.org/cvss/calculator/3.1)
