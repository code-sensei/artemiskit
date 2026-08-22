# ArtemisKit Examples

Comprehensive examples demonstrating ArtemisKit's testing, security, and performance capabilities.

## Quick Navigation

| Folder | Focus | Best For |
|--------|-------|----------|
| [01-getting-started](./01-getting-started/) | First steps | New users |
| [02-scenarios](./02-scenarios/) | Evaluators & assertions | Quality testing |
| [03-redteam](./03-redteam/) | Security testing | Security engineers |
| [04-stress](./04-stress/) | Load & performance | DevOps/SRE |
| [05-sdk](./05-sdk/) | Programmatic API | Developers |
| [06-guardian](./06-guardian/) | Runtime protection | Production apps |
| [07-agentic](./07-agentic/) | LangChain/DeepAgents | Agent testing |
| [08-configuration](./08-configuration/) | Config patterns | Setup & deployment |
| [09-ci-cd](./09-ci-cd/) | Pipeline integration | Automation |
| [10-hooks-and-extensions](./10-hooks-and-extensions/) | Customization | Advanced users |
| [11-ling-api](./11-ling-api/) | Native Ling API workflows | Ling Studio users |
| [agent-evaluation](./agent-evaluation/) | Real tool-using agent evaluation | Agent builders |
| [use-cases](./use-cases/) | Role & industry specific | Targeted solutions |

## Directory Structure

```
examples/
├── 01-getting-started/        # Your first ArtemisKit tests
│   └── scenarios/
│       ├── hello-world.yaml
│       ├── basic-assertions.yaml
│       └── with-variables.yaml
│
├── 02-scenarios/              # Comprehensive scenario patterns
│   ├── evaluators/            # Each evaluator type
│   │   ├── exact.yaml
│   │   ├── contains.yaml
│   │   ├── regex.yaml
│   │   ├── fuzzy.yaml
│   │   ├── json-schema.yaml
│   │   ├── llm-grader.yaml
│   │   ├── similarity.yaml
│   │   └── combined.yaml
│   ├── variables/             # Variable substitution patterns
│   └── advanced/              # Complex scenarios
│       ├── multi-turn.yaml
│       ├── conditional.yaml
│       └── data-driven.yaml
│
├── 03-redteam/                # Security & adversarial testing
│   ├── attacks/               # Attack category examples
│   │   ├── prompt-injection.yaml
│   │   ├── jailbreak.yaml
│   │   ├── data-extraction.yaml
│   │   └── role-spoofing.yaml
│   ├── mutations/             # Attack mutations
│   │   ├── encoding.yaml      # Base64, ROT13, hex, unicode
│   │   └── multi-turn.yaml    # Multi-message attacks
│   └── custom/                # Custom attack definitions
│       └── custom-attacks.yaml
│
├── 04-stress/                 # Load & performance testing
│   ├── basic-load.yaml        # Simple load test
│   └── ramp-up-pattern.yaml   # Gradual scaling
│
├── 05-sdk/                    # Programmatic SDK usage
│   ├── basic/                 # Core SDK examples
│   │   ├── run-usage.ts
│   │   ├── redteam-usage.ts
│   │   ├── stress-usage.ts
│   │   └── event-handling.ts
│   ├── testing-frameworks/    # Test framework integration
│   │   ├── jest-example.ts
│   │   └── vitest-example.ts
│   ├── assertions/            # Custom matchers
│   └── scenarios/             # Scenario definitions
│
├── 06-guardian/               # Runtime protection mode
│   ├── express-integration.ts
│   ├── fastify-integration.ts
│   └── standalone.ts
│
├── 07-agentic/                # Agent framework testing
│   ├── langchain/
│   │   └── scenarios/
│   └── deepagents/
│       └── scenarios/
│
├── 08-configuration/          # Configuration patterns
│   ├── basic.yaml
│   ├── multi-provider.yaml
│   ├── ci-optimized.yaml
│   └── supabase-storage.yaml
│
├── 09-ci-cd/                  # Pipeline integration
│   ├── github-actions/
│   │   └── artemis-workflow.yml
│   ├── gitlab-ci/
│   │   └── .gitlab-ci.yml
│   └── jenkins/
│       └── Jenkinsfile
│
├── 10-hooks-and-extensions/   # Advanced customization
│   ├── hooks/
│   │   ├── slack-notification.js
│   │   └── custom-metrics.js
│   └── adapters/
│       └── custom-provider.ts
│
└── use-cases/                 # Audience-specific examples
    ├── by-role/
    │   ├── ml-engineer/
    │   │   └── quality-gate.yaml
    │   ├── security-engineer/
    │   │   └── red-team-suite.yaml
    │   ├── qa-engineer/
    │   │   └── regression-suite.yaml
    │   └── devops-sre/
    │       └── performance-baseline.yaml
    ├── by-industry/
    │   ├── healthcare/
    │   │   └── clinical-safety.yaml
    │   └── fintech/
    │       └── compliance-testing.yaml
    └── by-application/
        └── (chatbot, rag, code-gen examples)
```

## Quick Start

### Run Your First Test

```bash
# Basic hello world
akit run examples/01-getting-started/scenarios/hello-world.yaml

# See how evaluators work
akit run examples/02-scenarios/evaluators/
```

### Security Testing

```bash
# Red team with default attacks
akit redteam --prompt "You are a helpful assistant"

# Run attack scenarios
akit run examples/03-redteam/attacks/

# Test specific mutations
akit redteam --prompt "..." --mutations encoding,multi_turn
```

### Performance Testing

```bash
# Basic load test
akit stress --prompt "Hello" --iterations 100

# Ramp-up pattern
akit stress --scenario examples/04-stress/ramp-up-pattern.yaml
```

### SDK Integration

```typescript
import { ArtemisKit } from '@artemiskit/sdk';

const kit = new ArtemisKit({
  provider: 'openai',
  model: 'gpt-4',
});

// Run evaluation
const results = await kit.run({
  scenario: './scenarios/my-test.yaml',
});

// Use with Jest/Vitest
expect(results).toPassAllCases();
expect(results).toHaveSuccessRate(0.95);
```

## Examples by Feature

### 01 - Getting Started

Start here if you're new to ArtemisKit.

| File | Description |
|------|-------------|
| `hello-world.yaml` | Simplest possible test |
| `basic-assertions.yaml` | Contains, exact, regex |
| `with-variables.yaml` | Template variable substitution |

### 02 - Scenarios & Evaluators

Master the different ways to evaluate LLM responses.

| Evaluator | Use Case |
|-----------|----------|
| `exact` | Precise string matching |
| `contains` | Keyword presence |
| `regex` | Pattern matching |
| `fuzzy` | Similarity tolerance |
| `json-schema` | Structured output |
| `llm-grader` | AI-powered judgment |
| `similarity` | Semantic comparison |
| `combined` | AND/OR logic |

### 03 - Red Team Security

Test your LLM's defenses against adversarial attacks.

| Category | Tests |
|----------|-------|
| Injection | Direct/indirect prompt injection |
| Jailbreak | Roleplay, DAN, hypothetical scenarios |
| Extraction | System prompt, training data leaks |
| Spoofing | Authority impersonation |

**Mutations**: Base64, ROT13, hex encoding, unicode obfuscation, multi-turn conversations.

### 04 - Stress Testing

Measure performance under load.

| Pattern | Description |
|---------|-------------|
| Basic load | Fixed concurrency, iterations |
| Ramp-up | Gradual scaling to target |
| Sustained | Long-duration stability |

**Metrics**: p50/p90/p95/p99 latency, throughput (RPS), error rate, token usage.

### 05 - SDK Usage

Programmatic integration for advanced workflows.

- **Basic**: Run, redteam, stress from code
- **Events**: Real-time progress tracking
- **Matchers**: Jest/Vitest custom assertions
- **Frameworks**: Test runner integration

### 06 - Guardian Mode

Runtime protection for production applications.

```typescript
import { Guardian } from '@artemiskit/guardian';

const guardian = new Guardian({
  mode: 'block',  // or 'log', 'shadow'
});

// Protect your endpoint
app.post('/chat', guardian.middleware(), handler);
```

### 07 - Agentic Testing

Test agent frameworks like LangChain and DeepAgents.

```yaml
provider: langchain
langchain_config:
  chain_type: conversational
  memory: true
  tools: ['calculator', 'search']
```

### 08 - Configuration

Configuration patterns for different environments.

| Config | Use Case |
|--------|----------|
| `basic.yaml` | Local development |
| `multi-provider.yaml` | A/B testing providers |
| `ci-optimized.yaml` | Fast CI pipelines |
| `supabase-storage.yaml` | Cloud result storage |

### 09 - CI/CD Integration

Automated quality gates in your pipeline.

- **GitHub Actions**: On PR, on push, scheduled
- **GitLab CI**: Pipeline stages, artifacts
- **Jenkins**: Declarative pipeline

### 10 - Hooks & Extensions

Customize ArtemisKit behavior.

- **Pre-run hooks**: Setup, validation
- **Post-run hooks**: Notifications, metrics
- **Custom adapters**: New providers

## Use Cases by Audience

### By Role

| Role | Example | Focus |
|------|---------|-------|
| ML Engineer | `quality-gate.yaml` | Pre-deployment validation |
| Security Engineer | `red-team-suite.yaml` | OWASP LLM Top 10 |
| QA Engineer | `regression-suite.yaml` | Functional regression |
| DevOps/SRE | `performance-baseline.yaml` | Latency/throughput |

### By Industry

| Industry | Example | Compliance |
|----------|---------|------------|
| Healthcare | `clinical-safety.yaml` | HIPAA, FDA AI guidance |
| Fintech | `compliance-testing.yaml` | SOX, SEC, Fair Lending |

## Running Examples

### Prerequisites

```bash
# Install ArtemisKit
bun add -g @artemiskit/cli

# Set your API key
export OPENAI_API_KEY=sk-...
```

### Commands

```bash
# Run single scenario
akit run examples/01-getting-started/scenarios/hello-world.yaml

# Run directory of scenarios
akit run examples/02-scenarios/evaluators/

# Run with different provider
akit run examples/... --provider anthropic --model claude-3-opus

# Run in parallel
akit run examples/... --parallel

# Filter by tags
akit run examples/... --tags "smoke,critical"

# Save results
akit run examples/... --save

# Generate HTML report
akit report --latest
```

## Contributing Examples

1. Follow naming conventions: `feature-name.yaml`
2. Include descriptive comments in YAML
3. Test with multiple providers if possible
4. Add entry to this README
5. Include expected results in comments

## Learn More

- [CLI Documentation](https://artemiskit.vercel.app/cli)
- [Scenario Format](https://artemiskit.vercel.app/cli/scenarios/format)
- [Evaluator Reference](https://artemiskit.vercel.app/cli/scenarios/expectations)
- [SDK Documentation](https://artemiskit.vercel.app/sdk)
